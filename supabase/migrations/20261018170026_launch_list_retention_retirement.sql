-- Website-only, dormant forward contract. Rulings 9/10/11: owning field proofs,
-- irreversible erasure, actual pre-command deadlines, independent CURRENT
-- complete restore coverage. No issuer, setter, adapter, schedule or activation.
begin;

create function private.launch_retention_field_context_v1(p_item_id uuid,p_generation bigint)
returns jsonb language sql stable security invoker set search_path=pg_catalog as $$
 select '{"state":"unavailable"}'::jsonb;
$$;
create function private.launch_retention_restore_coverage_v1(p_approval_ref text,p_scope text,p_epoch bigint)
returns jsonb language sql stable security invoker set search_path=pg_catalog as $$
 select '{"state":"unavailable"}'::jsonb;
$$;
comment on function private.launch_retention_field_context_v1(uuid,bigint) is
 'Read-only trusted integration boundary. Exact allowlisted table.column paths map to complete structured scope/generation/epoch/purpose proofs. Default unavailable; installation and empty arrays cannot establish purpose end. No production binding or public setter.';
comment on function private.launch_retention_restore_coverage_v1(text,text,bigint) is
 'Default unavailable. A real independent adapter must hold a stable source head/fence through activation and attest COMPLETE current replay coverage, including absent snapshot identities and all live keys. SQL cannot distinguish owner-forged JSON from genuine external evidence. No production adapter or replay importer is installed.';
revoke all on function private.launch_retention_field_context_v1(uuid,bigint),private.launch_retention_restore_coverage_v1(text,text,bigint) from public,anon,authenticated;
grant execute on function private.launch_retention_field_context_v1(uuid,bigint),private.launch_retention_restore_coverage_v1(text,text,bigint) to service_role;

-- A field appears here only after its value has actually been erased. Metadata
-- is monotonic, is not an assessment, and never permits restoring that value.
alter table private.launch_retention_delivery add column minimized_fields text[] not null default '{}';
alter table private.launch_retention_delivery alter column handoff_at drop not null;
alter table private.launch_retention_delivery drop constraint launch_retention_delivery_shape;
alter table private.launch_retention_delivery drop constraint launch_retention_claim_shape;
alter table private.launch_legacy_provenance add column minimized_fields text[] not null default '{}';
alter table private.launch_legacy_provenance alter column legacy_created_at drop not null;
alter table private.launch_legacy_provenance alter column launch_match drop not null;
alter table private.launch_retention_items add column minimized_fields text[] not null default '{}';
alter table private.launch_retention_items alter column policy_version drop not null,
 alter column reason_code drop not null,alter column decided_at drop not null;
alter table private.launch_import_context add column owner_postmaster_start timestamptz,
 add column owner_backend_start timestamptz;
create function private.guard_launch_retention_context_owner_v1()
returns trigger language plpgsql security invoker set search_path=pg_catalog as $$
begin
 if not pg_try_advisory_xact_lock(hashtextextended('launch-list-fence',0)) then raise exception 'launch retention fenced' using errcode='55000';end if;
 if tg_op='INSERT' then
  if new.transaction_id=pg_current_xact_id() and new.backend_pid=pg_backend_pid() then
   new.owner_postmaster_start:=pg_postmaster_start_time();
   select backend_start into new.owner_backend_start from pg_stat_activity where pid=pg_backend_pid();
  elsif current_user<>pg_get_userbyid((select relowner from pg_class where oid=tg_relid))
   and (new.owner_postmaster_start is not null or new.owner_backend_start is not null) then
   raise exception 'launch retention context provenance unavailable' using errcode='42501';
  end if;
 elsif new.owner_postmaster_start is distinct from old.owner_postmaster_start or new.owner_backend_start is distinct from old.owner_backend_start
  or new.transaction_id is distinct from old.transaction_id or new.backend_pid is distinct from old.backend_pid
  or new.approval_ref is distinct from old.approval_ref or new.expected_scope is distinct from old.expected_scope or new.fence_epoch is distinct from old.fence_epoch then
  raise exception 'launch retention context provenance immutable' using errcode='23514';
 end if;
 return new;
end $$;
create trigger launch_retention_context_owner before insert or update on private.launch_import_context
 for each row execute function private.guard_launch_retention_context_owner_v1();
alter table private.launch_import_authorizations add column minimized_fields text[] not null default '{}',
 add column retention_item_id uuid, add column retention_mapping_scope text check(retention_mapping_scope ~ '^[0-9a-f]{64}$');
create index launch_retention_authority_item_idx on private.launch_import_authorizations(retention_item_id) where retention_item_id is not null;
update private.launch_import_authorizations set retention_item_id=(result_receipt->>'workId')::uuid
 where operation in ('retention_raw','retention_receipt','retention_marker') and consumed_at is not null
 and result_receipt->>'workId' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
-- No FK to a retired item: the consumed operation marker can independently
-- outlive its item, and does not compel keeping subscriber matching facts.
do $$ declare n text;r record;begin
 foreach n in array array['project_ref','source_commit','schema_identity','expected_scope','writer_ids','control_evidence',
  'test_evidence','settlement_evidence','verified_at','expires_at'] loop
  execute format('alter table private.launch_import_authorizations alter column %I drop not null',n);
 end loop;
 for r in select conname from pg_constraint where conrelid='private.launch_import_authorizations'::regclass
  and contype='c' and pg_get_constraintdef(oid) like '%consumed_at IS NULL%post_scope IS NULL%result_receipt IS NULL%' loop
  execute format('alter table private.launch_import_authorizations drop constraint %I',r.conname);
 end loop;
end $$;

-- Complete leaf proofs have the same binding as the owning context. A missing,
-- stale, malformed or unknown proof is not an empty set of live purposes.
create function private.launch_retention_proof_status_v1(f jsonb,p jsonb)
returns text language plpgsql immutable security invoker set search_path=pg_catalog as $$
begin
 if p is null or p->>'state'='unavailable' then return 'unavailable';end if;
 if jsonb_typeof(p)<>'object' or p->>'state' is distinct from 'verified'
  or jsonb_typeof(p->'evidenceRef') is distinct from 'string' or p->>'evidenceRef' !~ '^[a-zA-Z0-9_-]{1,100}$'
  or jsonb_typeof(p->'generation') is distinct from 'string' or jsonb_typeof(p->'epoch') is distinct from 'string'
  or jsonb_typeof(p->'scope') is distinct from 'object' or jsonb_typeof(p->'purposes') is distinct from 'array' then return 'invalid_facts';end if;
 if p->>'generation' is distinct from f->>'generation' or p->>'epoch' is distinct from f->>'epoch'
  or p->'scope' is distinct from f->'scope' then return 'scope_mismatch';end if;
 if not p->'purposes'<@'["launch_notification","beta","account","required_record","legacy_mapping","operation_replay","delivery_reference","complaint","legal_hold","late_result","no_resend","reconciliation","restore","usable_link","post_send_minimum","lookup","current_intake","old_writer","import","campaign","replay","suppression"]'::jsonb
  or jsonb_array_length(p->'purposes')<>(select count(distinct value) from jsonb_array_elements(p->'purposes')) then return 'invalid_facts';end if;
 if p->'purposes'='[]'::jsonb then return 'ended';end if;return 'live';
end $$;

create function private.launch_retention_context_dead_v1(x private.launch_import_context)
returns boolean language plpgsql volatile security invoker set search_path=pg_catalog as $$
declare status text;begin
 -- PostgreSQL's transaction status is authoritative. NULL/too-old/unavailable
 -- status is review; neither a missing PID nor elapsed age establishes death.
 if x.owner_postmaster_start is distinct from pg_postmaster_start_time() or x.owner_backend_start is null then return false;end if;
 status:=pg_xact_status(x.transaction_id);
 return coalesce(status in ('committed','aborted') and not exists(select 1 from pg_stat_activity
  where pid=x.backend_pid and backend_start=x.owner_backend_start and backend_xid::text=(mod(x.transaction_id::text::numeric,4294967296))::text),false);
exception when others then return false;
end $$;

create function private.launch_retention_minimize_v1(p_item_id uuid,p_generation bigint,p_epoch bigint,p_scope text,p_approval_ref text,p_operation text)
returns jsonb language plpgsql security definer set search_path=pg_catalog set lock_timeout='1000ms' as $$
declare i private.launch_retention_items;c private.launch_list_control;a private.launch_import_authorizations;
 d private.launch_retention_delivery;v private.launch_legacy_provenance;b private.launch_import_authorizations;x private.launch_import_context;
 f jsonb;p jsonb;patch jsonb;n text;path text;status text;blocked text;fields text[];done boolean;changed boolean;
 writes integer:=0;affected integer;deadline integer;result jsonb;new_generation bigint;mapping_changed boolean:=false;remove_item boolean:=false;
 retire_match boolean:=false;item_fields text[];intake_blocked boolean:=false;
begin
 result:=jsonb_build_object('outcome','refused','workId',p_item_id,'generation',p_generation::text,'reason','scope_mismatch','writes',0);
 if p_item_id is null or p_generation is null or p_generation<0 or p_epoch is null or p_epoch<0
  or p_scope is null or p_scope !~ '^[0-9a-f]{64}$' or p_approval_ref is null or p_approval_ref !~ '^[a-zA-Z0-9_-]{1,100}$'
  or p_operation is null or p_operation not in ('retention_receipt','retention_marker') then return result;end if;
 -- Admission only, not proof of arming a timer. A trusted transport MUST set a
 -- real 1..5000ms deadline BEFORE dispatch, and sanitize out-of-body failures.
 select setting::integer into deadline from pg_settings where name='statement_timeout';
 if deadline is null or deadline<1 or deadline>5000 then return result||jsonb_build_object('reason','unavailable');end if;
 perform pg_advisory_xact_lock(hashtextextended('launch-list-fence',0));
 if not private.launch_write_fence_ready_v1() then return result;end if;
 select * into c from private.launch_list_control where singleton for update;
 select * into a from private.launch_import_authorizations where approval_ref=p_approval_ref for update;
 if not found or c.mode not in ('canonical','fenced') or c.restore_required or c.fence_epoch<>p_epoch
  or a.operation<>p_operation or a.consumed_at is not null or a.minimized_fields<>'{}'
  or a.project_ref is distinct from c.project_ref or a.source_commit is distinct from c.source_commit
  or a.schema_identity is distinct from private.launch_import_schema_v1() or a.expected_scope is distinct from p_scope or a.fence_epoch<>p_epoch
  or a.revoked_at is not null or a.verified_at>clock_timestamp() or a.expires_at<=clock_timestamp()
  or (select count(distinct w) from unnest(a.writer_ids) w)<>cardinality(a.writer_ids)
  or exists(select 1 from unnest(a.writer_ids) w where length(w)>100) then return result;end if;
 select * into i from private.launch_retention_items where item_id=p_item_id for update;
 if not found or i.state not in ('receipt','marker','retired') or i.generation<>p_generation
  or (i.state='retired' and (p_operation<>'retention_marker' or i.fence_epoch>p_epoch))
  or (i.state<>'retired' and (i.fence_epoch<>p_epoch or i.key_generation is distinct from a.retention_key_generation or i.scope_hash is distinct from p_scope)) then return result;end if;
 item_fields:=i.minimized_fields;
 -- Deterministic owning locks, after the outer fence. No beta/email/table lock.
 perform 1 from private.launch_retention_delivery where item_id=i.item_id order by signup_id,handoff_token for update;
 perform 1 from private.launch_legacy_provenance where disposition_id=i.item_id or launch_match=i.launch_match order by legacy_id for update;
 perform 1 from private.launch_import_authorizations where retention_item_id=i.item_id order by approval_ref for update;
 perform 1 from private.launch_import_context where launch_match=i.launch_match or approval_ref in
  (select approval_ref from private.launch_import_authorizations where retention_item_id=i.item_id) order by transaction_id for update;
 perform 1 from private.launch_suppressions where launch_match=i.launch_match for update;
 perform 1 from private.launch_withdrawal_receipts where launch_match=i.launch_match order by token_hash for update;
 if private.launch_retention_retirement_scope_v1(i.item_id) is distinct from p_scope then return result;end if;
 f:=private.launch_retention_context_v1(i.item_id,i.generation);
 if f is null or f->>'lane' is distinct from i.state or f->>'intent' is distinct from 'launch'
  or f->>'generation' is distinct from i.generation::text or f->>'epoch' is distinct from p_epoch::text
  or f->'scope' is distinct from jsonb_build_object('state','verified','projectRef',c.project_ref,'sourceCommit',c.source_commit,
   'schemaIdentity',a.schema_identity,'keyGeneration',a.retention_key_generation,'scopeHash',p_scope) then
  return result||jsonb_build_object('outcome','review','reason','unavailable');end if;
 foreach n in array array['withdrawal','necessity','references','hold','delivery','link','suppression','restore'] loop
  status:=private.launch_retention_proof_status_v1(f,f->n);
  if status not in ('ended','live') then return result||jsonb_build_object('outcome','review','reason',status);end if;
 end loop;
 if f->'withdrawal'->>'status' is distinct from 'withdrawn' or (i.state<>'retired' and f->'withdrawal'->>'at' is distinct from
  to_char(i.withdrawn_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) then return result||jsonb_build_object('outcome','review','reason','invalid_facts');end if;
 if f->'necessity'->'purposes'<>'[]' then return result||jsonb_build_object('outcome','review','reason','active_purpose');end if;
 if f->'hold'->'purposes'<>'[]' then return result||jsonb_build_object('outcome','review','reason','held');end if;
 if f->'references'->'purposes'<>'[]' then return result||jsonb_build_object('outcome','review','reason','live_reference');end if;
 if f->'restore'->'independent' is distinct from 'true'::jsonb or f->'restore'->'current' is distinct from 'true'::jsonb then
  return result||jsonb_build_object('outcome','review','reason','restore_required');end if;
 if p_operation='retention_receipt' then
  for d in select * from private.launch_retention_delivery where item_id=i.item_id order by signup_id,handoff_token loop
   patch:='{}';fields:=d.minimized_fields;done:=true;
   for n in select key from jsonb_each(to_jsonb(d)-'minimized_fields') where value<>'null'::jsonb loop
    status:=private.launch_retention_proof_status_v1(f,f->'fieldPurposes'->('launch_retention_delivery.'||n));
    if status<>'ended' then done:=false;if status<>'live' then blocked:=coalesce(blocked,status);end if;end if;
    if status='ended' and n=any(array['provider_ref','claim_token','claim_outcome','claim_finished_at','settled_at','handoff_at'])
     and (d.outcome in ('sent','failed') or n=any(array['claim_token','claim_outcome','claim_finished_at'])) then
     patch:=patch||jsonb_build_object(n,null);fields:=array_append(fields,n);
    end if;
   end loop;
   if d.outcome in ('unknown','pending') then done:=false;blocked:='unknown_delivery';end if;
   if done then delete from private.launch_retention_delivery where signup_id=d.signup_id and handoff_token=d.handoff_token;writes:=writes+1;
   elsif patch<>'{}' then
    d:=jsonb_populate_record(d,patch);
    update private.launch_retention_delivery set provider_ref=d.provider_ref,claim_token=d.claim_token,claim_outcome=d.claim_outcome,
     claim_finished_at=d.claim_finished_at,settled_at=d.settled_at,handoff_at=d.handoff_at,minimized_fields=fields,
     generation=i.generation,fence_epoch=i.fence_epoch where signup_id=d.signup_id and handoff_token=d.handoff_token;writes:=writes+1;
   end if;
  end loop;
  for v in select * from private.launch_legacy_provenance where disposition_id=i.item_id order by legacy_id loop
   patch:='{}';fields:=v.minimized_fields;done:=true;
   if exists(select 1 from public.waitlist where id=v.legacy_id) or v.signup_id is not null then blocked:=coalesce(blocked,'live_reference');continue;end if;
   for n in select key from jsonb_each(to_jsonb(v)-'minimized_fields') where value<>'null'::jsonb loop
    status:=private.launch_retention_proof_status_v1(f,f->'fieldPurposes'->('launch_legacy_provenance.'||n));
    if status<>'ended' then done:=false;if status<>'live' then blocked:=coalesce(blocked,status);end if;end if;
    if status='ended' and n=any(array['legacy_created_at','launch_match']) then patch:=patch||jsonb_build_object(n,null);fields:=array_append(fields,n);end if;
   end loop;
   if done then delete from private.launch_legacy_provenance where legacy_id=v.legacy_id;writes:=writes+1;mapping_changed:=true;
   elsif patch<>'{}' then v:=jsonb_populate_record(v,patch);
    update private.launch_legacy_provenance set legacy_created_at=v.legacy_created_at,launch_match=v.launch_match,minimized_fields=fields where legacy_id=v.legacy_id;
    writes:=writes+1;mapping_changed:=true;
   end if;
  end loop;
  if mapping_changed then
   update private.launch_import_authorizations set retention_mapping_scope=private.launch_retention_legacy_scope_v1(i.item_id)
    where operation='retention_raw' and retention_item_id=i.item_id and consumed_at is not null;
   get diagnostics affected=row_count;writes:=writes+affected;
  end if;
 end if;
 -- Context and authority cohorts are independent of delivery and matching
 -- facts; marker retirement may finish old epoch-invalidated operation markers.
  for x in select * from private.launch_import_context where launch_match=i.launch_match or approval_ref in
   (select approval_ref from private.launch_import_authorizations where retention_item_id=i.item_id) order by transaction_id loop
   done:=true;
   foreach n in array array['transaction_id','backend_pid','approval_ref','expected_scope','fence_epoch','legacy_id','signup_id','launch_match','owner_postmaster_start','owner_backend_start'] loop
    status:=private.launch_retention_proof_status_v1(f,f->'fieldPurposes'->('launch_import_context.'||n));
    if status<>'ended' then done:=false;if status<>'live' then blocked:=coalesce(blocked,status);end if;end if;
   end loop;
   if not private.launch_retention_context_dead_v1(x) then done:=false;blocked:=coalesce(blocked,'live_reference');end if;
   if done then delete from private.launch_import_context where transaction_id=x.transaction_id;writes:=writes+1;end if;
  end loop;
  for b in select * from private.launch_import_authorizations where retention_item_id=i.item_id and consumed_at is not null order by approval_ref loop
   if exists(select 1 from private.launch_import_context where approval_ref=b.approval_ref) then blocked:=coalesce(blocked,'live_reference');continue;end if;
   patch:='{}';fields:=b.minimized_fields;done:=true;
   for n in select key from jsonb_each(to_jsonb(b)-array['minimized_fields','retention_mapping_scope']) where value<>'null'::jsonb loop
    status:=private.launch_retention_proof_status_v1(f,f->'fieldPurposes'->('launch_import_authorizations.'||n));
    if status<>'ended' then done:=false;if status<>'live' then blocked:=coalesce(blocked,status);end if;end if;
    if n=any(array['project_ref','source_commit','schema_identity','expected_scope','writer_ids','control_evidence','test_evidence','settlement_evidence',
     'verified_at','expires_at','revoked_at','target_mode','restore_snapshot_ref','restore_replay_ref','restore_coverage_ref','retention_key_generation','post_scope','result_receipt'])
     and status='ended' then
     if n='post_scope' and exists(select 1 from private.launch_legacy_provenance where disposition_id=i.item_id) then done:=false;
     else patch:=patch||jsonb_build_object(n,null);fields:=array_append(fields,n);end if;
    end if;
   end loop;
   -- A consumed marker is a cohort. Its immutable epoch must be invalidated by
   -- the REAL monotonic control epoch before the marker can disappear. Expiry
   -- or revocation alone is never proof, and same-epoch authorities cannot replay.
   if done and b.fence_epoch<c.fence_epoch and not exists(select 1 from private.launch_legacy_provenance where disposition_id=i.item_id) then
    delete from private.launch_import_authorizations where approval_ref=b.approval_ref;writes:=writes+1;
   elsif patch<>'{}' then
    b:=jsonb_populate_record(b,patch);
    update private.launch_import_authorizations set project_ref=b.project_ref,source_commit=b.source_commit,schema_identity=b.schema_identity,
     expected_scope=b.expected_scope,writer_ids=b.writer_ids,control_evidence=b.control_evidence,test_evidence=b.test_evidence,settlement_evidence=b.settlement_evidence,
     verified_at=b.verified_at,expires_at=b.expires_at,revoked_at=b.revoked_at,target_mode=b.target_mode,restore_snapshot_ref=b.restore_snapshot_ref,
     restore_replay_ref=b.restore_replay_ref,restore_coverage_ref=b.restore_coverage_ref,retention_key_generation=b.retention_key_generation,
     post_scope=b.post_scope,result_receipt=b.result_receipt,minimized_fields=fields where approval_ref=b.approval_ref;writes:=writes+1;
   end if;
  end loop;
 if p_operation='retention_marker' then
  -- Link/hash and keyed-suppression cohorts are independent. A still-usable
  -- link, unknown last ACTUAL send, late handoff or post-send minimum retains it.
  if exists(select 1 from private.launch_withdrawal_receipts where launch_match=i.launch_match) then
   done:=true;
   foreach n in array array['token_hash','launch_match','withdrawn_at'] loop
    status:=private.launch_retention_proof_status_v1(f,f->'fieldPurposes'->('launch_withdrawal_receipts.'||n));
    if status<>'ended' then done:=false;if status<>'live' then blocked:=coalesce(blocked,status);end if;end if;
   end loop;
   if done and f->'link'->'purposes'='[]' and f->'link'->'routeRetired'='true' and f->'link'->'lateHandoffClosed'='true' then
    if exists(select 1 from private.launch_retention_delivery where item_id=i.item_id and outcome in ('unknown','pending')) then
     blocked:=coalesce(blocked,'unknown_delivery');
    elsif jsonb_typeof(f->'link'->'lastActualSendAt') is distinct from 'string' then blocked:=coalesce(blocked,'link_required');
    elsif f->'link'->>'lastActualSendAt' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,6})?Z$' then blocked:=coalesce(blocked,'invalid_facts');
    else
     begin
      if not isfinite((f->'link'->>'lastActualSendAt')::timestamptz) then blocked:=coalesce(blocked,'invalid_facts');
      elsif (f->'link'->>'lastActualSendAt')::timestamptz<=clock_timestamp()-interval '30 days' then
       delete from private.launch_withdrawal_receipts where launch_match=i.launch_match;get diagnostics affected=row_count;writes:=writes+affected;
      end if;
     exception when invalid_datetime_format or datetime_field_overflow then blocked:=coalesce(blocked,'invalid_facts');end;
    end if;
   end if;
  end if;
  if exists(select 1 from private.launch_suppressions where launch_match=i.launch_match) then
   done:=true;
   foreach n in array array['launch_match','withdrawn_at','basis'] loop
    status:=private.launch_retention_proof_status_v1(f,f->'fieldPurposes'->('launch_suppressions.'||n));
    if status<>'ended' then done:=false;if status<>'live' then blocked:=coalesce(blocked,status);end if;end if;
   end loop;
   if not private.launch_retention_keys_valid_v1(f->'suppression'->'liveKeyGenerations') then
    done:=false;blocked:=coalesce(blocked,'invalid_facts');
   end if;
   if done and c.mode<>'fenced' then intake_blocked:=true;end if;
   if done and c.mode='fenced' and f->'suppression'->'purposes'='[]'
    and not f->'suppression'->'liveKeyGenerations' @> jsonb_build_array(i.key_generation)
    and not exists(select 1 from private.launch_withdrawal_receipts where launch_match=i.launch_match)
    and not exists(select 1 from private.launch_retention_delivery where item_id=i.item_id)
    and not exists(select 1 from private.launch_legacy_provenance where disposition_id=i.item_id or launch_match=i.launch_match)
    and not exists(select 1 from private.launch_import_context where launch_match=i.launch_match)
    and not exists(select 1 from public.signup_requests where intent='launch' and launch_match=i.launch_match) then
    delete from private.launch_suppressions where launch_match=i.launch_match;get diagnostics affected=row_count;writes:=writes+affected;
   end if;
  end if;
  done:=true;
  for n in select key from jsonb_each(to_jsonb(i)-'minimized_fields') where value<>'null'::jsonb loop
   status:=private.launch_retention_proof_status_v1(f,f->'fieldPurposes'->('launch_retention_items.'||n));
   if status<>'ended' then done:=false;if status<>'live' then blocked:=coalesce(blocked,status);end if;end if;
   if status='ended' and n=any(array['policy_version','reason_code','decided_at']) then item_fields:=array_append(item_fields,n);end if;
  end loop;
  -- Absence of a local lookup row scopes leaf work; it never proves the owning
  -- matching facts ended. Their own proofs and complete current key purposes
  -- remain mandatory even after separate lookup/operation retirement.
  if c.mode='fenced' and i.state<>'retired' and f->'link'->'purposes'='[]' and f->'suppression'->'purposes'='[]'
   and private.launch_retention_keys_valid_v1(f->'suppression'->'liveKeyGenerations')
   and not f->'suppression'->'liveKeyGenerations' @> jsonb_build_array(i.key_generation)
   and not exists(select 1 from unnest(array['launch_match','key_generation','withdrawn_at','evidence_ref','scope_hash']) q
    where private.launch_retention_proof_status_v1(f,f->'fieldPurposes'->('launch_retention_items.'||q))<>'ended')
   and not exists(select 1 from private.launch_suppressions where launch_match=i.launch_match)
   and not exists(select 1 from private.launch_withdrawal_receipts where launch_match=i.launch_match)
   and not exists(select 1 from private.launch_retention_delivery where item_id=i.item_id)
   and not exists(select 1 from private.launch_legacy_provenance where disposition_id=i.item_id)
   and not exists(select 1 from private.launch_import_context where launch_match=i.launch_match) then retire_match:=true;end if;
  if done and c.mode='fenced' and f->'link'->'purposes'='[]' and f->'suppression'->'purposes'='[]'
   and private.launch_retention_keys_valid_v1(f->'suppression'->'liveKeyGenerations')
   and not f->'suppression'->'liveKeyGenerations' @> jsonb_build_array(coalesce(i.key_generation,a.retention_key_generation))
   and not exists(select 1 from private.launch_suppressions where launch_match=i.launch_match)
   and not exists(select 1 from private.launch_withdrawal_receipts where launch_match=i.launch_match)
   and not exists(select 1 from private.launch_retention_delivery where item_id=i.item_id)
   and not exists(select 1 from private.launch_legacy_provenance where disposition_id=i.item_id)
   and not exists(select 1 from private.launch_import_context where launch_match=i.launch_match)
   and not exists(select 1 from private.launch_import_authorizations where retention_item_id=i.item_id) then
   delete from private.launch_retention_items where item_id=i.item_id;writes:=writes+1;remove_item:=true;
  end if;
 end if;
 if writes=0 and not retire_match and item_fields=i.minimized_fields then return result||jsonb_build_object('outcome',case when blocked is not null then 'review' when intake_blocked then 'refused' else 'retained' end,
  'reason',coalesce(blocked,'live_reference'));end if;
 new_generation:=i.generation+1;
 if not remove_item then
  update private.launch_retention_items set generation=new_generation,fence_epoch=p_epoch,
   state=case when retire_match or i.state='retired' then 'retired' when exists(select 1 from private.launch_retention_delivery where item_id=i.item_id) then 'receipt' else 'marker' end,
   launch_match=case when retire_match then null else launch_match end,key_generation=case when retire_match then null else key_generation end,
   withdrawn_at=case when retire_match then null else withdrawn_at end,evidence_ref=case when retire_match then null else evidence_ref end,
   scope_hash=case when retire_match then null else scope_hash end,minimized_fields=item_fields,
   policy_version=case when 'policy_version'=any(item_fields) then null else policy_version end,
   decided_at=case when 'decided_at'=any(item_fields) then null else decided_at end,
   reason_code=case when 'reason_code'=any(item_fields) then null else reason_code end where item_id=i.item_id;writes:=writes+1;
 end if;
 result:=jsonb_build_object('outcome',case when blocked is not null then 'review' when remove_item or retire_match or i.state='retired' then 'retired' else 'minimized' end,
  'workId',i.item_id,'generation',new_generation::text,'reason',coalesce(blocked,'eligible'),'writes',writes+1+case when remove_item then 1 else 0 end);
 update private.launch_import_authorizations set consumed_at=clock_timestamp(),post_scope=coalesce(private.launch_retention_retirement_scope_v1(i.item_id),p_scope),result_receipt=result
  where approval_ref=a.approval_ref;
 -- At complete independently proven closure there is no surviving work object
 -- to replay against. Consume, then remove this now-unneeded final completion
 -- in the same transaction; do not create a permanent self-referential archive.
 -- Reinsert/replay of the exact old tuple still refuses because no owning item
 -- exists. Restoring an older work object requires independently CURRENT full
 -- replay coverage, never the old snapshot's own source-absence assertion.
 if remove_item then delete from private.launch_import_authorizations where approval_ref=a.approval_ref;end if;
 if a.expires_at<=clock_timestamp() or not private.launch_write_fence_ready_v1() then raise exception 'launch retirement unavailable';end if;
 return result;
exception when query_canceled then
 return jsonb_build_object('outcome','refused','workId',p_item_id,'generation',p_generation::text,'reason','unavailable','writes',0);
when others then
 return jsonb_build_object('outcome','refused','workId',p_item_id,'generation',p_generation::text,'reason','unavailable','writes',0);
end $$;

create function private.minimize_launch_receipt_v1(p_item_id uuid,p_generation bigint,p_epoch bigint,p_scope text,p_approval_ref text)
returns jsonb language sql security invoker set search_path=pg_catalog as $$
 select private.launch_retention_minimize_v1(p_item_id,p_generation,p_epoch,p_scope,p_approval_ref,'retention_receipt');
$$;
create function private.retire_launch_marker_v1(p_item_id uuid,p_generation bigint,p_epoch bigint,p_scope text,p_approval_ref text)
returns jsonb language sql security invoker set search_path=pg_catalog as $$
 select private.launch_retention_minimize_v1(p_item_id,p_generation,p_epoch,p_scope,p_approval_ref,'retention_marker');
$$;
create function public.minimize_launch_receipt_v1(p_item_id uuid,p_generation bigint,p_epoch bigint,p_scope text,p_approval_ref text)
returns jsonb language sql security invoker set search_path=pg_catalog as $$ select private.minimize_launch_receipt_v1(p_item_id,p_generation,p_epoch,p_scope,p_approval_ref);$$;
create function public.retire_launch_marker_v1(p_item_id uuid,p_generation bigint,p_epoch bigint,p_scope text,p_approval_ref text)
returns jsonb language sql security invoker set search_path=pg_catalog as $$ select private.retire_launch_marker_v1(p_item_id,p_generation,p_epoch,p_scope,p_approval_ref);$$;

create function private.launch_retention_erasure_shape_v1(r jsonb,fields text[],allowed text[],required text[])
returns boolean language sql immutable security invoker set search_path=pg_catalog as $$
 select coalesce(fields<@allowed and array_position(fields,null) is null
  and cardinality(fields)=(select count(distinct x) from unnest(fields) x)
  and not exists(select 1 from unnest(fields) x where r->x is distinct from 'null'::jsonb)
  and not exists(select 1 from unnest(required) x where (r->x is null or r->x='null'::jsonb) and not x=any(fields)),false);
$$;
alter table private.launch_retention_delivery add constraint launch_retention_delivery_erasure_shape check (
 private.launch_retention_erasure_shape_v1(to_jsonb(launch_retention_delivery),minimized_fields,
  array['provider_ref','claim_token','claim_outcome','claim_finished_at','settled_at','handoff_at'],
  array['handoff_at']||case when outcome='sent' then array['settled_at','provider_ref'] when outcome='failed' then array['settled_at'] else '{}'::text[] end)
 and (outcome not in ('unknown','pending') or (settled_at is null and provider_ref is null
  and not minimized_fields&&array['provider_ref','settled_at','handoff_at']))
 and (settled_at is null or handoff_at is null or settled_at>=handoff_at)
 and (outcome='sent' or provider_ref is null)
 and ((claim_token is null and claim_outcome is null and claim_finished_at is null)
  or ((claim_token is not null or 'claim_token'=any(minimized_fields))
   and (claim_outcome is not null or 'claim_outcome'=any(minimized_fields))
   and (claim_finished_at is not null or 'claim_finished_at'=any(minimized_fields))
   and claim_token is distinct from handoff_token))
);
alter table private.launch_legacy_provenance add constraint launch_legacy_erasure_shape check (
 private.launch_retention_erasure_shape_v1(to_jsonb(launch_legacy_provenance),minimized_fields,
  array['legacy_created_at','launch_match'],array['legacy_created_at','launch_match'])
 and (minimized_fields='{}' or (outcome='disposed' and disposition_id is not null and signup_id is null))
);
alter table private.launch_retention_items add constraint launch_retention_item_erasure_shape check (
 private.launch_retention_erasure_shape_v1(to_jsonb(launch_retention_items),minimized_fields,
  array['policy_version','reason_code','decided_at'],array['policy_version','reason_code','decided_at'])
 and (state<>'raw' or minimized_fields='{}')
);
alter table private.launch_import_authorizations add constraint launch_authority_erasure_shape check (
 private.launch_retention_erasure_shape_v1(to_jsonb(launch_import_authorizations),minimized_fields,
  array['project_ref','source_commit','schema_identity','expected_scope','writer_ids','control_evidence','test_evidence','settlement_evidence',
   'verified_at','expires_at','revoked_at','target_mode','restore_snapshot_ref','restore_replay_ref','restore_coverage_ref','retention_key_generation','post_scope','result_receipt'],
  array['project_ref','source_commit','schema_identity','expected_scope','writer_ids','control_evidence','test_evidence','settlement_evidence','verified_at','expires_at'])
 and ((consumed_at is null and post_scope is null and result_receipt is null and minimized_fields='{}' and retention_item_id is null)
  or (consumed_at is not null and (post_scope is not null or 'post_scope'=any(minimized_fields))
   and (result_receipt is not null or 'result_receipt'=any(minimized_fields))))
);
alter table private.launch_import_authorizations drop constraint launch_authorization_purpose;
alter table private.launch_import_authorizations add constraint launch_authorization_purpose check (
 (operation='import' and target_mode is null and restore_snapshot_ref is null and restore_replay_ref is null and restore_coverage_ref is null and retention_key_generation is null)
 or (operation='mode' and (target_mode in ('fenced','canonical') or 'target_mode'=any(minimized_fields))
  and (target_mode is not null or 'target_mode'=any(minimized_fields))
  and restore_snapshot_ref is null and restore_replay_ref is null and restore_coverage_ref is null and retention_key_generation is null)
 or (operation='restore' and (target_mode='canonical' or 'target_mode'=any(minimized_fields))
  and (target_mode is not null or 'target_mode'=any(minimized_fields))
  and (restore_snapshot_ref ~ '^[a-zA-Z0-9_-]{1,100}$' or 'restore_snapshot_ref'=any(minimized_fields))
  and (restore_replay_ref ~ '^[a-zA-Z0-9_-]{1,100}$' or 'restore_replay_ref'=any(minimized_fields))
  and (restore_coverage_ref ~ '^[a-zA-Z0-9_-]{1,100}$' or 'restore_coverage_ref'=any(minimized_fields)) and retention_key_generation is null
  and (restore_snapshot_ref is not null or 'restore_snapshot_ref'=any(minimized_fields))
  and (restore_replay_ref is not null or 'restore_replay_ref'=any(minimized_fields))
  and (restore_coverage_ref is not null or 'restore_coverage_ref'=any(minimized_fields)))
 or (operation in ('retention_raw','retention_receipt','retention_marker') and target_mode is null
  and restore_snapshot_ref is null and restore_replay_ref is null and restore_coverage_ref is null
  and ((retention_key_generation ~ '^(0|[1-9][0-9]*)$' and retention_key_generation::numeric<=9223372036854775807)
   or 'retention_key_generation'=any(minimized_fields))
  and (retention_key_generation is not null or 'retention_key_generation'=any(minimized_fields)))
);

create function private.guard_launch_retention_erasure_v1()
returns trigger language plpgsql security invoker set search_path=pg_catalog as $$
declare n text; allowed text[];before_row jsonb;after_row jsonb;begin
 if not pg_try_advisory_xact_lock(hashtextextended('launch-list-fence',0)) then raise exception 'launch retention fenced' using errcode='55000';end if;
 if tg_table_name='launch_import_authorizations' then
  if new.consumed_at is not null and new.retention_item_id is null
   and new.operation in ('retention_raw','retention_receipt','retention_marker') then
   new.retention_item_id:=(new.result_receipt->>'workId')::uuid;
  end if;
 end if;
 if tg_op='INSERT' then
  if new.minimized_fields<>'{}' then raise exception 'launch retention erased insert' using errcode='23514';end if;
  return new;
 end if;
 if not old.minimized_fields<@new.minimized_fields then raise exception 'launch retention reinflation' using errcode='23514';end if;
 foreach n in array old.minimized_fields loop
  if to_jsonb(new)->n is distinct from 'null'::jsonb then raise exception 'launch retention reinflation' using errcode='23514';end if;
 end loop;
 if tg_table_name='launch_import_authorizations' then
  if old.consumed_at is not null then
   if new.consumed_at is distinct from old.consumed_at or new.approval_ref<>old.approval_ref or new.operation<>old.operation
    or new.fence_epoch<>old.fence_epoch or new.retention_item_id is distinct from old.retention_item_id then
    raise exception 'launch retention consumed marker conflict' using errcode='23514';
   end if;
  end if;
 end if;
 if new.minimized_fields<>old.minimized_fields then
  if current_user<>pg_get_userbyid((select relowner from pg_class where oid=tg_relid)) then
   raise exception 'launch retention owner erasure only' using errcode='42501';end if;
  before_row:=to_jsonb(old)-array['minimized_fields','generation','fence_epoch'];
  after_row:=to_jsonb(new)-array['minimized_fields','generation','fence_epoch'];
  if tg_table_name='launch_retention_items' then
   if new.state='retired' and old.state='marker' then
    before_row:=before_row-array['state','launch_match','key_generation','withdrawn_at','scope_hash','evidence_ref'];
    after_row:=after_row-array['state','launch_match','key_generation','withdrawn_at','scope_hash','evidence_ref'];
   end if;
  end if;
  foreach n in array new.minimized_fields loop before_row:=before_row||jsonb_build_object(n,null);end loop;
  if before_row<>after_row then raise exception 'launch retention erasure conflict' using errcode='23514';end if;
  if tg_table_name='launch_legacy_provenance' then
   if exists(select 1 from public.waitlist where id=old.legacy_id) then raise exception 'launch retention source mapping live' using errcode='23514';end if;
  end if;
  if tg_table_name='launch_import_authorizations' then
   if old.consumed_at is null then raise exception 'launch retention authority live' using errcode='23514';end if;
  end if;
 end if;
 return new;
end $$;

-- A complete local replay manifest, not a proof of external completeness. No
-- raw address/payload/key is copied. The independently owned adapter must cover
-- this WHOLE set, including identifiers absent from a restored snapshot.
create function private.launch_retention_replay_manifest_v1(p_exclude_approval_ref text)
returns jsonb language sql stable security invoker set search_path=pg_catalog as $$
 select jsonb_build_object('schemaVersion',1,
  'suppression',coalesce((select jsonb_agg(to_jsonb(x) order by launch_match) from private.launch_suppressions x),'[]'),
  'links',coalesce((select jsonb_agg(to_jsonb(x) order by token_hash) from private.launch_withdrawal_receipts x),'[]'),
  'items',coalesce((select jsonb_agg(to_jsonb(x)||jsonb_build_object('generation',generation::text,'fence_epoch',fence_epoch::text) order by item_id) from private.launch_retention_items x),'[]'),
  'delivery',coalesce((select jsonb_agg(to_jsonb(x)||jsonb_build_object('generation',generation::text,'fence_epoch',fence_epoch::text) order by signup_id,handoff_token) from private.launch_retention_delivery x),'[]'),
  'provenance',coalesce((select jsonb_agg(to_jsonb(x) order by legacy_id) from private.launch_legacy_provenance x),'[]'),
  'consumed',coalesce((select jsonb_agg(to_jsonb(x)||jsonb_build_object('fence_epoch',fence_epoch::text) order by approval_ref)
    from private.launch_import_authorizations x where consumed_at is not null and approval_ref is distinct from p_exclude_approval_ref),'[]'),
  'rawSafety',coalesce((select jsonb_agg(jsonb_build_object('id',id,'match',launch_match,'withdrawn',withdrawn_at,'link',launch_unsubscribe_hash,
    'deliveryState',delivery_state,'token',delivery_token,'template',delivery_template_version,'firstAttempt',delivery_first_attempt_at,'attempt',delivery_attempted_at,'provider',provider_id) order by id)
    from public.signup_requests where intent='launch'),'[]'),
  'guards',coalesce((select jsonb_agg(to_jsonb(g)||jsonb_build_object('fence_epoch',fence_epoch::text) order by signup_id) from private.launch_delivery_guard g),'[]'),
  'contexts',coalesce((select jsonb_agg(to_jsonb(x)||jsonb_build_object('transaction_id',transaction_id::text,'fence_epoch',fence_epoch::text) order by transaction_id) from private.launch_import_context x),'[]')
 );
$$;
create function private.launch_retention_replay_digest_v1(p_exclude_approval_ref text)
returns text language sql stable security invoker set search_path=pg_catalog as $$
 select encode(sha256(convert_to(private.launch_retention_replay_manifest_v1(p_exclude_approval_ref)::text,'UTF8')),'hex');
$$;
create function private.launch_retention_keys_valid_v1(keys jsonb)
returns boolean language plpgsql immutable security invoker set search_path=pg_catalog as $$
declare k jsonb;canonical jsonb;begin
 if jsonb_typeof(keys) is distinct from 'array' then return false;end if;
 for k in select value from jsonb_array_elements(keys) loop
  if jsonb_typeof(k)<>'string' or k#>>'{}' !~ '^(0|[1-9][0-9]*)$' or length(k#>>'{}')>19
   or (length(k#>>'{}')=19 and k#>>'{}'>'9223372036854775807') then return false;end if;
 end loop;
 select coalesce(jsonb_agg(value order by length(value),value),'[]') into canonical from
  (select distinct value from jsonb_array_elements_text(keys)) q;
 return keys=canonical;
end $$;
create function private.launch_retention_restore_ready_v1(a private.launch_import_authorizations,p_scope text,p_epoch bigint)
returns boolean language plpgsql stable security invoker set search_path=pg_catalog as $$
declare c private.launch_list_control;p jsonb;n text;watermark text;begin
 select * into c from private.launch_list_control where singleton;
 if a.operation is distinct from 'restore' or a.consumed_at is not null or a.minimized_fields<>'{}'
  or a.expected_scope is distinct from p_scope or a.fence_epoch is distinct from p_epoch then return false;end if;
 p:=private.launch_retention_restore_coverage_v1(a.approval_ref,p_scope,p_epoch);
 foreach n in array array['state','evidenceRef','origin','stableBarrierRef','approvalRef','operation','namespace','projectRef','sourceCommit',
  'schemaIdentity','fingerprint','scopeHash','snapshotRef','replayRef','coverageRef'] loop
  if jsonb_typeof(p->n) is distinct from 'string' then return false;end if;
 end loop;
 if p is null or jsonb_typeof(p) is distinct from 'object' or p->>'state' is distinct from 'verified'
  or p->>'origin' is distinct from 'independent_current'
  or p->>'evidenceRef' is null or p->>'evidenceRef' !~ '^[a-zA-Z0-9_-]{1,100}$'
  or p->>'stableBarrierRef' is null or p->>'stableBarrierRef' !~ '^[a-zA-Z0-9_-]{1,100}$'
  or p->>'approvalRef' is distinct from a.approval_ref or p->>'operation' is distinct from 'restore'
  or p->>'namespace' is distinct from 'launch-retention-v1:'||c.project_ref
  or p->>'projectRef' is distinct from c.project_ref or p->>'sourceCommit' is distinct from c.source_commit
  or p->>'schemaIdentity' is distinct from private.launch_import_schema_v1()
  or p->>'fingerprint' is distinct from private.launch_write_fence_fingerprint_v1()
  or p->>'scopeHash' is distinct from p_scope or jsonb_typeof(p->'epoch') is distinct from 'string' or p->>'epoch' is distinct from p_epoch::text
  or p->>'snapshotRef' is distinct from a.restore_snapshot_ref or p->>'replayRef' is distinct from a.restore_replay_ref
  or p->>'coverageRef' is distinct from a.restore_coverage_ref then return false;end if;
 foreach n in array array['externalHead','coveredHead','manifestDigest'] loop
  if jsonb_typeof(p->n) is distinct from 'string' or p->>n !~ '^[0-9a-f]{64}$' then return false;end if;
 end loop;
 foreach n in array array['externalWatermark','coveredWatermark'] loop
  watermark:=p->>n;
  if jsonb_typeof(p->n) is distinct from 'string' or watermark !~ '^(0|[1-9][0-9]*)$' or length(watermark)>19
   or (length(watermark)=19 and watermark>'9223372036854775807') then return false;end if;
 end loop;
 if p->'externalHead' is distinct from p->'coveredHead' or p->'externalWatermark' is distinct from p->'coveredWatermark'
  or not private.launch_retention_keys_valid_v1(p->'liveKeyGenerations') or not private.launch_retention_keys_valid_v1(p->'coveredKeyGenerations')
  or p->'liveKeyGenerations' is distinct from p->'coveredKeyGenerations'
  or exists(select 1 from private.launch_retention_items where key_generation is not null
    and not (p->'coveredKeyGenerations' @> jsonb_build_array(key_generation)))
  or p->>'manifestDigest' is distinct from private.launch_retention_replay_digest_v1(a.approval_ref) then return false;end if;
 return true;
end $$;

-- Existing restore signature/shape and non-restore callers are unchanged. The
-- check runs after the actual outer/control/selected-authority locks, before
-- mode/consumption. It establishes no deadline restriction for old callers.
do $$ declare d text;needle text;begin
 d:=pg_get_functiondef('private.set_launch_mode_v1(bigint,text,text,text)'::regprocedure);
 d:=replace(d,'result jsonb;','result jsonb;retention_writes integer:=0;affected integer;');
 d:=replace(d,'select * into c from private.launch_list_control where singleton;',
  'select * into c from private.launch_list_control where singleton for update;');
 needle:='if p_mode=''canonical'' and ((i->''counts''->>''invalid'')::bigint<>0';
 if strpos(d,needle)=0 then raise exception 'accepted restore consumer mismatch';end if;
 d:=replace(d,needle,'if c.restore_required and not private.launch_retention_restore_ready_v1(a,p_scope,p_expected_epoch) then return i||jsonb_build_object(''outcome'',''refused'');end if; '||needle);
 needle:='result:=private.inventory_launch_legacy_v1(p_match_key)||jsonb_build_object(''outcome'',''mode_changed'',';
 if strpos(d,needle)=0 then raise exception 'accepted restore transition mismatch';end if;
 d:=replace(d,needle,$rebase$if c.restore_required then
  -- Coverage was checked under the source barrier BEFORE this deterministic
  -- target-epoch transition. Keep exact late finishes usable at the new epoch;
  -- generations still advance one item step and receipts catch up monotonically.
  perform 1 from private.launch_retention_items where state<>'retired' order by item_id for update;
  perform 1 from private.launch_retention_delivery order by signup_id,handoff_token for update;
  update private.launch_retention_items set generation=generation+1,fence_epoch=p_expected_epoch+1 where state<>'retired';
  get diagnostics affected=row_count;retention_writes:=retention_writes+affected;
  update private.launch_retention_delivery d set generation=x.generation,fence_epoch=x.fence_epoch
   from private.launch_retention_items x where x.item_id=d.item_id and x.state in ('raw','receipt');
  get diagnostics affected=row_count;retention_writes:=retention_writes+affected;
 end if;
 $rebase$||needle);
 execute replace(d,'''writes'',2,','''writes'',2+retention_writes,');
end $$;
-- The public facade stays INVOKER/service-only. Owner execution is necessary
-- solely for purpose-checked restore rebasing; no ledger DML grant or setter.
alter function private.set_launch_mode_v1(bigint,text,text,text) security definer;
-- Local delivery readiness respects deliberately erased terminal times, but
-- minimization never turns unknown/pending into terminal settlement.
do $$ declare d text;needle text;begin
 d:=pg_get_functiondef('private.launch_delivery_data_ready_v1()'::regprocedure);
 needle:='d.outcome not in (''sent'',''failed'') or d.settled_at is null';
 if strpos(d,needle)=0 then raise exception 'accepted delivery readiness mismatch';end if;
 execute replace(d,needle,'d.outcome not in (''sent'',''failed'') or (d.settled_at is null and not (''settled_at''=any(d.minimized_fields)))');
end $$;
do $$ declare d text;begin
 d:=pg_get_functiondef('private.launch_cutover_data_ready_v1(text)'::regprocedure);
 execute replace(d,'private.launch_cutover_data_ready_v1','private.launch_retention_cutover_base_v1');
end $$;
create or replace function private.launch_cutover_data_ready_v1(p_match_key text)
returns boolean language plpgsql stable security invoker set search_path=pg_catalog as $$
declare c private.launch_list_control;a private.launch_import_authorizations;inv jsonb;begin
 select * into c from private.launch_list_control where singleton;
 if c.restore_required then
  inv:=private.inventory_launch_legacy_v1(p_match_key);
  if (select count(*) from private.launch_import_authorizations where operation='restore' and expected_scope=inv->>'scopeHash'
   and fence_epoch=c.fence_epoch and consumed_at is null and revoked_at is null and expires_at>clock_timestamp())<>1 then return false;end if;
  select * into a from private.launch_import_authorizations where operation='restore' and expected_scope=inv->>'scopeHash'
   and fence_epoch=c.fence_epoch and consumed_at is null and revoked_at is null and expires_at>clock_timestamp();
  if not private.launch_retention_restore_ready_v1(a,inv->>'scopeHash',c.fence_epoch) then return false;end if;
 end if;
 return private.launch_retention_cutover_base_v1(p_match_key);
end $$;

-- Extend the SAME owner-installed fingerprint. No service certification setter.
do $$ declare d text;begin
 d:=pg_get_functiondef('private.launch_write_fence_fingerprint_v1()'::regprocedure);
 execute replace(d,'private.launch_write_fence_fingerprint_v1','private.launch_retention_prior_fingerprint_v1');
end $$;
create or replace function private.launch_write_fence_fingerprint_v1()
returns text language sql stable security invoker set search_path=pg_catalog as $$
 select encode(sha256(convert_to(jsonb_build_object(
  'prior',private.launch_retention_prior_fingerprint_v1(),
  'facades',(select jsonb_agg(row(n.nspname,p.proname,pg_get_functiondef(p.oid),p.proacl) order by n.nspname,p.proname)
   from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private')
    and p.proname in ('minimize_launch_receipt_v1','retire_launch_marker_v1')),
  'columns',(select jsonb_agg(row(c.oid::regclass::text,a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,pg_get_expr(d.adbin,d.adrelid)) order by c.oid::regclass::text,a.attnum)
   from pg_class c join pg_namespace n on n.oid=c.relnamespace join pg_attribute a on a.attrelid=c.oid
   left join pg_attrdef d on d.adrelid=c.oid and d.adnum=a.attnum
   where n.nspname='private' and c.relname like 'launch_%' and c.relkind='r' and a.attnum>0 and not a.attisdropped),
  'triggers',(select jsonb_agg(row(tgrelid::regclass::text,pg_get_triggerdef(oid),tgenabled) order by tgrelid::regclass::text,tgname)
   from pg_trigger where tgname like 'launch_%' and not tgisinternal)
 )::text,'UTF8')),'hex');
$$;

create trigger launch_retention_erasure_guard before insert or update on private.launch_legacy_provenance
 for each row execute function private.guard_launch_retention_erasure_v1();
create trigger launch_retention_erasure_guard before insert or update on private.launch_import_authorizations
 for each row execute function private.guard_launch_retention_erasure_v1();

-- Replace only the exact terminal field comparison inside S's installed guard.
-- Item unit steps, receipt nondecreasing/exact-current catch-up, pending safety
-- and every immutable identity/outcome test outside this erasure remain intact.
do $$ declare d text;old_part text;new_part text;begin
 d:=pg_get_functiondef('private.guard_launch_retention_state_v1()'::regprocedure);
 d:=replace(d,'or old.state=''retired''','or (old.state=''retired'' and new.state<>''retired'')');
 old_part:=$old$if new.item_id<>old.item_id or new.signup_id<>old.signup_id or new.handoff_token<>old.handoff_token or new.handoff_at<>old.handoff_at
    or (old.outcome in ('sent','failed') and (new.outcome<>old.outcome or new.provider_ref is distinct from old.provider_ref
     or new.settled_at is distinct from old.settled_at))
    or (old.claim_outcome is not null and (new.claim_token is distinct from old.claim_token
     or new.claim_outcome is distinct from old.claim_outcome or new.claim_finished_at is distinct from old.claim_finished_at)) then$old$;
 new_part:=$new$if new.item_id<>old.item_id or new.signup_id<>old.signup_id or new.handoff_token<>old.handoff_token
    or not old.minimized_fields<@new.minimized_fields
    or (new.handoff_at is distinct from old.handoff_at and not ('handoff_at'=any(new.minimized_fields) and new.handoff_at is null and old.outcome in ('sent','failed')))
    or (old.outcome in ('sent','failed') and (new.outcome<>old.outcome
     or (new.provider_ref is distinct from old.provider_ref and not ('provider_ref'=any(new.minimized_fields) and new.provider_ref is null))
     or (new.settled_at is distinct from old.settled_at and not ('settled_at'=any(new.minimized_fields) and new.settled_at is null))))
    or (old.claim_token is not null and new.claim_token is distinct from old.claim_token and not ('claim_token'=any(new.minimized_fields) and new.claim_token is null))
    or (old.claim_outcome is not null and new.claim_outcome is distinct from old.claim_outcome and not ('claim_outcome'=any(new.minimized_fields) and new.claim_outcome is null))
    or (old.claim_finished_at is not null and new.claim_finished_at is distinct from old.claim_finished_at and not ('claim_finished_at'=any(new.minimized_fields) and new.claim_finished_at is null)) then$new$;
 if strpos(d,old_part)=0 then raise exception 'accepted retention guard mismatch';end if;
 execute replace(d,old_part,new_part);
end $$;
create trigger launch_retention_erasure_guard before insert or update on private.launch_retention_delivery
 for each row execute function private.guard_launch_retention_erasure_v1();
create trigger launch_retention_erasure_guard before insert or update on private.launch_retention_items
 for each row execute function private.guard_launch_retention_erasure_v1();

-- Existing private write fence remains effective for service-role SQL. Only
-- trusted owner execution of these narrow definer operations can erase private
-- facts while canonical intake is fenced. No raw-row/guard/INSERT bypass.
do $$ declare d text;needle text;begin
 d:=pg_get_functiondef('private.guard_launch_writes_v1()'::regprocedure);
 needle:='if not exists(select 1 from private.launch_list_control where singleton and mode=''fenced'') then';
 if strpos(d,needle)=0 then raise exception 'accepted writer guard mismatch';end if;
 execute replace(d,needle,$gate$if tg_table_schema='private' and tg_table_name in ('launch_legacy_provenance','launch_suppressions','launch_withdrawal_receipts')
  and tg_op in ('UPDATE','DELETE') and current_user=pg_get_userbyid((select relowner from pg_class where oid=tg_relid)) then
  if tg_op='DELETE' then return old;else return new;end if;
 end if;
 $gate$||needle);
end $$;

-- Default field projection does not create consent or external facts. Preserve
-- the existing nonraw consent=unknown context and all prior raw checks.
do $$ declare d text;needle text;begin
 d:=pg_get_functiondef('private.launch_retention_context_v1(uuid,bigint)'::regprocedure);
 needle:='''restore'',jsonb_build_object(''state'',''unavailable''))';
 if strpos(d,needle)=0 then raise exception 'accepted context mismatch';end if;
 execute replace(d,needle,'''restore'',jsonb_build_object(''state'',''unavailable''),''fieldPurposes'',private.launch_retention_field_context_v1(p_item_id,p_generation))');
end $$;

-- Deliberately retired comparisons return false. No callback can refill them.
do $$ declare d text;needle text;begin
 d:=pg_get_functiondef('private.finish_launch_delivery_v1(uuid,uuid,text,text)'::regprocedure);
 needle:='if d.outcome in (''sent'',''failed'') then return';
 if strpos(d,needle)=0 then raise exception 'accepted compact finish mismatch';end if;
 execute replace(d,needle,'if p_state=''sent'' and ''provider_ref''=any(d.minimized_fields) then return false;end if; '||needle);
end $$;

create function private.launch_retention_retirement_scope_v1(p_item_id uuid)
returns text language sql stable security invoker set search_path=pg_catalog as $$
 select encode(sha256(convert_to(jsonb_build_object(
  'control',(select jsonb_build_array(to_jsonb(c),c.xmin::text) from private.launch_list_control c where singleton),
  'source',(select jsonb_agg(jsonb_build_array(to_jsonb(s),s.xmin::text) order by id) from public.signup_requests s where intent='launch' and (id=i.source_signup_id or launch_match=i.launch_match)),
  'delivery',(select jsonb_agg(jsonb_build_array(to_jsonb(d),d.xmin::text) order by signup_id,handoff_token) from private.launch_retention_delivery d where item_id=i.item_id),
  'provenance',(select jsonb_agg(jsonb_build_array(to_jsonb(p),p.xmin::text) order by legacy_id) from private.launch_legacy_provenance p where disposition_id=i.item_id or launch_match=i.launch_match),
  'legacy',(select jsonb_agg(jsonb_build_array(to_jsonb(w),w.xmin::text) order by id) from public.waitlist w join private.launch_legacy_provenance p on p.legacy_id=w.id where p.disposition_id=i.item_id or p.launch_match=i.launch_match),
  'authorities',(select jsonb_agg(jsonb_build_array(to_jsonb(a),a.xmin::text) order by approval_ref) from private.launch_import_authorizations a where retention_item_id=i.item_id),
  'contexts',(select jsonb_agg(jsonb_build_array(to_jsonb(x),x.xmin::text) order by transaction_id) from private.launch_import_context x where launch_match=i.launch_match or approval_ref in (select approval_ref from private.launch_import_authorizations where retention_item_id=i.item_id)),
  'suppression',(select jsonb_agg(jsonb_build_array(to_jsonb(s),s.xmin::text)) from private.launch_suppressions s where launch_match=i.launch_match),
  'links',(select jsonb_agg(jsonb_build_array(to_jsonb(w),w.xmin::text) order by token_hash) from private.launch_withdrawal_receipts w where launch_match=i.launch_match)
 )::text,'UTF8')),'hex') from private.launch_retention_items i where item_id=p_item_id;
$$;

-- Legacy scope remains byte-equivalent for untouched old receipts. After proven
-- provenance erasure, a distinct current mapping scope replaces its necessity;
-- the original completion post_scope is never silently reinterpreted.
create or replace function private.launch_retention_legacy_scope_v1(p_item_id uuid)
returns text language sql stable security invoker set search_path=pg_catalog as $$
 select encode(sha256(convert_to(coalesce(jsonb_agg(case when p.minimized_fields='{}' then to_jsonb(p)-'minimized_fields' else to_jsonb(p) end order by legacy_id),'[]'::jsonb)::text,'UTF8')),'hex')
 from private.launch_legacy_provenance p where disposition_id=p_item_id;
$$;
do $$ declare signature text;d text;needle text;begin
 foreach signature in array array['private.launch_retention_identity_ready_v1()','private.inventory_launch_legacy_v1(text)'] loop
  d:=pg_get_functiondef(signature::regprocedure);
  needle:='a.post_scope is distinct from private.launch_retention_legacy_scope_v1';
  if strpos(d,needle)=0 then raise exception 'accepted lifecycle scope mismatch';end if;
  d:=replace(d,needle,'not (''post_scope''=any(a.minimized_fields)) and coalesce(a.retention_mapping_scope,a.post_scope) is distinct from private.launch_retention_legacy_scope_v1');
  d:=replace(d,'i.launch_match=p.launch_match','(i.launch_match=p.launch_match or (p.launch_match is null and ''launch_match''=any(p.minimized_fields)))');
  d:=replace(d,'a.result_receipt->>''workId''=i.item_id::text','a.retention_item_id=i.item_id');
  d:=replace(d,'a.result_receipt->>''outcome''=''disposed''','(a.result_receipt->>''outcome''=''disposed'' or ''result_receipt''=any(a.minimized_fields))');
  d:=replace(d,'a.retention_key_generation=i.key_generation','(a.retention_key_generation=i.key_generation or ''retention_key_generation''=any(a.minimized_fields))');
  execute d;
 end loop;
end $$;

-- No new table DML grants. Read-only helpers and the purpose-checked narrow
-- executors are service-only. Triggers do not expose a callable state setter.
do $$ declare r record;begin
 for r in select p.oid::regprocedure as signature,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='private' and (p.proname like '%launch_retention%'
   or p.proname in ('minimize_launch_receipt_v1','retire_launch_marker_v1')) loop
  execute format('revoke all on function %s from public,anon,authenticated,service_role',r.signature);
  if r.proname not like 'guard_%' then execute format('grant execute on function %s to service_role',r.signature);end if;
 end loop;
end $$;
revoke all on function public.minimize_launch_receipt_v1(uuid,bigint,bigint,text,text),public.retire_launch_marker_v1(uuid,bigint,bigint,text,text) from public,anon,authenticated;
grant execute on function public.minimize_launch_receipt_v1(uuid,bigint,bigint,text,text),public.retire_launch_marker_v1(uuid,bigint,bigint,text,text) to service_role;
update private.launch_write_fence_contract set definition_hash=private.launch_write_fence_fingerprint_v1() where version=1;
commit;
