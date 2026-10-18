-- Task 4 fence plus Task 5 cutover/restore prerequisites. Installation changes
-- no mode, binding or approval. No live authority, data restore or disposal.
begin;

alter table private.launch_import_authorizations
 add column if not exists operation text not null default 'import',
 add column if not exists target_mode text,
 add column if not exists restore_snapshot_ref text,
 add column if not exists restore_replay_ref text,
 add column if not exists restore_coverage_ref text;
alter table private.launch_list_control add column if not exists restore_required boolean not null default false;
do $$ begin
 if not exists(select 1 from pg_constraint where conrelid='private.launch_import_authorizations'::regclass and conname='launch_authorization_purpose') then
  alter table private.launch_import_authorizations add constraint launch_authorization_purpose check(
   (operation='import' and target_mode is null and restore_snapshot_ref is null and restore_replay_ref is null and restore_coverage_ref is null)
   or (operation='mode' and target_mode is not null and target_mode in ('fenced','canonical')
    and restore_snapshot_ref is null and restore_replay_ref is null and restore_coverage_ref is null)
   or (operation='restore' and target_mode is not null and target_mode='canonical'
    and restore_snapshot_ref is not null and restore_snapshot_ref ~ '^[a-zA-Z0-9_-]{1,100}$'
    and restore_replay_ref is not null and restore_replay_ref ~ '^[a-zA-Z0-9_-]{1,100}$'
    and restore_coverage_ref is not null and restore_coverage_ref ~ '^[a-zA-Z0-9_-]{1,100}$'));
 end if;
end $$;
comment on column private.launch_list_control.restore_required is
 'Trusted operator closes an isolated data-only restore target before loading older data; fresh restore-purpose authority with reviewed replay coverage is necessary to reopen. Not proof of external backup coverage. External activation/writers must remain closed independently of restored DB state.';

create table if not exists private.launch_import_context (
 transaction_id xid8 primary key,
 backend_pid integer not null,
 approval_ref text not null references private.launch_import_authorizations(approval_ref),
 expected_scope text not null,
 fence_epoch bigint not null,
 legacy_id uuid,
 signup_id uuid,
 launch_match text
);
alter table private.launch_import_context enable row level security;
revoke all on private.launch_import_context from public,anon,authenticated;
grant select,insert,update,delete on private.launch_import_context to service_role;
comment on table private.launch_import_context is
 'Internal transaction/backend-scoped importer marker, created only after scope/authority checks and removed before return; statement/transaction abort rolls it back. No public setter. Service-role direct administrative access remains trusted, as for authority/source tables; this is not protection against a malicious service administrator. No key/address/capability is stored.';

create or replace function private.guard_launch_writes_v1()
returns trigger language plpgsql security invoker set search_path=pg_catalog as $$
declare ctx private.launch_import_context; legacy public.waitlist; canonical public.signup_requests; allowed boolean:=false;
begin
 -- Neither beta-only rows nor beta-only intent-preserving updates participate.
 if tg_table_schema='public' and tg_table_name='signup_requests' then
  if (tg_op='INSERT' and new.intent='beta') or (tg_op='DELETE' and old.intent='beta')
    or (tg_op='UPDATE' and old.intent='beta' and new.intent='beta') then
   if tg_op='DELETE' then return old; else return new; end if;
  end if;
 end if;
 -- A row trigger may run AFTER PostgreSQL acquired a tuple lock. Never wait
 -- for outer fence from here: fail/rollback instead of reversing lock order.
 if not pg_try_advisory_xact_lock(hashtextextended('launch-list-fence',0)) then
  raise exception 'launch write fenced' using errcode='55000';
 end if;
 -- Operational control/authority changes use the fence, but the future trusted
 -- operator must be able to revoke/issue authority or change mode while fenced.
 if tg_table_schema='private' and tg_table_name in ('launch_list_control','launch_import_authorizations') then
  if tg_op='DELETE' then return old; else return new; end if;
 end if;
 if tg_table_schema='public' and tg_table_name='waitlist' and tg_op='INSERT'
   and exists(select 1 from private.launch_list_control where singleton and mode='canonical') then
  raise exception 'obsolete launch writer' using errcode='55000';
 end if;
 if not exists(select 1 from private.launch_list_control where singleton and mode='fenced') then
  if tg_op='DELETE' then return old; else return new; end if;
 end if;
 -- Maintenance closes intake, not durable safety facts. Only monotonic
 -- withdrawal shapes and outcomes for an already recorded handoff may pass.
 -- Service administration remains trusted; these are not public capabilities.
 if tg_table_schema='private' and tg_table_name='launch_suppressions' and tg_op='INSERT' then
  allowed:=new.basis='unsubscribe' and exists(select 1 from public.signup_requests s
   where s.intent='launch' and s.launch_match=new.launch_match and s.launch_unsubscribe_hash is not null
    and (s.withdrawn_at is null or s.withdrawn_at=new.withdrawn_at));
 elsif tg_table_schema='private' and tg_table_name='launch_withdrawal_receipts' and tg_op='INSERT' then
  allowed:=exists(select 1 from private.launch_suppressions x join public.signup_requests s on s.launch_match=x.launch_match
   where s.intent='launch' and s.launch_unsubscribe_hash=new.token_hash and x.launch_match=new.launch_match and x.withdrawn_at=new.withdrawn_at);
 elsif tg_table_schema='public' and tg_table_name='signup_requests' and tg_op='UPDATE' then
  allowed:=old.intent='launch' and new.intent='launch' and (
   ((to_jsonb(new)-array['withdrawn_at','delivery_token'])=(to_jsonb(old)-array['withdrawn_at','delivery_token'])
    and new.withdrawn_at is not null and (old.withdrawn_at is null or new.withdrawn_at=old.withdrawn_at)
    and (new.delivery_token is not distinct from old.delivery_token or new.delivery_token is null)
    and exists(select 1 from private.launch_withdrawal_receipts w
     where w.token_hash=old.launch_unsubscribe_hash and w.launch_match=old.launch_match and w.withdrawn_at=new.withdrawn_at))
   or ((to_jsonb(new)-array['delivery_state','provider_id'])=(to_jsonb(old)-array['delivery_state','provider_id'])
    and old.provider_id is null and exists(select 1 from private.launch_delivery_guard g where g.signup_id=old.id
     and not g.settled and g.handoff_token=old.delivery_token)
    and ((new.delivery_state='sent' and new.provider_id is not null and length(btrim(new.provider_id))>0)
     or (new.delivery_state in ('failed','pending') and new.provider_id is null))));
 elsif tg_table_schema='private' and tg_table_name='launch_delivery_guard' and tg_op='UPDATE' then
  allowed:=((to_jsonb(new)-array['settled','handoff_state'])=(to_jsonb(old)-array['settled','handoff_state']) and not old.settled and new.settled
   and old.handoff_token is not null and exists(select 1 from public.signup_requests s where s.id=old.signup_id
    and s.delivery_token=old.handoff_token and s.delivery_state in ('sent','failed','pending') and new.handoff_state=s.delivery_state))
   or ((to_jsonb(new)-array['claim_outcome','claim_finished_at'])=(to_jsonb(old)-array['claim_outcome','claim_finished_at'])
    and old.claim_token is not null and old.handoff_token is distinct from old.claim_token
    and new.claim_outcome='cancelled' and isfinite(new.claim_finished_at)
    and exists(select 1 from public.signup_requests s join private.launch_withdrawal_receipts w
     on w.token_hash=s.launch_unsubscribe_hash and w.launch_match=s.launch_match and w.withdrawn_at=s.withdrawn_at
     where s.id=old.signup_id and s.delivery_token is null and s.withdrawn_at is not null
      and new.claim_finished_at>=s.delivery_attempted_at));
 end if;
 if allowed is true then return new; end if;
 select x.* into ctx from private.launch_import_context x
  join private.launch_import_authorizations a on a.approval_ref=x.approval_ref
  join private.launch_list_control c on c.singleton
  where x.transaction_id=pg_current_xact_id() and x.backend_pid=pg_backend_pid()
   and a.operation='import' and x.expected_scope=a.expected_scope and x.fence_epoch=a.fence_epoch and x.fence_epoch=c.fence_epoch
   and a.project_ref=c.project_ref and a.source_commit=c.source_commit
   and a.revoked_at is null and a.consumed_at is null and a.verified_at<=clock_timestamp() and a.expires_at>clock_timestamp();
 if found and ctx.legacy_id is not null then
  select * into legacy from public.waitlist where id=ctx.legacy_id;
  select * into canonical from public.signup_requests where id=ctx.signup_id and intent='launch';
  if tg_table_schema='public' and tg_table_name='signup_requests' and tg_op='INSERT' then
   allowed:=new.id=ctx.signup_id and new.email=private.normalize_launch_import_email_v1(legacy.email)
    and new.created_at=legacy.created_at and new.intent='launch' and new.platform='unspecified' and new.source='legacy'
    and new.registration_origin='legacy_import' and new.consent_status='unknown' and new.consent_version is null
    and new.delivery_state='review' and new.launch_match=ctx.launch_match and new.withdrawn_at is null
    and new.delivery_attempted_at is null and new.delivery_first_attempt_at is null and new.delivery_token is null
    and new.provider_id is null and new.launch_token_nonce is null and new.launch_unsubscribe_hash is null
    and new.delivery_template_version is null;
  elsif tg_table_schema='private' and tg_table_name='launch_legacy_provenance' and tg_op in ('INSERT','UPDATE') then
   allowed:=new.legacy_id=legacy.id and new.legacy_created_at=legacy.created_at and new.launch_match=ctx.launch_match
    and new.signup_id is not distinct from ctx.signup_id
    and ((new.outcome='suppressed' and exists(select 1 from private.launch_suppressions where launch_match=ctx.launch_match))
      or (canonical.email=private.normalize_launch_import_email_v1(legacy.email)
        and new.outcome=case when canonical.registration_origin='legacy_import' then 'review' else 'registered' end));
   if tg_op='UPDATE' then allowed:=allowed and (to_jsonb(new)-'outcome')=(to_jsonb(old)-'outcome'); end if;
  elsif tg_table_schema='private' and tg_table_name='launch_suppressions' and tg_op='INSERT' then
   allowed:=new.launch_match=ctx.launch_match and new.basis='legacy-reconciliation'
    and (new.withdrawn_at=canonical.withdrawn_at or exists(select 1 from private.launch_suppressions s
      where s.launch_match=ctx.launch_match and s.withdrawn_at=new.withdrawn_at));
  end if;
 end if;
 if allowed is not true then raise exception 'launch write fenced' using errcode='55000'; end if;
 return new;
end $$;
revoke all on function private.guard_launch_writes_v1() from public,anon,authenticated;
grant execute on function private.guard_launch_writes_v1() to service_role;

do $$ declare target text; begin
 foreach target in array array['public.waitlist','public.signup_requests','private.launch_legacy_provenance',
  'private.launch_suppressions','private.launch_withdrawal_receipts','private.launch_delivery_guard',
  'private.launch_list_control','private.launch_import_authorizations'] loop
  execute format('create or replace trigger launch_write_fence before insert or update or delete on %s for each row execute function private.guard_launch_writes_v1()',target);
  execute format('revoke truncate on %s from service_role,public,anon,authenticated',target);
 end loop;
end $$;

-- v1 launch acquires outer BEFORE its historical IP/email ordering. Beta's
-- branch/order/response is unchanged. Transition retains legacy mirror/send.
create or replace function public.claim_signup_v1(p_email text,p_intent text,p_platform text,p_source text,p_ip_hash text)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare r public.signup_requests; token uuid;
begin
 if p_email is null or p_email<>lower(trim(p_email)) or length(p_email)>254 or p_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or p_intent not in ('beta','launch') or p_platform not in ('ios','android','unspecified') or (p_intent='beta' and p_platform='unspecified') or p_source not in ('direct','instagram','qut-club','campus-poster','friend-invite') or p_ip_hash is null or length(p_ip_hash)<>64 then
  raise exception 'invalid signup' using errcode='22023';
 end if;
 if p_intent='launch' then
  perform pg_advisory_xact_lock(hashtextextended('launch-list-fence',0));
  if exists(select 1 from private.launch_list_control where singleton and mode in ('fenced','canonical')) then return jsonb_build_object('maintenance',true); end if;
 end if;
 perform pg_advisory_xact_lock(hashtextextended('signup-ip:'||p_ip_hash,0));
 delete from public.signup_rate_events where created_at<now()-interval '1 day';
 if (select count(*) from public.signup_rate_events where ip_hash=p_ip_hash and created_at>now()-interval '10 minutes')>=10 then return jsonb_build_object('limited',true); end if;
 insert into public.signup_rate_events(ip_hash) values(p_ip_hash);
 perform pg_advisory_xact_lock(hashtextextended('signup-email:'||p_email,0));
 select * into r from public.signup_requests where email=p_email and intent=p_intent and (p_intent='launch' or platform=p_platform) for update;
 if not found then insert into public.signup_requests(email,intent,platform,source,consent_version) values(p_email,p_intent,p_platform,p_source,'2026-10-11-v1') returning * into r; end if;
 if p_intent='launch' then insert into public.waitlist(email) values(p_email) on conflict(email) do nothing; end if;
 if r.delivery_state='sent' then return jsonb_build_object('id',r.id,'send',false,'delivery','sent'); end if;
 if r.delivery_state in ('sending','pending') and r.delivery_attempted_at>now()-interval '5 minutes' then return jsonb_build_object('id',r.id,'send',false,'delivery','pending'); end if;
 if r.delivery_state='review' or (r.delivery_first_attempt_at is not null and r.delivery_first_attempt_at<now()-interval '23 hours' and r.delivery_state in ('sending','pending')) then
  update public.signup_requests set delivery_state='review' where id=r.id;
  return jsonb_build_object('id',r.id,'send',false,'delivery','review');
 end if;
 if r.delivery_state='failed' and r.delivery_attempted_at>now()-interval '5 minutes' then return jsonb_build_object('id',r.id,'send',false,'delivery','failed'); end if;
 token:=gen_random_uuid();
 update public.signup_requests set delivery_state='sending',delivery_token=token,delivery_attempted_at=now(),delivery_first_attempt_at=case when delivery_state='disabled' then now() else coalesce(delivery_first_attempt_at,now()) end where id=r.id;
 return jsonb_build_object('id',r.id,'token',token,'send',true,'delivery','pending');
end $$;

create or replace function public.finish_signup_delivery_v1(p_id uuid,p_token uuid,p_state text,p_provider_id text default null)
returns boolean language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if p_state not in ('sent','failed','pending','disabled') then raise exception 'invalid delivery state'; end if;
 if exists(select 1 from public.signup_requests where id=p_id and intent='launch') then
  perform pg_advisory_xact_lock(hashtextextended('launch-list-fence',0));
  if exists(select 1 from private.launch_list_control where singleton and mode in ('fenced','canonical')) then return false; end if;
 end if;
 update public.signup_requests set delivery_state=p_state,provider_id=p_provider_id where id=p_id and delivery_token=p_token and delivery_state='sending';
 return found;
end $$;
revoke all on function public.claim_signup_v1(text,text,text,text,text),public.finish_signup_delivery_v1(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.claim_signup_v1(text,text,text,text,text),public.finish_signup_delivery_v1(uuid,uuid,text,text) to service_role;

-- Shared delivery proof for import, maintenance entry and canonical/restore
-- reopening. The ordinary terminal proof is unchanged for nullable additions.
-- Only an explicitly completed UNSENT lease may differ from the last handoff.
create or replace function private.launch_delivery_data_ready_v1()
returns boolean language sql stable security invoker set search_path=pg_catalog as $$
 select not exists(select 1 from public.signup_requests s left join private.launch_delivery_guard g on g.signup_id=s.id
  where s.intent='launch'
   and (g.handoff_token is not null or (s.delivery_template_version is not null
    and (s.delivery_first_attempt_at is not null or s.launch_unsubscribe_hash is not null or s.provider_id is not null)))
   and not coalesce(g.handoff_token is not null and g.handoff_at is not null and g.payload_hash is not null and g.settled
    and (
     (g.handoff_token=s.delivery_token and s.delivery_state in ('sent','failed')
      and ((s.delivery_state='sent' and s.provider_id is not null) or (s.delivery_state='failed' and s.provider_id is null))
      and (g.handoff_state is null or g.handoff_state=s.delivery_state)
      and (g.claim_token is null or g.claim_token=s.delivery_token)
      and g.claim_outcome is null and g.claim_finished_at is null)
     or (g.handoff_state='failed' and s.provider_id is null and s.delivery_template_version='launch-v1'
      and s.launch_token_nonce is not null and s.launch_unsubscribe_hash is not null
      and g.claim_token is not null and g.claim_token<>g.handoff_token
      and s.delivery_first_attempt_at<=g.handoff_at and g.handoff_at<=s.delivery_attempted_at
      and g.claim_finished_at>=s.delivery_attempted_at and isfinite(g.claim_finished_at)
      and ((g.claim_outcome='disabled' and s.delivery_state='disabled' and s.delivery_token=g.claim_token)
       or (g.claim_outcome='cancelled' and s.delivery_state in ('sending','disabled') and s.delivery_token is null
        and s.withdrawn_at is not null and exists(select 1 from private.launch_withdrawal_receipts w
         join private.launch_suppressions x on x.launch_match=w.launch_match and x.withdrawn_at=w.withdrawn_at
         where w.token_hash=s.launch_unsubscribe_hash and w.launch_match=s.launch_match and w.withdrawn_at=s.withdrawn_at))))
    ),false))
  and not exists(select 1 from public.signup_requests s where s.intent='launch' and s.delivery_template_version is null
   and s.delivery_state in ('sending','pending','review') and (s.delivery_first_attempt_at is not null or s.delivery_token is not null));
$$;
revoke all on function private.launch_delivery_data_ready_v1() from public,anon,authenticated;
grant execute on function private.launch_delivery_data_ready_v1() to service_role;

-- Same accepted importer, now restricted to import-purpose authority.
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
 if (select count(*) from private.launch_import_authorizations where operation='import' and expected_scope=p_expected_scope
      and revoked_at is null and verified_at<=clock_timestamp() and expires_at>clock_timestamp())<>1 then
  return inv||jsonb_build_object('outcome','refused');
 end if;
 select * into a from private.launch_import_authorizations where operation='import' and expected_scope=p_expected_scope
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
 -- evidence, including historical v1 dispatch without a modern guard.
 -- Modern signup handoff markers survive even if an incomplete restore omitted
 -- their guard: require a matching pinned, timed, settled terminal result.
 -- Operator review must resolve it without timeout inference.
 if not private.launch_delivery_data_ready_v1() then
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

create or replace function private.read_launch_import_authorization_v1(p_approval_ref text)
returns jsonb language sql security invoker set search_path=pg_catalog as $$
 select jsonb_build_object('approvalRef',approval_ref,'operation',operation,'targetMode',target_mode,
  'restoreSnapshotRef',restore_snapshot_ref,'restoreReplayRef',restore_replay_ref,'restoreCoverageRef',restore_coverage_ref,
  'projectRef',project_ref,'sourceCommit',source_commit,'schemaIdentity',schema_identity,
  'expectedScope',expected_scope,'fenceEpoch',fence_epoch,'writerIds',writer_ids,
  'controlEvidence',control_evidence,'testEvidence',test_evidence,'settlementEvidence',settlement_evidence,
  'verifiedAt',verified_at,'expiresAt',expires_at,'revokedAt',revoked_at,'consumedAt',consumed_at,'postScope',post_scope)
 from private.launch_import_authorizations where approval_ref=p_approval_ref;
$$;

-- Exact source identity/provenance equality and internally observable safety.
-- This cannot prove independently preserved production replay completeness.
create or replace function private.launch_cutover_data_ready_v1(p_match_key text)
returns boolean language sql stable security invoker set search_path=pg_catalog as $$
 select not exists(select 1 from public.waitlist w
  left join private.launch_legacy_provenance p on p.legacy_id=w.id
  left join public.signup_requests s on s.id=p.signup_id
  where p.legacy_id is null or p.legacy_created_at is distinct from w.created_at
   or p.launch_match is distinct from private.launch_import_mac_v1(private.normalize_launch_import_email_v1(w.email),p_match_key)
   or not ((p.outcome='suppressed' and exists(select 1 from private.launch_suppressions x where x.launch_match=p.launch_match))
    or (p.outcome=case when s.registration_origin='legacy_import' then 'review' else 'registered' end
     and s.intent='launch' and s.email=private.normalize_launch_import_email_v1(w.email)
     and s.withdrawn_at is null and not exists(select 1 from private.launch_suppressions x where x.launch_match=p.launch_match))))
 and not exists(select 1 from public.signup_requests s where s.intent='launch' and (
  (s.withdrawn_at is not null and not exists(select 1 from private.launch_suppressions x where x.launch_match=s.launch_match))
  or exists(select 1 from private.launch_suppressions x
   where (x.launch_match=s.launch_match or x.launch_match=private.launch_import_mac_v1(s.email,p_match_key))
    and (s.withdrawn_at is null or s.withdrawn_at is distinct from x.withdrawn_at))))
 and not exists(select 1 from private.launch_withdrawal_receipts w
  left join private.launch_suppressions x on x.launch_match=w.launch_match
  where x.launch_match is null or x.withdrawn_at>w.withdrawn_at)
 and private.launch_delivery_data_ready_v1();
$$;

create or replace function private.set_launch_mode_v1(p_expected_epoch bigint,p_mode text,p_scope text,p_match_key text)
returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare i jsonb; a private.launch_import_authorizations; c private.launch_list_control; result jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended('launch-list-fence',0));
 i:=private.inventory_launch_legacy_v1(p_match_key);
 if p_expected_epoch is null or p_scope is null or p_scope !~ '^[0-9a-f]{64}$'
  or p_mode is null or p_mode not in ('fenced','canonical')
  or not private.launch_write_fence_ready_v1() or (i->>'configured')::boolean is not true
  or (i->>'fenceEpoch')::bigint<>p_expected_epoch or i->>'scopeHash'<>p_scope then
  return i||jsonb_build_object('outcome','refused');
 end if;
 select * into c from private.launch_list_control where singleton;
 if c.mode=p_mode or (p_mode='canonical' and c.mode<>'fenced')
  or (c.restore_required and p_mode<>'canonical') then return i||jsonb_build_object('outcome','refused'); end if;
 if (select count(*) from private.launch_import_authorizations
  where expected_scope=p_scope and fence_epoch=p_expected_epoch and target_mode=p_mode
   and operation=case when c.restore_required then 'restore' else 'mode' end
   and revoked_at is null and consumed_at is null and verified_at<=clock_timestamp() and expires_at>clock_timestamp())<>1 then
  return i||jsonb_build_object('outcome','refused');
 end if;
 select * into a from private.launch_import_authorizations
  where expected_scope=p_scope and fence_epoch=p_expected_epoch and target_mode=p_mode
   and operation=case when c.restore_required then 'restore' else 'mode' end
   and revoked_at is null and consumed_at is null and verified_at<=clock_timestamp() and expires_at>clock_timestamp() for update;
 if a.project_ref is distinct from c.project_ref or a.source_commit is distinct from c.source_commit
  or a.schema_identity is distinct from i->>'schemaIdentity'
  or (select count(distinct w) from unnest(a.writer_ids) w)<>cardinality(a.writer_ids)
  or exists(select 1 from unnest(a.writer_ids) w where length(w)>100)
  or not private.launch_delivery_data_ready_v1() then
  return i||jsonb_build_object('outcome','refused');
 end if;
 if p_mode='canonical' and ((i->'counts'->>'invalid')::bigint<>0 or (i->'counts'->>'conflicts')::bigint<>0
  or not private.launch_cutover_data_ready_v1(p_match_key)) then return i||jsonb_build_object('outcome','refused'); end if;
 -- Fence -> canonical removes the mirror by refusing obsolete v1 launch/direct
 -- waitlist inserts; guarded v2 has always written canonical storage only.
 update private.launch_list_control set mode=p_mode,fence_epoch=fence_epoch+1,restore_required=false where singleton;
 result:=private.inventory_launch_legacy_v1(p_match_key)||jsonb_build_object('outcome','mode_changed',
  'operation',a.operation,'targetMode',p_mode,'equality',p_mode='canonical','writes',2,
  'approvalRef',a.approval_ref,'testedWriterIds',to_jsonb(a.writer_ids),
  'restoreSnapshotRef',a.restore_snapshot_ref,'restoreReplayRef',a.restore_replay_ref,'restoreCoverageRef',a.restore_coverage_ref);
 if not private.launch_write_fence_ready_v1() or a.expires_at<=clock_timestamp() then raise exception 'launch mode unavailable'; end if;
 update private.launch_import_authorizations set consumed_at=clock_timestamp(),post_scope=result->>'scopeHash',result_receipt=result
  where approval_ref=a.approval_ref;
 return result;
end $$;
create or replace function public.set_launch_mode_v1(p_expected_epoch bigint,p_mode text,p_scope text,p_match_key text)
returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
begin return private.set_launch_mode_v1(p_expected_epoch,p_mode,p_scope,p_match_key);
exception when others then raise exception 'launch mode unavailable' using errcode='P0001'; end $$;
revoke all on function private.set_launch_mode_v1(bigint,text,text,text),public.set_launch_mode_v1(bigint,text,text,text),
 private.launch_cutover_data_ready_v1(text) from public,anon,authenticated;
grant execute on function private.set_launch_mode_v1(bigint,text,text,text),public.set_launch_mode_v1(bigint,text,text,text),
 private.launch_cutover_data_ready_v1(text) to service_role;

create table if not exists private.launch_write_fence_contract (
 version integer primary key check(version=1),
 definition_hash text not null check(definition_hash ~ '^[0-9a-f]{64}$')
);
alter table private.launch_write_fence_contract enable row level security;
revoke all on private.launch_write_fence_contract from public,anon,authenticated,service_role;
grant select on private.launch_write_fence_contract to service_role;

create or replace function private.launch_write_fence_fingerprint_v1()
returns text language sql stable security invoker set search_path=pg_catalog as $$
 select encode(sha256(convert_to(jsonb_build_object(
  'functions',(select jsonb_agg(row(n.nspname,p.proname,pg_get_functiondef(p.oid),p.proacl) order by n.nspname,p.proname)
   from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where (n.nspname='public' and p.proname in ('claim_signup_v1','finish_signup_delivery_v1'))
    or (n.nspname='private' and p.proname in ('guard_launch_writes_v1','launch_write_fence_fingerprint_v1','launch_write_fence_ready_v1',
      'claim_launch_signup_v2','pin_launch_payload_v1','authorize_launch_delivery_v1','finish_launch_delivery_v1','withdraw_launch_v1',
      'set_launch_mode_v1','launch_cutover_data_ready_v1','launch_delivery_data_ready_v1','reconcile_launch_legacy_v1','read_launch_import_authorization_v1'))
    or (n.nspname='public' and p.proname='set_launch_mode_v1')),
  'triggers',(select jsonb_agg(row(tgrelid::regclass::text,pg_get_triggerdef(oid),tgenabled) order by tgrelid::regclass::text)
   from pg_trigger where tgname='launch_write_fence'),
  'grants',(select jsonb_agg(row(c.oid::regclass::text,c.relacl,c.relrowsecurity) order by c.oid::regclass::text)
   from pg_class c where c.oid in ('public.waitlist'::regclass,'public.signup_requests'::regclass,
     'private.launch_import_context'::regclass,'private.launch_write_fence_contract'::regclass))
 )::text,'UTF8')),'hex');
$$;
create or replace function private.launch_write_fence_ready_v1()
returns boolean language sql stable security invoker set search_path=pg_catalog as $$
 select current_setting('session_replication_role')='origin'
  and (select count(*) from pg_trigger where tgname='launch_write_fence' and tgenabled='O' and not tgisinternal
   and tgrelid in ('public.waitlist'::regclass,'public.signup_requests'::regclass,'private.launch_legacy_provenance'::regclass,
    'private.launch_suppressions'::regclass,'private.launch_withdrawal_receipts'::regclass,'private.launch_delivery_guard'::regclass,
    'private.launch_list_control'::regclass,'private.launch_import_authorizations'::regclass))=8
  and exists(select 1 from private.launch_write_fence_contract where version=1 and definition_hash=private.launch_write_fence_fingerprint_v1());
$$;
revoke all on function private.launch_write_fence_fingerprint_v1(),private.launch_write_fence_ready_v1() from public,anon,authenticated;
grant execute on function private.launch_write_fence_fingerprint_v1(),private.launch_write_fence_ready_v1() to service_role;
-- Installation attests installed definitions only, NEVER operator control,
-- external settlement, human approval, or source/project deployment binding.
insert into private.launch_write_fence_contract(version,definition_hash) values(1,private.launch_write_fence_fingerprint_v1())
 on conflict(version) do update set definition_hash=excluded.definition_hash;
commit;
