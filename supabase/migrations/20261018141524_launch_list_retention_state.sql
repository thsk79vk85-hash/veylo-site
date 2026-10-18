-- Dormant website-only retention state. No authority issuer, external fact
-- adapter, cleanup operation, schedule, send, binding or public API is installed.
begin;

alter table private.launch_import_authorizations add column retention_key_generation text;
alter table private.launch_import_authorizations drop constraint launch_authorization_purpose;
alter table private.launch_import_authorizations add constraint launch_authorization_purpose check (
 (operation='import' and target_mode is null and restore_snapshot_ref is null
  and restore_replay_ref is null and restore_coverage_ref is null and retention_key_generation is null)
 or (operation='mode' and target_mode is not null and target_mode in ('fenced','canonical')
  and restore_snapshot_ref is null and restore_replay_ref is null and restore_coverage_ref is null and retention_key_generation is null)
 or (operation='restore' and target_mode is not null and target_mode='canonical'
  and restore_snapshot_ref is not null and restore_snapshot_ref ~ '^[a-zA-Z0-9_-]{1,100}$'
  and restore_replay_ref is not null and restore_replay_ref ~ '^[a-zA-Z0-9_-]{1,100}$'
  and restore_coverage_ref is not null and restore_coverage_ref ~ '^[a-zA-Z0-9_-]{1,100}$' and retention_key_generation is null)
 or (operation in ('retention_raw','retention_receipt','retention_marker')
  and target_mode is null and restore_snapshot_ref is null and restore_replay_ref is null and restore_coverage_ref is null
  and retention_key_generation is not null and retention_key_generation ~ '^(0|[1-9][0-9]*)$'
  and (length(retention_key_generation)<19 or (length(retention_key_generation)=19 and retention_key_generation<='9223372036854775807')))
);
comment on column private.launch_import_authorizations.retention_key_generation is
 'Only retention-purpose authority binds a match-key generation. Existing import, mode and restore authorities require NULL. No issuer or retention executor is installed.';

create table private.launch_retention_items (
 item_id uuid primary key,
 source_signup_id uuid unique references public.signup_requests(id),
 launch_match text check(launch_match ~ '^[0-9a-f]{64}$'),
 key_generation text check(key_generation ~ '^(0|[1-9][0-9]*)$'
  and (length(key_generation)<19 or (length(key_generation)=19 and key_generation<='9223372036854775807'))),
 generation bigint not null check(generation>=0),
 fence_epoch bigint not null check(fence_epoch>=0),
 state text not null check(state in ('raw','receipt','marker','retired')),
 policy_version integer not null check(policy_version=1),
 reason_code text not null check(reason_code in ('active_purpose','unavailable','invalid_facts','held','live_reference',
  'unknown_delivery','link_required','restore_required','scope_mismatch','eligible','already_done')),
 evidence_ref text check(evidence_ref ~ '^[a-zA-Z0-9_-]{1,100}$'),
 scope_hash text check(scope_hash ~ '^[0-9a-f]{64}$'),
 withdrawn_at timestamptz check(isfinite(withdrawn_at)),
 decided_at timestamptz not null check(isfinite(decided_at)),
 constraint launch_retention_item_shape check (
  (state='raw' and source_signup_id is not null and launch_match is not null and key_generation is not null
   and evidence_ref is not null and scope_hash is not null and withdrawn_at is not null)
  or (state in ('receipt','marker') and source_signup_id is null and launch_match is not null and key_generation is not null
   and evidence_ref is not null and scope_hash is not null and withdrawn_at is not null)
  or (state='retired' and source_signup_id is null and launch_match is null and key_generation is null
   and evidence_ref is null and scope_hash is null and withdrawn_at is null)
 ),
 unique(key_generation,launch_match)
);
comment on table private.launch_retention_items is
 'Purpose-bound minimal ledger, not an archive or approval. Raw source linkage ends at raw minimization. Match/key/withdrawal/scope/evidence end at marker retirement; retired rows retain only operation anti-replay state until independently assessed retirement. No address, payload, raw token, credential, free text or signup JSON. Decision time never authorizes disposal.';

create table private.launch_retention_delivery (
 item_id uuid not null references private.launch_retention_items(item_id),
 signup_id uuid not null,
 handoff_token uuid not null,
 generation bigint not null check(generation>=0),
 fence_epoch bigint not null check(fence_epoch>=0),
 handoff_at timestamptz not null check(isfinite(handoff_at)),
 outcome text not null check(outcome in ('unknown','pending','sent','failed')),
 settled_at timestamptz check(isfinite(settled_at)),
 provider_ref text check(provider_ref ~ '^[a-zA-Z0-9_-]{1,100}$'),
 claim_token uuid,
 claim_outcome text check(claim_outcome in ('disabled','cancelled')),
 claim_finished_at timestamptz check(isfinite(claim_finished_at)),
 primary key(signup_id,handoff_token),
 constraint launch_retention_delivery_shape check (
  (outcome in ('unknown','pending') and settled_at is null and provider_ref is null)
  or (outcome='sent' and settled_at is not null and settled_at>=handoff_at and provider_ref is not null)
  or (outcome='failed' and settled_at is not null and settled_at>=handoff_at and provider_ref is null)
 ),
 constraint launch_retention_claim_shape check (
  (claim_token is null and claim_outcome is null and claim_finished_at is null)
  or (claim_token is not null and claim_token<>handoff_token and claim_outcome is not null and claim_finished_at is not null)
 )
);
create index launch_retention_delivery_item_idx on private.launch_retention_delivery(item_id);
comment on table private.launch_retention_delivery is
 'Independent exact original-signup/handoff receipt: deliberately no FK to the removable raw signup. Pending/unknown never means settled; an unsent cancelled/disabled claim is separate. Necessary handoff/provider/claim evidence ends only at receipt minimization after owning-purpose checks. No payload or raw identity. Existing finish APIs remain unchanged until a later compatible implementation.';

alter table private.launch_retention_items enable row level security;
alter table private.launch_retention_delivery enable row level security;
revoke all on private.launch_retention_items,private.launch_retention_delivery from public,anon,authenticated,service_role;
-- Task 2 has no retention executor. Only inspection is needed by service callers.
grant select on private.launch_retention_items,private.launch_retention_delivery to service_role;

create function private.guard_launch_retention_state_v1()
returns trigger language plpgsql security invoker set search_path=pg_catalog as $$
declare item private.launch_retention_items;
begin
 -- A row trigger cannot wait for the outer fence after acquiring a tuple lock.
 if not pg_try_advisory_xact_lock(hashtextextended('launch-list-fence',0)) then
  raise exception 'launch retention fenced' using errcode='55000';
 end if;
 if tg_op='UPDATE' then
  if new.generation<>old.generation+1 or new.fence_epoch<old.fence_epoch then
   raise exception 'launch retention generation mismatch' using errcode='23514';
  end if;
 end if;
 if tg_op='DELETE' then return old; end if;
 if not exists(select 1 from private.launch_list_control where singleton and fence_epoch=new.fence_epoch) then
  raise exception 'launch retention epoch mismatch' using errcode='23514';
 end if;
 if tg_table_name='launch_retention_items' then
  if tg_op='UPDATE' then
   if new.item_id<>old.item_id or old.state='retired'
    or array_position(array['raw','receipt','marker','retired'],new.state)<array_position(array['raw','receipt','marker','retired'],old.state)
    or (old.source_signup_id is not null and new.source_signup_id is not null and new.source_signup_id<>old.source_signup_id)
    or (new.state<>'retired' and (new.launch_match is distinct from old.launch_match or new.key_generation is distinct from old.key_generation
     or new.withdrawn_at is distinct from old.withdrawn_at)) then
    raise exception 'launch retention state mismatch' using errcode='23514';
   end if;
  end if;
  if new.state in ('marker','retired') and exists(select 1 from private.launch_retention_delivery d where d.item_id=new.item_id) then
   raise exception 'launch retention receipt remains' using errcode='23514';
  end if;
  if new.state='raw' and not exists(select 1 from public.signup_requests s where s.id=new.source_signup_id and s.intent='launch'
   and s.withdrawn_at=new.withdrawn_at and s.launch_match=new.launch_match) then
   raise exception 'launch retention source mismatch' using errcode='23514';
  end if;
 else
  select * into item from private.launch_retention_items where item_id=new.item_id;
  if not found or item.state not in ('raw','receipt') or new.generation<>item.generation or new.fence_epoch<>item.fence_epoch
   or (item.state='raw' and new.signup_id<>item.source_signup_id) then
   raise exception 'launch retention receipt scope mismatch' using errcode='23514';
  end if;
  if tg_op='UPDATE' then
   if new.item_id<>old.item_id or new.signup_id<>old.signup_id or new.handoff_token<>old.handoff_token or new.handoff_at<>old.handoff_at
    or (old.outcome in ('sent','failed') and (new.outcome<>old.outcome or new.provider_ref is distinct from old.provider_ref
     or new.settled_at is distinct from old.settled_at))
    or (old.claim_outcome is not null and (new.claim_token is distinct from old.claim_token
     or new.claim_outcome is distinct from old.claim_outcome or new.claim_finished_at is distinct from old.claim_finished_at)) then
    raise exception 'launch retention receipt conflict' using errcode='23514';
   end if;
  end if;
 end if;
 return new;
end $$;
revoke all on function private.guard_launch_retention_state_v1() from public,anon,authenticated,service_role;
create trigger launch_retention_state_guard before insert or update or delete on private.launch_retention_items
 for each row execute function private.guard_launch_retention_state_v1();
create trigger launch_retention_state_guard before insert or update or delete on private.launch_retention_delivery
 for each row execute function private.guard_launch_retention_state_v1();

create function private.launch_retention_context_v1(p_item_id uuid,p_generation bigint)
returns jsonb language plpgsql stable security invoker set search_path=pg_catalog as $$
declare item private.launch_retention_items; c private.launch_list_control; s public.signup_requests;
 scope jsonb; withdrawal jsonb; at_text text;
begin
 if p_item_id is null or p_generation is null or p_generation<0 or not private.launch_write_fence_ready_v1() then
  return jsonb_build_object('state','unavailable');
 end if;
 select * into item from private.launch_retention_items where item_id=p_item_id and generation=p_generation;
 if not found or item.state='retired' then return jsonb_build_object('state','unavailable'); end if;
 select * into c from private.launch_list_control where singleton;
 if c.project_ref is null or c.source_commit is null or item.fence_epoch<>c.fence_epoch then
  return jsonb_build_object('state','unavailable');
 end if;
 if item.state='raw' then
  select * into s from public.signup_requests where id=item.source_signup_id and intent='launch';
  if not found or s.withdrawn_at is distinct from item.withdrawn_at or s.launch_match is distinct from item.launch_match then
   return jsonb_build_object('state','unavailable');
  end if;
 end if;
 scope:=jsonb_build_object('state','verified','projectRef',c.project_ref,'sourceCommit',c.source_commit,
  'schemaIdentity',private.launch_import_schema_v1(),'keyGeneration',item.key_generation,'scopeHash',item.scope_hash);
 at_text:=to_char(item.withdrawn_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
 withdrawal:=jsonb_build_object('state','verified','evidenceRef',item.evidence_ref,'generation',item.generation::text,
  'epoch',item.fence_epoch::text,'scope',scope,'purposes',jsonb_build_array(),'status','withdrawn','at',at_text);
 return jsonb_build_object('lane',item.state,'intent','launch','consent',coalesce(s.consent_status,'unknown'),
  'completed',false,'withdrawnAt',at_text,'generation',item.generation::text,'epoch',item.fence_epoch::text,
  'scope',scope,'withdrawal',withdrawal,
  'necessity',jsonb_build_object('state','unavailable'),'references',jsonb_build_object('state','unavailable'),
  'hold',jsonb_build_object('state','unavailable'),'delivery',jsonb_build_object('state','unavailable'),
  'link',jsonb_build_object('state','unavailable'),'suppression',jsonb_build_object('state','unavailable'),
  'restore',jsonb_build_object('state','unavailable'));
end $$;
revoke all on function private.launch_retention_context_v1(uuid,bigint) from public,anon,authenticated,service_role;
grant execute on function private.launch_retention_context_v1(uuid,bigint) to service_role;
comment on function private.launch_retention_context_v1(uuid,bigint) is
 'Read-only owning-state context, never a decision/authority setter. Production necessity/reference/hold/delivery/link/suppression/independent-restore bindings are unavailable. Local tables or a restored snapshot cannot self-certify external coverage. Unknown consent remains unknown.';

-- Extend the SAME owner-installed safety fingerprint. Service can inspect but
-- cannot certify altered definitions, ACLs, constraints, policies or triggers.
create or replace function private.launch_write_fence_fingerprint_v1()
returns text language sql stable security invoker set search_path=pg_catalog as $$
 select encode(sha256(convert_to(jsonb_build_object(
  'functions',(select jsonb_agg(row(n.nspname,p.proname,pg_get_functiondef(p.oid),p.proacl) order by n.nspname,p.proname,pg_get_function_identity_arguments(p.oid))
   from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where (n.nspname='public' and p.proname in ('claim_signup_v1','finish_signup_delivery_v1','set_launch_mode_v1'))
    or (n.nspname='private' and (p.proname in ('guard_launch_writes_v1','launch_write_fence_fingerprint_v1','launch_write_fence_ready_v1',
      'claim_launch_signup_v2','pin_launch_payload_v1','authorize_launch_delivery_v1','finish_launch_delivery_v1','withdraw_launch_v1',
      'set_launch_mode_v1','launch_cutover_data_ready_v1','launch_delivery_data_ready_v1','reconcile_launch_legacy_v1','read_launch_import_authorization_v1')
      or p.proname like '%launch_retention%'))),
  'triggers',(select jsonb_agg(row(tgrelid::regclass::text,pg_get_triggerdef(oid),tgenabled) order by tgrelid::regclass::text,tgname)
   from pg_trigger where tgname in ('launch_write_fence','launch_retention_state_guard')),
  'grants',(select jsonb_agg(row(c.oid::regclass::text,c.relacl,c.relrowsecurity,c.relforcerowsecurity) order by c.oid::regclass::text)
   from pg_class c where c.oid in ('public.waitlist'::regclass,'public.signup_requests'::regclass,
    'private.launch_import_context'::regclass,'private.launch_write_fence_contract'::regclass,
    'private.launch_retention_items'::regclass,'private.launch_retention_delivery'::regclass)),
  'columns',(select jsonb_agg(row(attrelid::regclass::text,attname,format_type(atttypid,atttypmod),attnotnull) order by attrelid::regclass::text,attnum)
   from pg_attribute where attrelid in ('private.launch_retention_items'::regclass,'private.launch_retention_delivery'::regclass)
    and attnum>0 and not attisdropped),
  'constraints',(select jsonb_agg(row(conrelid::regclass::text,conname,pg_get_constraintdef(oid)) order by conrelid::regclass::text,conname)
   from pg_constraint where conrelid in ('private.launch_retention_items'::regclass,'private.launch_retention_delivery'::regclass)
    or (conrelid='private.launch_import_authorizations'::regclass and conname='launch_authorization_purpose')),
  'policies',(select jsonb_agg(to_jsonb(p) order by schemaname,tablename,policyname) from pg_policies p
   where schemaname='private' and tablename in ('launch_retention_items','launch_retention_delivery')),
  'indexes',(select jsonb_agg(indexdef order by indexname) from pg_indexes where schemaname='private'
   and tablename in ('launch_retention_items','launch_retention_delivery'))
 )::text,'UTF8')),'hex');
$$;
revoke all on function private.launch_write_fence_fingerprint_v1() from public,anon,authenticated;
grant execute on function private.launch_write_fence_fingerprint_v1() to service_role;
update private.launch_write_fence_contract set definition_hash=private.launch_write_fence_fingerprint_v1() where version=1;
commit;
