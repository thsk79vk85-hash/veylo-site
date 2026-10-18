-- Website-only additive lifecycle metadata. No import, withdrawal, delivery,
-- fencing transition or data minimization is performed by this migration.
begin;

alter table public.signup_requests
 add column if not exists registration_origin text not null default 'current_form',
 add column if not exists consent_status text not null default 'recorded',
 add column if not exists withdrawn_at timestamptz,
 add column if not exists launch_match text,
 add column if not exists launch_token_nonce uuid,
 add column if not exists launch_unsubscribe_hash text,
 add column if not exists delivery_template_version text;
alter table public.signup_requests alter column consent_version drop default,
 alter column consent_version drop not null;

do $$ begin
 if not exists(select 1 from pg_constraint where conrelid='public.signup_requests'::regclass and conname='signup_launch_lifecycle_contract') then
  alter table public.signup_requests add constraint signup_launch_lifecycle_contract check (
   registration_origin in ('current_form','legacy_api','legacy_import')
   and consent_status in ('recorded','unknown')
   and ((consent_status='recorded' and consent_version is not null)
     or (consent_status='unknown' and consent_version is null and intent='launch'
       and registration_origin in ('legacy_api','legacy_import')))
   and (launch_match is null or launch_match ~ '^[0-9a-f]{64}$')
   and (launch_unsubscribe_hash is null or launch_unsubscribe_hash ~ '^[0-9a-f]{64}$')
   and (intent='launch' or (withdrawn_at is null and launch_match is null
     and launch_token_nonce is null and launch_unsubscribe_hash is null
     and delivery_template_version is null))
  );
 end if;
end $$;

create schema if not exists private;
revoke all on schema private from public,anon,authenticated;
grant usage on schema private to service_role;

create table if not exists private.launch_legacy_provenance (
 legacy_id uuid primary key,
 legacy_created_at timestamptz not null,
 signup_id uuid references public.signup_requests(id),
 launch_match text not null check(launch_match ~ '^[0-9a-f]{64}$'),
 outcome text not null check(outcome in ('registered','suppressed','review')),
 check(signup_id is not null or outcome='suppressed')
);
create table if not exists private.launch_suppressions (
 launch_match text primary key check(launch_match ~ '^[0-9a-f]{64}$'),
 withdrawn_at timestamptz not null,
 basis text not null check(length(trim(basis))>0)
);
create table if not exists private.launch_list_control (
 singleton boolean primary key default true check(singleton),
 mode text not null default 'transition' check(mode in ('transition','fenced','canonical')),
 fence_epoch bigint not null default 0 check(fence_epoch>=0)
);
insert into private.launch_list_control(singleton) values(true) on conflict(singleton) do nothing;

create or replace function private.guard_launch_fence_epoch()
returns trigger language plpgsql security invoker set search_path=pg_catalog as $$
begin
 if new.fence_epoch<old.fence_epoch then
  raise exception 'launch fence epoch cannot decrease' using errcode='23514';
 end if;
 return new;
end $$;
revoke all on function private.guard_launch_fence_epoch() from public,anon,authenticated;
create or replace trigger launch_fence_epoch_monotonic
before update on private.launch_list_control
for each row execute function private.guard_launch_fence_epoch();

create table if not exists private.launch_withdrawal_receipts (
 token_hash text primary key check(token_hash ~ '^[0-9a-f]{64}$'),
 launch_match text not null check(launch_match ~ '^[0-9a-f]{64}$'),
 withdrawn_at timestamptz not null
);
comment on table private.launch_withdrawal_receipts is
 'Hash-only receipts allow repeated valid-link withdrawals after raw-row minimization. Retain while the link is usable or suppression must be honored; review/minimize when those obligations end. No perpetual retention promise and no automated purge in this migration.';
comment on column public.signup_requests.launch_match is
 'Server-keyed 64-hex email match; never an address or unkeyed address digest.';
comment on column public.signup_requests.launch_unsubscribe_hash is
 'SHA-256 of opaque address-free unsubscribe token; never the raw token. Grants no account or beta access.';
comment on table private.launch_list_control is
 'Future launch RPC lock order: outer pg_advisory_xact_lock(hashtextextended(''launch-list-fence'',0)), then existing signup-ip: hash lock where applicable, then existing signup-email: hash lock. Task 1 leaves v1 writer semantics unchanged.';

alter table private.launch_legacy_provenance enable row level security;
alter table private.launch_suppressions enable row level security;
alter table private.launch_list_control enable row level security;
alter table private.launch_withdrawal_receipts enable row level security;
revoke all on private.launch_legacy_provenance,private.launch_suppressions,
 private.launch_list_control,private.launch_withdrawal_receipts from public,anon,authenticated;
grant select,insert,update,delete on private.launch_legacy_provenance,
 private.launch_suppressions,private.launch_withdrawal_receipts to service_role;
-- Prevent service writers from deleting/resetting the singleton epoch.
revoke all on private.launch_list_control from service_role;
grant select,update on private.launch_list_control to service_role;

-- Exact v1 behavior retained. The sole body change explicitly records the
-- existing consent version because unknown legacy evidence must have no default.
create or replace function public.claim_signup_v1(p_email text,p_intent text,p_platform text,p_source text,p_ip_hash text)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare r public.signup_requests; token uuid;
begin
 if p_email is null or p_email<>lower(trim(p_email)) or length(p_email)>254 or p_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or p_intent not in ('beta','launch') or p_platform not in ('ios','android','unspecified') or (p_intent='beta' and p_platform='unspecified') or p_source not in ('direct','instagram','qut-club','campus-poster','friend-invite') or p_ip_hash is null or length(p_ip_hash)<>64 then
  raise exception 'invalid signup' using errcode='22023';
 end if;
 -- Transaction-scoped locks serialize per-IP rate checks and per-email claims.
 perform pg_advisory_xact_lock(hashtextextended('signup-ip:'||p_ip_hash,0));
 delete from public.signup_rate_events where created_at<now()-interval '1 day';
 if (select count(*) from public.signup_rate_events where ip_hash=p_ip_hash and created_at>now()-interval '10 minutes')>=10 then
  return jsonb_build_object('limited',true);
 end if;
 insert into public.signup_rate_events(ip_hash) values(p_ip_hash);
 perform pg_advisory_xact_lock(hashtextextended('signup-email:'||p_email,0));
 select * into r from public.signup_requests where email=p_email and intent=p_intent and (p_intent='launch' or platform=p_platform) for update;
 if not found then
  insert into public.signup_requests(email,intent,platform,source,consent_version) values(p_email,p_intent,p_platform,p_source,'2026-10-11-v1') returning * into r;
 end if;
 if p_intent='launch' then
  insert into public.waitlist(email) values(p_email) on conflict(email) do nothing;
 end if;
 if r.delivery_state='sent' then
  return jsonb_build_object('id',r.id,'send',false,'delivery','sent');
 end if;
 if r.delivery_state in ('sending','pending') and r.delivery_attempted_at>now()-interval '5 minutes' then
  return jsonb_build_object('id',r.id,'send',false,'delivery','pending');
 end if;
 -- Resend retains idempotency for 24h. Never automatically retry an uncertain old send.
 if r.delivery_state='review' or (r.delivery_first_attempt_at is not null and r.delivery_first_attempt_at<now()-interval '23 hours' and r.delivery_state in ('sending','pending')) then
  update public.signup_requests set delivery_state='review' where id=r.id;
  return jsonb_build_object('id',r.id,'send',false,'delivery','review');
 end if;
 if r.delivery_state='failed' and r.delivery_attempted_at>now()-interval '5 minutes' then
  return jsonb_build_object('id',r.id,'send',false,'delivery','failed');
 end if;
 token:=gen_random_uuid();
 update public.signup_requests set delivery_state='sending',delivery_token=token,delivery_attempted_at=now(),delivery_first_attempt_at=case when delivery_state='disabled' then now() else coalesce(delivery_first_attempt_at,now()) end where id=r.id;
 return jsonb_build_object('id',r.id,'token',token,'send',true,'delivery','pending');
end $$;
revoke all on function public.claim_signup_v1(text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.claim_signup_v1(text,text,text,text,text) to service_role;

-- Hash lookup must identify one launch row. No raw token is persisted.
create unique index if not exists signup_launch_unsubscribe_identity
 on public.signup_requests(launch_unsubscribe_hash)
 where intent='launch' and launch_unsubscribe_hash is not null;

-- Delivery metadata is private, hash-only, and never attached to beta rows.
-- handoff_token survives withdrawal so a late provider result can be recorded.
create table if not exists private.launch_delivery_guard (
 signup_id uuid primary key references public.signup_requests(id),
 fence_epoch bigint not null,
 payload_hash text check(payload_hash ~ '^[0-9a-f]{64}$'),
 handoff_token uuid,
 handoff_at timestamptz,
 settled boolean not null default false
);
-- The latest handoff is distinct from a later, still-unsent retry lease.
-- Nullable additions preserve existing terminal proof; never backfill outcomes.
alter table private.launch_delivery_guard
 add column if not exists claim_token uuid,
 add column if not exists handoff_state text check(handoff_state in ('sent','failed','pending')),
 add column if not exists claim_outcome text check(claim_outcome in ('disabled','cancelled')),
 add column if not exists claim_finished_at timestamptz;
do $$ begin
 if not exists(select 1 from pg_constraint where conrelid='private.launch_delivery_guard'::regclass and conname='launch_unsent_outcome_contract') then
  alter table private.launch_delivery_guard add constraint launch_unsent_outcome_contract
   check((claim_outcome is null and claim_finished_at is null)
    or (claim_outcome is not null and claim_finished_at is not null and claim_token is not null));
 end if;
end $$;
comment on column private.launch_delivery_guard.claim_token is
 'Current unsent lease identity, separate from latest provider handoff; retained after explicit disabled completion or cancellation. No email/link capability.';
comment on column private.launch_delivery_guard.handoff_state is
 'Recorded latest handoff result, including pending uncertainty; never cleared by an unsent retry. Null for pre-addition proof; no synthetic settlement backfill.';
comment on column private.launch_delivery_guard.claim_outcome is
 'Explicit no-handoff lease completion: disabled or cancelled by withdrawal. Neither means provider settlement; last handoff evidence remains required.';
comment on column private.launch_delivery_guard.claim_finished_at is
 'Time the lease was explicitly disabled/cancelled, not a retention clock or inferred handoff outcome.';
alter table private.launch_delivery_guard enable row level security;
revoke all on private.launch_delivery_guard from public,anon,authenticated;
grant select,insert,update,delete on private.launch_delivery_guard to service_role;

create or replace function private.claim_launch_signup_v2(p_email text,p_source text,p_ip_hash text,p_consent_version text,p_consent_status text,p_launch_match text)
returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare r public.signup_requests; g private.launch_delivery_guard; c private.launch_list_control;
 fresh boolean := false; claim_token uuid;
begin
 if p_email is null or p_email<>lower(trim(p_email)) or length(p_email)>254
  or p_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  or p_ip_hash is null or p_ip_hash !~ '^[0-9a-f]{64}$'
  or p_launch_match is null or p_launch_match !~ '^[0-9a-f]{64}$'
  or p_source is null or p_source not in ('direct','instagram','qut-club','campus-poster','friend-invite','legacy-api')
  or p_consent_status is null
  or not ((p_source='legacy-api' and p_consent_status='unknown' and p_consent_version is null)
    or (p_source<>'legacy-api' and p_consent_status='recorded' and p_consent_version is not distinct from '2026-10-11-v1')) then
  raise exception 'invalid launch signup' using errcode='22023';
 end if;
 perform pg_advisory_xact_lock(hashtextextended('launch-list-fence',0));
 select * into c from private.launch_list_control where singleton;
 if not found or c.mode='fenced' then return jsonb_build_object('maintenance',true); end if;
 perform pg_advisory_xact_lock(hashtextextended('signup-ip:'||p_ip_hash,0));
 delete from public.signup_rate_events where created_at<now()-interval '1 day';
 if (select count(*) from public.signup_rate_events where ip_hash=p_ip_hash and created_at>now()-interval '10 minutes')>=10 then
  return jsonb_build_object('limited',true);
 end if;
 insert into public.signup_rate_events(ip_hash) values(p_ip_hash);
 perform pg_advisory_xact_lock(hashtextextended('signup-email:'||p_email,0));
 select * into r from public.signup_requests where email=p_email and intent='launch' for update;
 if r.withdrawn_at is not null or exists(select 1 from private.launch_suppressions where launch_match=p_launch_match or launch_match=r.launch_match) then
  return jsonb_build_object('suppressed',true);
 end if;
 -- A changed matching key must not replace the stored suppression identity.
 if r.launch_match is not null and r.launch_match<>p_launch_match then
  return jsonb_build_object('maintenance',true);
 end if;
 if r.id is null then
  insert into public.signup_requests(email,intent,platform,source,registration_origin,consent_status,consent_version,launch_match)
   values(p_email,'launch','unspecified',p_source,case when p_source='legacy-api' then 'legacy_api' else 'current_form' end,p_consent_status,p_consent_version,p_launch_match)
   returning * into r;
  fresh := true;
 end if;
 -- Preserve historical sent/provider facts. Never reinterpret unknown consent.
 if r.delivery_state='sent' or r.provider_id is not null then
  return jsonb_build_object('id',r.id,'created',fresh,'send',false,'delivery',case when r.delivery_state='sent' then 'sent' else 'review' end);
 end if;
 if r.registration_origin='legacy_import' or r.delivery_state='review'
  or (r.delivery_template_version is null and (r.delivery_attempted_at is not null or r.delivery_first_attempt_at is not null or r.delivery_token is not null or r.delivery_state in ('sending','failed')))
  or (r.delivery_template_version is not null and r.delivery_template_version<>'launch-v1') then
  update public.signup_requests set delivery_state='review' where id=r.id;
  return jsonb_build_object('id',r.id,'created',fresh,'send',false,'delivery','review');
 end if;
 select * into g from private.launch_delivery_guard where signup_id=r.id;
 if r.delivery_first_attempt_at<now()-interval '23 hours' and r.delivery_state in ('sending','pending','failed') then
  update public.signup_requests set delivery_state='review' where id=r.id;
  return jsonb_build_object('id',r.id,'created',fresh,'send',false,'delivery','review');
 end if;
 if (g.handoff_token is not null and (not g.settled or g.handoff_state='pending' or r.delivery_state='pending'))
  or (r.delivery_state in ('sending','pending','failed') and r.delivery_attempted_at>now()-interval '5 minutes') then
  return jsonb_build_object('id',r.id,'created',fresh,'send',false,'delivery',case when r.delivery_state='failed' then 'failed' else 'pending' end);
 end if;
 -- Upgrade only an observable matching definite rejection, not missing or
 -- uncertain evidence. This supports an existing settled guard on transition.
 if g.handoff_state is null and g.handoff_token=r.delivery_token and g.settled
  and g.handoff_at is not null and g.payload_hash is not null and r.delivery_state='failed' then
  update private.launch_delivery_guard set handoff_state='failed' where signup_id=r.id;
 end if;
 claim_token := gen_random_uuid();
 update public.signup_requests set launch_match=coalesce(launch_match,p_launch_match),
  launch_token_nonce=coalesce(launch_token_nonce,gen_random_uuid()),delivery_template_version='launch-v1',
  delivery_state='sending',delivery_token=claim_token,delivery_attempted_at=now()
  where id=r.id returning * into r;
 insert into private.launch_delivery_guard(signup_id,fence_epoch,claim_token) values(r.id,c.fence_epoch,claim_token)
  on conflict(signup_id) do update set fence_epoch=excluded.fence_epoch,claim_token=excluded.claim_token,
   claim_outcome=null,claim_finished_at=null;
 return jsonb_build_object('id',r.id,'token',claim_token,'nonce',r.launch_token_nonce,'templateVersion',r.delivery_template_version,
  'created',fresh,'send',true,'delivery','pending','fenceEpoch',c.fence_epoch);
end $$;

create or replace function private.pin_launch_payload_v1(p_id uuid,p_token uuid,p_payload_hash text)
returns boolean language plpgsql security invoker set search_path=pg_catalog as $$
declare r public.signup_requests;
begin
 if p_payload_hash is null or p_payload_hash !~ '^[0-9a-f]{64}$' then return false; end if;
 perform pg_advisory_xact_lock(hashtextextended('launch-list-fence',0));
 select * into r from public.signup_requests where id=p_id and intent='launch';
 if not found then return false; end if;
 perform pg_advisory_xact_lock(hashtextextended('signup-email:'||r.email,0));
 if r.delivery_token is distinct from p_token or p_token is null or r.withdrawn_at is not null or r.delivery_state<>'sending' then return false; end if;
 update private.launch_delivery_guard set payload_hash=coalesce(payload_hash,p_payload_hash)
  where signup_id=p_id and claim_token=p_token and claim_outcome is null
   and (handoff_token is null or (settled and handoff_state='failed' and handoff_token<>p_token))
   and (payload_hash is null or payload_hash=p_payload_hash);
 return found;
end $$;

create or replace function private.authorize_launch_delivery_v1(p_id uuid,p_token uuid,p_fence_epoch bigint,p_unsubscribe_hash text)
returns boolean language plpgsql security invoker set search_path=pg_catalog as $$
declare r public.signup_requests; g private.launch_delivery_guard;
begin
 if p_token is null or p_unsubscribe_hash is null or p_unsubscribe_hash !~ '^[0-9a-f]{64}$' then return false; end if;
 perform pg_advisory_xact_lock(hashtextextended('launch-list-fence',0));
 if not exists(select 1 from private.launch_list_control where singleton and mode<>'fenced' and fence_epoch=p_fence_epoch) then return false; end if;
 select * into r from public.signup_requests where id=p_id and intent='launch';
 if not found then return false; end if;
 perform pg_advisory_xact_lock(hashtextextended('signup-email:'||r.email,0));
 select * into r from public.signup_requests where id=p_id for update;
 select * into g from private.launch_delivery_guard where signup_id=p_id for update;
 if not found or g.fence_epoch<>p_fence_epoch or g.payload_hash is null
  or g.claim_token is distinct from p_token or g.claim_outcome is not null
  or (g.handoff_token is not null and (not g.settled or g.handoff_state is distinct from 'failed' or g.handoff_token=p_token))
  or r.delivery_token is distinct from p_token or r.delivery_state<>'sending' or r.withdrawn_at is not null
  or r.launch_match is null or r.launch_token_nonce is null or r.delivery_template_version is distinct from 'launch-v1'
  or r.registration_origin='legacy_import' or r.provider_id is not null
  or r.delivery_attempted_at<=now()-interval '5 minutes'
  or r.delivery_first_attempt_at<=now()-interval '23 hours'
  or (r.launch_unsubscribe_hash is not null and r.launch_unsubscribe_hash<>p_unsubscribe_hash)
  or exists(select 1 from private.launch_suppressions where launch_match=r.launch_match) then return false; end if;
 update public.signup_requests set launch_unsubscribe_hash=coalesce(launch_unsubscribe_hash,p_unsubscribe_hash),
  delivery_first_attempt_at=coalesce(delivery_first_attempt_at,now()) where id=p_id;
 update private.launch_delivery_guard set handoff_token=p_token,handoff_at=clock_timestamp(),handoff_state=null,settled=false where signup_id=p_id;
 return true;
end $$;

create or replace function private.finish_launch_delivery_v1(p_id uuid,p_token uuid,p_state text,p_provider_id text default null)
returns boolean language plpgsql security invoker set search_path=pg_catalog as $$
declare r public.signup_requests; g private.launch_delivery_guard;
begin
 if p_state is null or p_state not in ('sent','failed','pending','disabled') or p_token is null
  or (p_state='sent' and (p_provider_id is null or length(trim(p_provider_id))=0))
  or (p_state<>'sent' and p_provider_id is not null) then return false; end if;
 perform pg_advisory_xact_lock(hashtextextended('launch-list-fence',0));
 select * into r from public.signup_requests where id=p_id and intent='launch';
 if not found then return false; end if;
 perform pg_advisory_xact_lock(hashtextextended('signup-email:'||r.email,0));
 select * into r from public.signup_requests where id=p_id for update;
 select * into g from private.launch_delivery_guard where signup_id=p_id for update;
 if not found then return false; end if;
 if p_state='disabled' then
  if g.claim_token is distinct from p_token or g.claim_outcome is not null
   or (g.handoff_token is not null and (not g.settled or g.handoff_state is distinct from 'failed' or g.handoff_token=p_token))
   or r.delivery_token is distinct from p_token or r.withdrawn_at is not null or r.delivery_state<>'sending' then return false; end if;
 elsif g.handoff_token is distinct from p_token or g.settled then return false;
 end if;
 update public.signup_requests set delivery_state=p_state,provider_id=p_provider_id where id=p_id;
 if p_state='disabled' then
  update private.launch_delivery_guard set claim_outcome='disabled',claim_finished_at=clock_timestamp(),
   settled=case when handoff_token is null then true else settled end where signup_id=p_id;
 else
  update private.launch_delivery_guard set settled=true,handoff_state=p_state where signup_id=p_id;
 end if;
 return true;
end $$;

create or replace function public.claim_launch_signup_v2(p_email text,p_source text,p_ip_hash text,p_consent_version text,p_consent_status text,p_launch_match text)
returns jsonb language sql security invoker set search_path=pg_catalog as $$
 select private.claim_launch_signup_v2(p_email,p_source,p_ip_hash,p_consent_version,p_consent_status,p_launch_match);
$$;
create or replace function public.pin_launch_payload_v1(p_id uuid,p_token uuid,p_payload_hash text)
returns boolean language sql security invoker set search_path=pg_catalog as $$
 select private.pin_launch_payload_v1(p_id,p_token,p_payload_hash);
$$;
create or replace function public.authorize_launch_delivery_v1(p_id uuid,p_token uuid,p_fence_epoch bigint,p_unsubscribe_hash text)
returns boolean language sql security invoker set search_path=pg_catalog as $$
 select private.authorize_launch_delivery_v1(p_id,p_token,p_fence_epoch,p_unsubscribe_hash);
$$;
create or replace function public.finish_launch_delivery_v1(p_id uuid,p_token uuid,p_state text,p_provider_id text default null)
returns boolean language sql security invoker set search_path=pg_catalog as $$
 select private.finish_launch_delivery_v1(p_id,p_token,p_state,p_provider_id);
$$;
revoke all on function public.claim_launch_signup_v2(text,text,text,text,text,text),private.claim_launch_signup_v2(text,text,text,text,text,text),
 public.pin_launch_payload_v1(uuid,uuid,text),private.pin_launch_payload_v1(uuid,uuid,text),
 public.authorize_launch_delivery_v1(uuid,uuid,bigint,text),private.authorize_launch_delivery_v1(uuid,uuid,bigint,text),
 public.finish_launch_delivery_v1(uuid,uuid,text,text),private.finish_launch_delivery_v1(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.claim_launch_signup_v2(text,text,text,text,text,text),private.claim_launch_signup_v2(text,text,text,text,text,text),
 public.pin_launch_payload_v1(uuid,uuid,text),private.pin_launch_payload_v1(uuid,uuid,text),
 public.authorize_launch_delivery_v1(uuid,uuid,bigint,text),private.authorize_launch_delivery_v1(uuid,uuid,bigint,text),
 public.finish_launch_delivery_v1(uuid,uuid,text,text),private.finish_launch_delivery_v1(uuid,uuid,text,text) to service_role;

create or replace function private.withdraw_launch_v1(p_token_hash text)
returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare r public.signup_requests; withdrawal_time timestamptz;
begin
 if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
  return jsonb_build_object('outcome','invalid');
 end if;
 -- Always outer launch fence, then the same email lock used by v1/v2 claims.
 perform pg_advisory_xact_lock(hashtextextended('launch-list-fence',0));
 if exists(select 1 from private.launch_withdrawal_receipts where token_hash=p_token_hash) then
  return jsonb_build_object('outcome','already_withdrawn');
 end if;
 select * into r from public.signup_requests
  where intent='launch' and launch_unsubscribe_hash=p_token_hash;
 if not found or r.launch_match is null then
  return jsonb_build_object('outcome','invalid');
 end if;
 perform pg_advisory_xact_lock(hashtextextended('signup-email:'||r.email,0));
 select * into r from public.signup_requests
  where intent='launch' and launch_unsubscribe_hash=p_token_hash for update;
 if not found or r.launch_match is null then
  return jsonb_build_object('outcome','invalid');
 end if;
 withdrawal_time := coalesce(r.withdrawn_at,clock_timestamp());
 insert into private.launch_suppressions(launch_match,withdrawn_at,basis)
  values(r.launch_match,withdrawal_time,'unsubscribe') on conflict(launch_match) do nothing;
 insert into private.launch_withdrawal_receipts(token_hash,launch_match,withdrawn_at)
  values(p_token_hash,r.launch_match,withdrawal_time);
 update public.signup_requests set withdrawn_at=withdrawal_time,
  delivery_token=case when delivery_state='sent' or exists(select 1 from private.launch_delivery_guard g where g.signup_id=r.id and g.handoff_token=r.delivery_token) then delivery_token else null end
  where id=r.id and intent='launch';
 -- Explicitly retire only the unsent lease. Keep the previous rejection and
 -- its pinned/timed handoff proof; a current handoff can still finish late.
 update private.launch_delivery_guard set claim_outcome='cancelled',claim_finished_at=clock_timestamp()
  where signup_id=r.id and claim_token=r.delivery_token and handoff_token is distinct from r.delivery_token;
 -- Preserve delivery state/provider facts: a handed-off email cannot be recalled.
 return jsonb_build_object('outcome',case when r.withdrawn_at is null then 'withdrawn' else 'already_withdrawn' end);
end $$;
revoke all on function private.withdraw_launch_v1(text) from public,anon,authenticated;
grant execute on function private.withdraw_launch_v1(text) to service_role;

-- REST facade only; private is not an exposed schema. No session/account auth:
-- the server hashes the opaque launch-only capability before invoking this RPC.
create or replace function public.withdraw_launch_v1(p_token_hash text)
returns jsonb language sql security invoker set search_path=pg_catalog as $$
 select private.withdraw_launch_v1(p_token_hash);
$$;
revoke all on function public.withdraw_launch_v1(text) from public,anon,authenticated;
grant execute on function public.withdraw_launch_v1(text) to service_role;
-- Task 4 operator boundary. Empty on installation: neither this migration nor
-- the importer issues approvals or configures a deployment identity. These rows
-- record trusted operational review, not independent proof of human truth.
alter table private.launch_list_control
 add column if not exists project_ref text check(project_ref ~ '^[a-z]{20}$'),
 add column if not exists source_commit text check(source_commit ~ '^[0-9a-f]{40}$');

create table if not exists private.launch_import_authorizations (
 approval_ref text primary key check(approval_ref ~ '^[a-zA-Z0-9_-]{1,100}$'),
 project_ref text not null check(project_ref ~ '^[a-z]{20}$'),
 source_commit text not null check(source_commit ~ '^[0-9a-f]{40}$'),
 schema_identity text not null check(schema_identity ~ '^[0-9a-f]{64}$'),
 expected_scope text not null check(expected_scope ~ '^[0-9a-f]{64}$'),
 fence_epoch bigint not null check(fence_epoch>=0),
 writer_ids text[] not null check(cardinality(writer_ids)>0 and array_position(writer_ids,null) is null
   and array_to_string(writer_ids,',') ~ '^[a-zA-Z0-9_-]+(,[a-zA-Z0-9_-]+)*$'),
 control_evidence text not null check(control_evidence ~ '^[a-zA-Z0-9_-]{1,100}$'),
 test_evidence text not null check(test_evidence ~ '^[a-zA-Z0-9_-]{1,100}$'),
 settlement_evidence text not null check(settlement_evidence ~ '^[a-zA-Z0-9_-]{1,100}$'),
 verified_at timestamptz not null,
 expires_at timestamptz not null check(isfinite(expires_at) and isfinite(verified_at) and expires_at>verified_at),
 revoked_at timestamptz,
 consumed_at timestamptz,
 post_scope text check(post_scope ~ '^[0-9a-f]{64}$'),
 result_receipt jsonb,
 check((consumed_at is null and post_scope is null and result_receipt is null)
   or (consumed_at is not null and post_scope is not null and result_receipt is not null))
);
alter table private.launch_import_authorizations enable row level security;
revoke all on private.launch_import_authorizations from public,anon,authenticated;
grant select,insert,update,delete on private.launch_import_authorizations to service_role;
comment on table private.launch_import_authorizations is
 'Trusted operator attestation only. No issuer is shipped. Requires independently reviewed writer control, tested exact deployment/source, in-flight settlement and fresh human scope approval. Evidence fields are opaque content-free record IDs, not URLs, capabilities or subscriber content. Expiry is operator supplied. Service access is the trust boundary.';

-- ASCII identity normalization exactly matches JS trim().toLowerCase(). Unicode
-- identities are retained as review items, never guessed using locale-dependent
-- case folding. Trim the ECMAScript whitespace set before the ASCII check.
create or replace function private.normalize_launch_import_email_v1(p_email text)
returns text language sql immutable security invoker set search_path=pg_catalog as $$
 select case when e ~ '^[!-~]+$' and length(e)<=254 and e ~ '^[^@]+@[^@]+\.[^@]+$'
   then translate(e,'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz') end
 from (select btrim(p_email,U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF') e) q;
$$;

-- pgcrypto can live in public or extensions; no assumption about installation
-- schema. Only extension-owned HMAC is selected. Never persist the match key.
create or replace function private.launch_import_mac_v1(p_content text,p_key text)
returns text language plpgsql stable security invoker set search_path=pg_catalog as $$
declare extension_schema text; result text;
begin
 if p_key is null or length(btrim(p_key))=0 then raise exception 'launch reconciliation unavailable'; end if;
 select n.nspname into extension_schema from pg_extension e join pg_namespace n on n.oid=e.extnamespace where e.extname='pgcrypto';
 execute format('select encode(%I.hmac(convert_to($1,''UTF8''),convert_to($2,''UTF8''),''sha256''),''hex'')',extension_schema)
 into result using p_content,p_key;
 return result;
end $$;

create or replace function private.launch_import_schema_v1()
returns text language sql stable security invoker set search_path=pg_catalog as $$
 select encode(sha256(convert_to(jsonb_build_object('contract',1,
  'columns',(select jsonb_agg(row(n.nspname,c.relname,a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,pg_get_expr(d.adbin,d.adrelid)) order by n.nspname,c.relname,a.attnum)
    from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace
    left join pg_attrdef d on d.adrelid=c.oid and d.adnum=a.attnum
    where n.nspname in ('public','private') and c.relkind='r' and a.attnum>0 and not a.attisdropped
      and (c.relname in ('waitlist','signup_requests') or c.relname like 'launch_%')),
  'functions',(select jsonb_agg(row(n.nspname,p.proname,pg_get_function_identity_arguments(p.oid),pg_get_functiondef(p.oid),p.proacl) order by n.nspname,p.proname,pg_get_function_identity_arguments(p.oid))
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') and (p.proname like '%launch%' or p.proname like '%signup%')),
  'constraints',(select jsonb_agg(row(conrelid::regclass::text,conname,pg_get_constraintdef(oid)) order by conrelid::regclass::text,conname) from pg_constraint where connamespace in ('public'::regnamespace,'private'::regnamespace)),
  'tables',(select jsonb_agg(row(n.nspname,c.relname,c.relrowsecurity,c.relforcerowsecurity,c.relacl) order by n.nspname,c.relname) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private') and c.relkind='r'),
  'indexes',(select jsonb_agg(row(schemaname,indexname,indexdef) order by schemaname,indexname) from pg_indexes where schemaname in ('public','private')),
  'triggers',(select jsonb_agg(row(pg_get_triggerdef(oid),tgenabled) order by tgrelid::regclass::text,tgname) from pg_trigger where not tgisinternal),
  'policies',(select jsonb_agg(to_jsonb(p) order by schemaname,tablename,policyname) from pg_policies p where schemaname in ('public','private'))
 )::text,'UTF8')),'hex');
$$;

create or replace function private.inventory_launch_legacy_v1(p_match_key text)
returns jsonb language plpgsql stable security invoker set search_path=pg_catalog as $$
declare c private.launch_list_control; schema_id text; scope_id text; invalid_count bigint; conflict_count bigint;
begin
 -- STABLE uses the calling statement's single MVCC snapshot for every read.
 -- No writer/advisory/row locks: inventory never fences beta or launch work.
 select * into c from private.launch_list_control where singleton;
 schema_id:=private.launch_import_schema_v1();
 scope_id:=private.launch_import_mac_v1('veylo:launch-scope:v1:'||jsonb_build_object(
   'schema',schema_id,'control',to_jsonb(c),'controlVersion',(select xmin::text from private.launch_list_control where singleton),
   'legacy',(select jsonb_agg(jsonb_build_array(to_jsonb(w),w.xmin::text) order by id) from public.waitlist w),
   'canonical',(select jsonb_agg(jsonb_build_array(to_jsonb(s),s.xmin::text) order by id) from public.signup_requests s where intent='launch'),
   'provenance',(select jsonb_agg(jsonb_build_array(to_jsonb(p),p.xmin::text) order by legacy_id) from private.launch_legacy_provenance p),
   'suppression',(select jsonb_agg(jsonb_build_array(to_jsonb(s),s.xmin::text) order by launch_match) from private.launch_suppressions s),
   'withdrawal',(select jsonb_agg(jsonb_build_array(to_jsonb(w),w.xmin::text) order by token_hash) from private.launch_withdrawal_receipts w),
   'delivery',(select jsonb_agg(jsonb_build_array(to_jsonb(g),g.xmin::text) order by signup_id) from private.launch_delivery_guard g)
 )::text,p_match_key);
 select count(*) into invalid_count from public.waitlist where private.normalize_launch_import_email_v1(email) is null;
 select count(*) into conflict_count from (
   select private.normalize_launch_import_email_v1(email) from public.waitlist
    where private.normalize_launch_import_email_v1(email) is not null group by 1 having count(*)>1
   union all
   select email from public.signup_requests where intent='launch' and
    (private.normalize_launch_import_email_v1(email) is distinct from email
     or (launch_match is not null and launch_match<>private.launch_import_mac_v1(email,p_match_key)))
   union all
   select p.legacy_id::text from private.launch_legacy_provenance p
    left join public.waitlist w on w.id=p.legacy_id left join public.signup_requests s on s.id=p.signup_id
    where w.id is null or p.legacy_created_at is distinct from w.created_at
      or p.launch_match is distinct from private.launch_import_mac_v1(private.normalize_launch_import_email_v1(w.email),p_match_key)
      or (p.signup_id is not null and (s.intent is distinct from 'launch' or s.email is distinct from private.normalize_launch_import_email_v1(w.email)))
      or (p.signup_id is null and not exists(select 1 from private.launch_suppressions x where x.launch_match=p.launch_match))
 ) conflicts;
 return jsonb_build_object('schemaVersion',1,'projectRef',c.project_ref,'sourceCommit',c.source_commit,
  'schemaIdentity',schema_id,'fenceEpoch',c.fence_epoch,'mode',c.mode,'scopeHash',scope_id,
  'configured',c.project_ref is not null and c.source_commit is not null,
  'counts',jsonb_build_object('legacy',(select count(*) from public.waitlist),'launch',(select count(*) from public.signup_requests where intent='launch'),
    'beta',(select count(*) from public.signup_requests where intent='beta'),'invalid',invalid_count,'conflicts',conflict_count),
  'outcome','inventory','equality',false,'disposalAllowed',false,'writes',0,'emails',0,'testedWriterIds','[]'::jsonb,'approvalRef',null);
end $$;

create or replace function private.read_launch_import_authorization_v1(p_approval_ref text)
returns jsonb language sql security invoker set search_path=pg_catalog as $$
 select jsonb_build_object('approvalRef',approval_ref,'projectRef',project_ref,'sourceCommit',source_commit,
  'schemaIdentity',schema_identity,'expectedScope',expected_scope,'fenceEpoch',fence_epoch,'writerIds',writer_ids,
  'controlEvidence',control_evidence,'testEvidence',test_evidence,'settlementEvidence',settlement_evidence,
  'verifiedAt',verified_at,'expiresAt',expires_at,'revokedAt',revoked_at,'consumedAt',consumed_at,'postScope',post_scope)
 from private.launch_import_authorizations where approval_ref=p_approval_ref;
$$;

create or replace function private.reconcile_launch_legacy_v1(p_expected_scope text,p_match_key text,p_apply boolean default false)
returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare inv jsonb; after_inv jsonb; a private.launch_import_authorizations; w record; r public.signup_requests;
 normalized text; match_id text; mapped_id uuid; disposition text; withdrawn timestamptz;
 modifications bigint:=0; affected bigint; result jsonb;
begin
 if p_apply is true then perform pg_advisory_xact_lock(hashtextextended('launch-list-fence',0)); end if;
 inv:=private.inventory_launch_legacy_v1(p_match_key);
 if p_apply is not true then return inv||jsonb_build_object('outcome','dry_run'); end if;
 -- The separate cutover prerequisite installs actual launch-only guards. An
 -- attestation alone cannot substitute for them. No beta locks are acquired.
 if to_regprocedure('private.launch_write_fence_ready_v1()') is null then
  return inv||jsonb_build_object('outcome','refused');
 end if;
 if not private.launch_write_fence_ready_v1() then return inv||jsonb_build_object('outcome','refused'); end if;
 if p_expected_scope is null or p_expected_scope !~ '^[0-9a-f]{64}$' or inv->>'mode'<>'fenced'
   or (inv->>'configured')::boolean is not true then
  return inv||jsonb_build_object('outcome','refused');
 end if;
 -- Fixed RPC signature selects one exact-scope attestation; never accept mode
 -- or the caller's apply boolean as evidence of writer control/human approval.
 if (select count(*) from private.launch_import_authorizations where expected_scope=p_expected_scope
      and revoked_at is null and verified_at<=clock_timestamp() and expires_at>clock_timestamp())<>1 then
  return inv||jsonb_build_object('outcome','refused');
 end if;
 select * into a from private.launch_import_authorizations where expected_scope=p_expected_scope
   and revoked_at is null and verified_at<=clock_timestamp() and expires_at>clock_timestamp() for update;
 if (select count(distinct writer) from unnest(a.writer_ids) writer)<>cardinality(a.writer_ids)
   or exists(select 1 from unnest(a.writer_ids) writer where length(writer)>100) then
  return inv||jsonb_build_object('outcome','refused');
 end if;
 if a.project_ref is distinct from inv->>'projectRef' or a.source_commit is distinct from inv->>'sourceCommit'
   or a.schema_identity is distinct from inv->>'schemaIdentity' or a.fence_epoch is distinct from (inv->>'fenceEpoch')::bigint then
  return inv||jsonb_build_object('outcome','refused');
 end if;
 if a.consumed_at is not null then
  if a.post_scope=inv->>'scopeHash' then return a.result_receipt; end if;
  return inv||jsonb_build_object('outcome','refused');
 end if;
 if inv->>'scopeHash'<>p_expected_scope then return inv||jsonb_build_object('outcome','refused'); end if;
 -- A record claiming settlement cannot overrule known unresolved handoff
 -- evidence. Task 5/operator review must resolve it without timeout inference.
 if exists(select 1 from private.launch_delivery_guard g join public.signup_requests s on s.id=g.signup_id
   where g.handoff_token is not null and (not g.settled or s.delivery_state in ('pending','sending','review'))) then
  return inv||jsonb_build_object('outcome','refused');
 end if;
 if (inv->'counts'->>'invalid')::bigint>0 or (inv->'counts'->>'conflicts')::bigint>0 then
  return inv||jsonb_build_object('outcome','review');
 end if;
 insert into private.launch_import_context(transaction_id,backend_pid,approval_ref,expected_scope,fence_epoch)
  values(pg_current_xact_id(),pg_backend_pid(),a.approval_ref,p_expected_scope,a.fence_epoch);
 for w in select * from public.waitlist order by id loop
  normalized:=private.normalize_launch_import_email_v1(w.email);
  match_id:=private.launch_import_mac_v1(normalized,p_match_key);
  -- Guarded launch writers serialize on the outer fence. The shared email
  -- advisory lock is deliberately NOT used: same-address beta stays available.
  select * into r from public.signup_requests where intent='launch' and email=normalized;
  mapped_id:=coalesce(r.id,substr(private.launch_import_mac_v1('veylo:legacy-id:v1:'||w.id::text,p_match_key),1,32)::uuid);
  select withdrawn_at into withdrawn from private.launch_suppressions where launch_match=match_id;
  withdrawn:=coalesce(withdrawn,r.withdrawn_at);
  if withdrawn is not null then mapped_id:=r.id; end if;
  update private.launch_import_context set legacy_id=w.id,signup_id=mapped_id,launch_match=match_id
   where transaction_id=pg_current_xact_id() and backend_pid=pg_backend_pid();
  if withdrawn is not null then
   insert into private.launch_suppressions(launch_match,withdrawn_at,basis) values(match_id,withdrawn,'legacy-reconciliation') on conflict do nothing;
   get diagnostics affected=row_count; modifications:=modifications+affected;
   mapped_id:=r.id; disposition:='suppressed';
  elsif r.id is not null then
   mapped_id:=r.id; disposition:=case when r.registration_origin='legacy_import' then 'review' else 'registered' end;
  else
   -- Deterministic synthetic identity survives aborted/retried transactions.
   mapped_id:=substr(private.launch_import_mac_v1('veylo:legacy-id:v1:'||w.id::text,p_match_key),1,32)::uuid;
   insert into public.signup_requests(id,email,intent,platform,source,created_at,registration_origin,consent_status,consent_version,delivery_state,launch_match)
    values(mapped_id,normalized,'launch','unspecified','legacy',w.created_at,'legacy_import','unknown',null,'review',match_id);
   modifications:=modifications+1; disposition:='review';
  end if;
  insert into private.launch_legacy_provenance(legacy_id,legacy_created_at,signup_id,launch_match,outcome)
   values(w.id,w.created_at,mapped_id,match_id,disposition)
   on conflict(legacy_id) do update set outcome=excluded.outcome
    where private.launch_legacy_provenance.outcome is distinct from excluded.outcome;
  get diagnostics affected=row_count; modifications:=modifications+affected;
 end loop;
 -- Exact relational equality, not count equality. Every source identity/time
 -- and match must map to its canonical launch row, or a durable suppression.
 if exists(select 1 from public.waitlist legacy left join private.launch_legacy_provenance p on p.legacy_id=legacy.id
   left join public.signup_requests s on s.id=p.signup_id
   where p.legacy_id is null or p.legacy_created_at is distinct from legacy.created_at
     or p.launch_match is distinct from private.launch_import_mac_v1(private.normalize_launch_import_email_v1(legacy.email),p_match_key)
     or not ((p.outcome='suppressed' and exists(select 1 from private.launch_suppressions x where x.launch_match=p.launch_match))
       or (p.outcome in ('registered','review') and s.intent='launch' and s.email=private.normalize_launch_import_email_v1(legacy.email)))) then
  raise exception 'launch reconciliation unavailable';
 end if;
 after_inv:=private.inventory_launch_legacy_v1(p_match_key);
 if (after_inv->'counts'->>'conflicts')::bigint<>0 or after_inv->>'schemaIdentity'<>inv->>'schemaIdentity'
   or not private.launch_write_fence_ready_v1() or a.expires_at<=clock_timestamp() then raise exception 'launch reconciliation unavailable'; end if;
 result:=after_inv||jsonb_build_object('outcome','reconciled','equality',true,'writes',modifications+1,
   'approvalRef',a.approval_ref,'testedWriterIds',to_jsonb(a.writer_ids));
 update private.launch_import_authorizations set consumed_at=clock_timestamp(),post_scope=after_inv->>'scopeHash',result_receipt=result where approval_ref=a.approval_ref;
 delete from private.launch_import_context where transaction_id=pg_current_xact_id() and backend_pid=pg_backend_pid();
 return result;
end $$;

create or replace function public.inventory_launch_legacy_v1(p_match_key text)
returns jsonb language plpgsql stable security invoker set search_path=pg_catalog as $$
begin return private.inventory_launch_legacy_v1(p_match_key);
exception when others then raise exception 'launch reconciliation unavailable' using errcode='P0001'; end $$;
create or replace function public.reconcile_launch_legacy_v1(p_expected_scope text,p_match_key text,p_apply boolean default false)
returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
begin return private.reconcile_launch_legacy_v1(p_expected_scope,p_match_key,p_apply);
exception when others then raise exception 'launch reconciliation unavailable' using errcode='P0001'; end $$;
create or replace function public.read_launch_import_authorization_v1(p_approval_ref text)
returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
begin return private.read_launch_import_authorization_v1(p_approval_ref);
exception when others then raise exception 'launch reconciliation unavailable' using errcode='P0001'; end $$;
revoke all on function private.normalize_launch_import_email_v1(text),private.launch_import_mac_v1(text,text),private.launch_import_schema_v1(),
 private.inventory_launch_legacy_v1(text),private.reconcile_launch_legacy_v1(text,text,boolean),private.read_launch_import_authorization_v1(text),
 public.inventory_launch_legacy_v1(text),public.reconcile_launch_legacy_v1(text,text,boolean),public.read_launch_import_authorization_v1(text) from public,anon,authenticated;
grant execute on function private.normalize_launch_import_email_v1(text),private.launch_import_mac_v1(text,text),private.launch_import_schema_v1(),
 private.inventory_launch_legacy_v1(text),private.reconcile_launch_legacy_v1(text,text,boolean),private.read_launch_import_authorization_v1(text),
 public.inventory_launch_legacy_v1(text),public.reconcile_launch_legacy_v1(text,text,boolean),public.read_launch_import_authorization_v1(text) to service_role;
commit;
