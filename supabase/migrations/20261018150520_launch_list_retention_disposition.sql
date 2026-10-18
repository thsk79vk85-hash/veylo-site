-- Website-only forward contract. Dormant: owning external facts remain
-- unavailable and no issuer, setter, force flag, schedule or provider is added.
begin;

alter table private.launch_legacy_provenance
 add column disposition_id uuid references private.launch_retention_items(item_id);
alter table private.launch_legacy_provenance drop constraint launch_legacy_provenance_outcome_check;
alter table private.launch_legacy_provenance drop constraint launch_legacy_provenance_check;
alter table private.launch_legacy_provenance add constraint launch_legacy_disposition_shape check (
 (outcome in ('registered','review') and signup_id is not null and disposition_id is null)
 or (outcome='suppressed' and disposition_id is null)
 or (outcome='disposed' and signup_id is null and disposition_id is not null)
);
create index launch_legacy_disposition_idx on private.launch_legacy_provenance(disposition_id) where disposition_id is not null;
comment on column private.launch_legacy_provenance.disposition_id is
 'Replaces raw signup linkage atomically for an exactly covered source identity/version. Legacy UUID/time/match remain only for mapping/replay; later purpose retirement is separate. A disposed mapping cannot excuse a missing active source.';

-- No match key is accepted or persisted by cleanup. Bind the per-item owning
-- rows and their MVCC versions, including all matching legacy versions. Beta is
-- deliberately absent; no shared email lock or beta row/table lock is required.
create function private.launch_retention_scope_v1(p_item_id uuid)
returns text language sql stable security invoker set search_path=pg_catalog as $$
 select encode(sha256(convert_to(jsonb_build_object(
  'control',(select jsonb_build_array(to_jsonb(c),c.xmin::text) from private.launch_list_control c where singleton),
  'source',(select jsonb_build_array(to_jsonb(s),s.xmin::text) from public.signup_requests s where s.id=i.source_signup_id and s.intent='launch'),
  'legacy',(select jsonb_agg(jsonb_build_array(to_jsonb(w),w.xmin::text) order by w.id) from public.waitlist w
    where private.normalize_launch_import_email_v1(w.email)=(select s.email from public.signup_requests s where s.id=i.source_signup_id)
     or exists(select 1 from private.launch_legacy_provenance p where p.legacy_id=w.id and (p.signup_id=i.source_signup_id or p.launch_match=i.launch_match))),
  'provenance',(select jsonb_agg(jsonb_build_array(to_jsonb(p),p.xmin::text) order by legacy_id) from private.launch_legacy_provenance p where p.signup_id=i.source_signup_id or p.launch_match=i.launch_match),
  'guard',(select jsonb_build_array(to_jsonb(g),g.xmin::text) from private.launch_delivery_guard g where g.signup_id=i.source_signup_id),
  'suppression',(select jsonb_build_array(to_jsonb(x),x.xmin::text) from private.launch_suppressions x where x.launch_match=i.launch_match),
  'links',(select jsonb_agg(jsonb_build_array(to_jsonb(w),w.xmin::text) order by token_hash) from private.launch_withdrawal_receipts w where w.launch_match=i.launch_match)
 )::text,'UTF8')),'hex') from private.launch_retention_items i where item_id=p_item_id;
$$;
revoke all on function private.launch_retention_scope_v1(uuid) from public,anon,authenticated;
grant execute on function private.launch_retention_scope_v1(uuid) to service_role;

-- The existing authority completion's post_scope binds the exact retained
-- source identities/versions after removal. No address or copied raw snapshot.
create function private.launch_retention_legacy_scope_v1(p_item_id uuid)
returns text language sql stable security invoker set search_path=pg_catalog as $$
 select encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(p) order by legacy_id),'[]'::jsonb)::text,'UTF8')),'hex')
 from private.launch_legacy_provenance p where disposition_id=p_item_id;
$$;
revoke all on function private.launch_retention_legacy_scope_v1(uuid) from public,anon,authenticated;
grant execute on function private.launch_retention_legacy_scope_v1(uuid) to service_role;

-- Lifecycle equality is relational, never count equality. The keyed public
-- inventory/readiness additionally recomputes each still-present legacy match.
create function private.launch_retention_identity_ready_v1()
returns boolean language sql stable security invoker set search_path=pg_catalog as $$
 select not exists(select 1 from public.waitlist w
  left join private.launch_legacy_provenance p on p.legacy_id=w.id
  left join public.signup_requests s on s.id=p.signup_id
  where private.normalize_launch_import_email_v1(w.email) is null or p.legacy_id is null
   or p.legacy_created_at is distinct from w.created_at or p.disposition_id is not null
   or not coalesce((p.outcome='suppressed' and exists(select 1 from private.launch_suppressions x where x.launch_match=p.launch_match)
      and (p.signup_id is null or (s.intent='launch' and s.email=private.normalize_launch_import_email_v1(w.email) and s.launch_match=p.launch_match and s.withdrawn_at is not null)))
    or (p.outcome in ('registered','review') and s.intent='launch' and s.email=private.normalize_launch_import_email_v1(w.email)
      and (s.launch_match is null or s.launch_match=p.launch_match) and s.withdrawn_at is null
      and p.outcome=case when s.registration_origin='legacy_import' then 'review' else 'registered' end
      and not exists(select 1 from private.launch_suppressions x where x.launch_match=p.launch_match)),false))
 and not exists(select 1 from private.launch_legacy_provenance p
  left join public.waitlist w on w.id=p.legacy_id
  left join private.launch_retention_items i on i.item_id=p.disposition_id
  where (p.disposition_id is null and w.id is null)
   or (p.disposition_id is not null and not coalesce(w.id is null and p.outcome='disposed' and p.signup_id is null
    and i.state in ('receipt','marker') and i.source_signup_id is null and i.launch_match=p.launch_match
    and exists(select 1 from private.launch_suppressions x where x.launch_match=i.launch_match and x.withdrawn_at<=i.withdrawn_at)
    and exists(select 1 from private.launch_import_authorizations a where a.operation='retention_raw' and a.consumed_at is not null
      and a.result_receipt->>'outcome'='disposed' and a.result_receipt->>'workId'=i.item_id::text
      and a.retention_key_generation=i.key_generation),false)))
 and not exists(select 1 from private.launch_import_authorizations a join private.launch_retention_items i
   on a.result_receipt->>'workId'=i.item_id::text where a.operation='retention_raw' and a.consumed_at is not null
    and a.result_receipt->>'outcome'='disposed' and a.post_scope is distinct from private.launch_retention_legacy_scope_v1(i.item_id))
 and not exists(select 1 from public.signup_requests s where s.intent='launch' and s.withdrawn_at is not null
   and not exists(select 1 from private.launch_suppressions x where x.launch_match=s.launch_match and x.withdrawn_at<=s.withdrawn_at))
 and not exists(select 1 from private.launch_withdrawal_receipts w left join private.launch_suppressions x on x.launch_match=w.launch_match
   where x.launch_match is null or x.withdrawn_at>w.withdrawn_at);
$$;
revoke all on function private.launch_retention_identity_ready_v1() from public,anon,authenticated;
grant execute on function private.launch_retention_identity_ready_v1() to service_role;

-- Preserve the existing raw checks, adding independently compact handoffs.
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
      and (g.claim_token is null or g.claim_token=s.delivery_token) and g.claim_outcome is null and g.claim_finished_at is null)
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
   and s.delivery_state in ('sending','pending','review') and (s.delivery_first_attempt_at is not null or s.delivery_token is not null))
 and not exists(select 1 from private.launch_retention_delivery d join private.launch_retention_items i on i.item_id=d.item_id
   where i.state<>'raw' and (d.outcome not in ('sent','failed') or d.settled_at is null
    or exists(select 1 from public.signup_requests s where s.id=d.signup_id)));
$$;

create or replace function private.launch_cutover_data_ready_v1(p_match_key text)
returns boolean language sql stable security invoker set search_path=pg_catalog as $$
 select private.launch_retention_identity_ready_v1()
 and not exists(select 1 from public.waitlist w join private.launch_legacy_provenance p on p.legacy_id=w.id
  where p.launch_match is distinct from private.launch_import_mac_v1(private.normalize_launch_import_email_v1(w.email),p_match_key))
 and not exists(select 1 from public.signup_requests s where s.intent='launch' and (
  (s.withdrawn_at is not null and not exists(select 1 from private.launch_suppressions x where x.launch_match=s.launch_match))
  or exists(select 1 from private.launch_suppressions x
   where (x.launch_match=s.launch_match or x.launch_match=private.launch_import_mac_v1(s.email,p_match_key))
    and (s.withdrawn_at is null or s.withdrawn_at is distinct from x.withdrawn_at))))
 and private.launch_delivery_data_ready_v1();
$$;

create or replace function private.inventory_launch_legacy_v1(p_match_key text)
returns jsonb language plpgsql stable security invoker set search_path=pg_catalog as $$
declare c private.launch_list_control; schema_id text; scope_id text; invalid_count bigint; conflict_count bigint;
begin
 select * into c from private.launch_list_control where singleton;
 schema_id:=private.launch_import_schema_v1();
 scope_id:=private.launch_import_mac_v1('veylo:launch-scope:v1:'||jsonb_build_object(
   'schema',schema_id,'control',to_jsonb(c),'controlVersion',(select xmin::text from private.launch_list_control where singleton),
   'legacy',(select jsonb_agg(jsonb_build_array(to_jsonb(w),w.xmin::text) order by id) from public.waitlist w),
   'canonical',(select jsonb_agg(jsonb_build_array(to_jsonb(s),s.xmin::text) order by id) from public.signup_requests s where intent='launch'),
   'provenance',(select jsonb_agg(jsonb_build_array(to_jsonb(p),p.xmin::text) order by legacy_id) from private.launch_legacy_provenance p),
   'suppression',(select jsonb_agg(jsonb_build_array(to_jsonb(s),s.xmin::text) order by launch_match) from private.launch_suppressions s),
   'withdrawal',(select jsonb_agg(jsonb_build_array(to_jsonb(w),w.xmin::text) order by token_hash) from private.launch_withdrawal_receipts w),
   'delivery',(select jsonb_agg(jsonb_build_array(to_jsonb(g),g.xmin::text) order by signup_id) from private.launch_delivery_guard g),
   'retention',(select jsonb_agg(jsonb_build_array(to_jsonb(i),i.xmin::text) order by item_id) from private.launch_retention_items i),
   'compact',(select jsonb_agg(jsonb_build_array(to_jsonb(d),d.xmin::text) order by signup_id,handoff_token) from private.launch_retention_delivery d)
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
    where p.disposition_id is null and (w.id is null or p.legacy_created_at is distinct from w.created_at
      or p.launch_match is distinct from private.launch_import_mac_v1(private.normalize_launch_import_email_v1(w.email),p_match_key)
      or (p.signup_id is not null and (s.intent is distinct from 'launch' or s.email is distinct from private.normalize_launch_import_email_v1(w.email)))
      or (p.signup_id is null and not exists(select 1 from private.launch_suppressions x where x.launch_match=p.launch_match)))
   union all
   select p.legacy_id::text from private.launch_legacy_provenance p where p.disposition_id is not null and
    (exists(select 1 from public.waitlist w where w.id=p.legacy_id)
     or not exists(select 1 from private.launch_retention_items i join private.launch_suppressions x on x.launch_match=i.launch_match
      join private.launch_import_authorizations a on a.operation='retention_raw' and a.consumed_at is not null
       and a.result_receipt->>'outcome'='disposed' and a.result_receipt->>'workId'=i.item_id::text
      where i.item_id=p.disposition_id and i.state in ('receipt','marker') and i.launch_match=p.launch_match
       and a.retention_key_generation=i.key_generation and x.withdrawn_at<=i.withdrawn_at))
   union all
   select i.item_id::text from private.launch_import_authorizations a join private.launch_retention_items i
    on a.result_receipt->>'workId'=i.item_id::text where a.operation='retention_raw' and a.consumed_at is not null
     and a.result_receipt->>'outcome'='disposed' and a.post_scope is distinct from private.launch_retention_legacy_scope_v1(i.item_id)
 ) conflicts;
 return jsonb_build_object('schemaVersion',1,'projectRef',c.project_ref,'sourceCommit',c.source_commit,
  'schemaIdentity',schema_id,'fenceEpoch',c.fence_epoch,'mode',c.mode,'scopeHash',scope_id,
  'configured',c.project_ref is not null and c.source_commit is not null,
  'counts',jsonb_build_object('legacy',(select count(*) from public.waitlist),'launch',(select count(*) from public.signup_requests where intent='launch'),
    'beta',(select count(*) from public.signup_requests where intent='beta'),'invalid',invalid_count,'conflicts',conflict_count),
  'outcome','inventory','equality',false,'disposalAllowed',false,'writes',0,'emails',0,'testedWriterIds','[]'::jsonb,'approvalRef',null);
end $$;

-- The service retains SELECT-only ledger access. This narrow private executor
-- needs owner privileges for the atomic deletes/receipt writes; its public
-- facade remains INVOKER, both EXECUTE ACLs are explicitly service-only. It
-- creates no authority and cannot succeed with the shipped unavailable facts.
create function private.dispose_launch_raw_v1(p_item_id uuid,p_generation bigint,p_epoch bigint,p_scope text,p_approval_ref text)
returns jsonb language plpgsql security definer set search_path=pg_catalog set lock_timeout='1000ms' set statement_timeout='5s' as $$
declare i private.launch_retention_items; c private.launch_list_control; a private.launch_import_authorizations;
 s public.signup_requests; g private.launch_delivery_guard; f jsonb; p jsonb; n text; reason text;
 result jsonb; writes integer:=0; affected integer; compact_outcome text; terminal_at timestamptz;
begin
 result:=jsonb_build_object('outcome','refused','workId',p_item_id,'generation',p_generation::text,'reason','scope_mismatch','writes',0);
 if p_item_id is null or p_generation is null or p_generation<0 or p_epoch is null or p_epoch<0
  or p_scope is null or p_scope !~ '^[0-9a-f]{64}$' or p_approval_ref is null or p_approval_ref !~ '^[a-zA-Z0-9_-]{1,100}$' then return result; end if;
 perform pg_advisory_xact_lock(hashtextextended('launch-list-fence',0));
 if not private.launch_write_fence_ready_v1() then return result; end if;
 select * into c from private.launch_list_control where singleton for update;
 select * into a from private.launch_import_authorizations where approval_ref=p_approval_ref for update;
 if not found or c.mode<>'canonical' or c.restore_required or c.fence_epoch<>p_epoch
  or a.operation<>'retention_raw' or a.project_ref is distinct from c.project_ref or a.source_commit is distinct from c.source_commit
  or a.schema_identity is distinct from private.launch_import_schema_v1() or a.expected_scope<>p_scope or a.fence_epoch<>p_epoch
  or a.revoked_at is not null or a.verified_at>clock_timestamp() or a.expires_at<=clock_timestamp()
  or (select count(distinct w) from unnest(a.writer_ids) w)<>cardinality(a.writer_ids)
  or exists(select 1 from unnest(a.writer_ids) w where length(w)>100) then return result; end if;
 select * into i from private.launch_retention_items where item_id=p_item_id for update;
 if not found or i.key_generation is distinct from a.retention_key_generation or i.scope_hash<>p_scope then return result; end if;
 if a.consumed_at is not null then
  if i.state in ('receipt','marker') and a.result_receipt->>'outcome'='disposed'
   and a.result_receipt->>'workId'=p_item_id::text and (a.result_receipt->>'generation')::bigint=p_generation+1 then
   return a.result_receipt||jsonb_build_object('outcome','already_disposed','reason','already_done','writes',0);
  end if;
  return result;
 end if;
 if i.state<>'raw' or i.generation<>p_generation or i.fence_epoch<>p_epoch
  or private.launch_retention_scope_v1(p_item_id) is distinct from p_scope then return result; end if;
 -- Launch-only owning locks follow the outer fence; never signup-email locks.
 select * into s from public.signup_requests where id=i.source_signup_id and intent='launch' for update;
 if not found or s.withdrawn_at is distinct from i.withdrawn_at or s.launch_match is distinct from i.launch_match then return result; end if;
 perform 1 from public.waitlist w where private.normalize_launch_import_email_v1(w.email)=s.email
  or exists(select 1 from private.launch_legacy_provenance p where p.legacy_id=w.id and (p.signup_id=s.id or p.launch_match=i.launch_match)) order by w.id for update;
 perform 1 from private.launch_legacy_provenance p where p.signup_id=s.id or p.launch_match=i.launch_match order by legacy_id for update;
 perform 1 from private.launch_suppressions x where x.launch_match=i.launch_match for update;
 perform 1 from private.launch_withdrawal_receipts w where w.launch_match=i.launch_match order by token_hash for update;
 select * into g from private.launch_delivery_guard where signup_id=s.id for update;
 perform 1 from private.launch_retention_delivery d where d.item_id=i.item_id or d.signup_id=s.id order by signup_id,handoff_token for update;
 if private.launch_retention_scope_v1(p_item_id) is distinct from p_scope or not private.launch_retention_identity_ready_v1()
  or exists(select 1 from private.launch_import_context) then return result; end if;
 if exists(select 1 from private.launch_retention_delivery d where d.item_id=i.item_id or d.signup_id=s.id) then
  return result||jsonb_build_object('outcome','review','reason','unknown_delivery');
 end if;
 f:=private.launch_retention_context_v1(p_item_id,p_generation);
 if f is null or f->>'state'='unavailable' then return result||jsonb_build_object('outcome','review','reason','unavailable'); end if;
 if f->>'lane' is distinct from 'raw' or f->>'intent' is distinct from 'launch' or f->>'consent' is distinct from 'recorded' or s.consent_status<>'recorded'
  or f->>'generation' is distinct from p_generation::text or f->>'epoch' is distinct from p_epoch::text
  or f->'scope' is distinct from jsonb_build_object('state','verified','projectRef',c.project_ref,'sourceCommit',c.source_commit,
    'schemaIdentity',a.schema_identity,'keyGeneration',i.key_generation,'scopeHash',p_scope)
  or f->'completed' is distinct from 'false'::jsonb then return result||jsonb_build_object('outcome','review','reason','unavailable'); end if;
 foreach n in array array['withdrawal','necessity','references','hold','delivery','link','suppression','restore'] loop
  p:=f->n;
  if p is null or p->>'state' is distinct from 'verified' or p->>'generation' is distinct from p_generation::text
   or p->>'epoch' is distinct from p_epoch::text or p->'scope' is distinct from f->'scope'
   or p->>'evidenceRef' is null or p->>'evidenceRef' !~ '^[a-zA-Z0-9_-]{1,100}$'
   or jsonb_typeof(p->'purposes') is distinct from 'array' then
   return result||jsonb_build_object('outcome','review','reason','unavailable');
  end if;
  if jsonb_typeof(p->'evidenceRef') is distinct from 'string'
   or jsonb_typeof(p->'generation') is distinct from 'string' or jsonb_typeof(p->'epoch') is distinct from 'string'
   or not (p->'purposes' <@ case n
    when 'withdrawal' then '[]'::jsonb
    when 'necessity' then '["launch_notification","beta","account","required_record"]'::jsonb
    when 'references' then '["legacy_mapping","operation_replay","delivery_reference"]'::jsonb
    when 'hold' then '["complaint","legal_hold","required_record"]'::jsonb
    when 'delivery' then '["late_result","no_resend","reconciliation","restore"]'::jsonb
    when 'link' then '["usable_link","post_send_minimum","lookup"]'::jsonb
    when 'suppression' then '["current_intake","old_writer","import","campaign","replay","restore"]'::jsonb
    when 'restore' then '["replay","restore","late_result","suppression"]'::jsonb end)
   or jsonb_array_length(p->'purposes')<>(select count(distinct value) from jsonb_array_elements(p->'purposes')) then
   return result||jsonb_build_object('outcome','review','reason','invalid_facts');
  end if;
 end loop;
 if f->'withdrawal'->>'status' is distinct from 'withdrawn' or f->'withdrawal'->>'at' is distinct from f->>'withdrawnAt'
  or f->>'withdrawnAt' is distinct from to_char(i.withdrawn_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  or f->'withdrawal'->'purposes'<>'[]'::jsonb then return result||jsonb_build_object('outcome','review','reason','unavailable'); end if;
 reason:=case when f->'necessity'->'purposes'<>'[]'::jsonb then 'active_purpose'
  when f->'hold'->'purposes'<>'[]'::jsonb then 'held' when f->'references'->'purposes'<>'[]'::jsonb then 'live_reference'
  when f->'restore'->'independent' is distinct from 'true'::jsonb or f->'restore'->'current' is distinct from 'true'::jsonb then 'restore_required'
  when f->'delivery'->>'outcome' is null or f->'delivery'->>'outcome' not in ('none','cancelled','sent','failed','pending','unknown')
    or f->'delivery'->'compactCovered' is distinct from 'true'::jsonb then 'unknown_delivery'
  when f->'link'->'covered' is distinct from 'true'::jsonb then 'link_required'
  when f->'suppression'->'covered' is distinct from 'true'::jsonb then 'live_reference' end;
 if reason is not null then return result||jsonb_build_object('outcome','review','reason',reason); end if;
 -- Independent locally observable protections are mandatory too. A protected
 -- adapter cannot turn a caller assertion into suppression/link coverage.
 if not exists(select 1 from private.launch_suppressions x where x.launch_match=i.launch_match and x.withdrawn_at<=i.withdrawn_at)
  or (s.launch_unsubscribe_hash is not null and not exists(select 1 from private.launch_withdrawal_receipts w
    where w.token_hash=s.launch_unsubscribe_hash and w.launch_match=i.launch_match and w.withdrawn_at=i.withdrawn_at)) then
  return result||jsonb_build_object('outcome','review','reason','link_required');
 end if;
 if g.handoff_token is not null then
  if g.handoff_at is null or not isfinite(g.handoff_at) or g.payload_hash is null
   or s.delivery_template_version is distinct from 'launch-v1' or s.launch_unsubscribe_hash is null
   or (g.claim_token is not null and g.claim_token<>g.handoff_token and (g.claim_outcome is null or g.claim_finished_at is null or not isfinite(g.claim_finished_at))) then
   return result||jsonb_build_object('outcome','review','reason','unknown_delivery');
  end if;
  compact_outcome:=case when g.settled and coalesce(g.handoff_state,s.delivery_state) in ('sent','failed')
    then coalesce(g.handoff_state,s.delivery_state) when g.handoff_state='pending' or s.delivery_state='pending' then 'pending' else 'unknown' end;
  if (not g.settled and g.handoff_state in ('sent','failed'))
    or (compact_outcome='failed' and not coalesce(
      (s.delivery_state='failed' and s.delivery_token=g.handoff_token
        and (g.claim_token is null or g.claim_token=g.handoff_token) and g.claim_outcome is null and g.claim_finished_at is null)
      or (g.handoff_state='failed' and g.claim_token is not null and g.claim_token<>g.handoff_token
        and g.claim_outcome in ('cancelled','disabled') and isfinite(g.claim_finished_at)
        and s.delivery_first_attempt_at<=g.handoff_at and g.handoff_at<=s.delivery_attempted_at
        and g.claim_finished_at>=s.delivery_attempted_at and s.withdrawn_at is not null
        and s.delivery_token is null and s.delivery_state in ('sending','disabled')),false))
    or (compact_outcome='sent' and (s.provider_id is null or s.provider_id !~ '^[a-zA-Z0-9_-]{1,100}$' or s.delivery_state<>'sent' or s.delivery_token is distinct from g.handoff_token))
    or (compact_outcome='failed' and s.provider_id is not null) or (compact_outcome in ('unknown','pending') and s.provider_id is not null) then
   return result||jsonb_build_object('outcome','review','reason','unknown_delivery');
  end if;
  -- Observation time for an already evidenced terminal outcome, NEVER an
  -- invented actual-send clock or a usable-link expiry basis.
  terminal_at:=case when compact_outcome in ('sent','failed') then greatest(clock_timestamp(),g.handoff_at) end;
  insert into private.launch_retention_delivery(item_id,signup_id,handoff_token,generation,fence_epoch,handoff_at,outcome,settled_at,provider_ref,claim_token,claim_outcome,claim_finished_at)
   values(i.item_id,s.id,g.handoff_token,i.generation,i.fence_epoch,g.handoff_at,compact_outcome,terminal_at,
    case when compact_outcome='sent' then s.provider_id end,
    case when g.claim_token<>g.handoff_token then g.claim_token end,
    case when g.claim_token<>g.handoff_token then g.claim_outcome end,
    case when g.claim_token<>g.handoff_token then g.claim_finished_at end);
  writes:=writes+1;
 elsif s.provider_id is not null or s.delivery_first_attempt_at is not null
  or (g.claim_token is not null and (g.claim_outcome not in ('cancelled','disabled') or g.claim_outcome is null or g.claim_finished_at is null)) then
  return result||jsonb_build_object('outcome','review','reason','unknown_delivery');
 end if;
 -- NO ACTION order: detach provenance and ledger, remove exact old source,
 -- remove dependent delivery guard, then delete the complete raw launch row.
 update private.launch_legacy_provenance p set signup_id=null,outcome='disposed',disposition_id=i.item_id
  where p.launch_match=i.launch_match and (p.signup_id=s.id or (p.signup_id is null and p.outcome='suppressed'
   and exists(select 1 from public.waitlist w where w.id=p.legacy_id and w.created_at=p.legacy_created_at
    and private.normalize_launch_import_email_v1(w.email)=s.email)));
 get diagnostics affected=row_count; writes:=writes+affected;
 delete from public.waitlist w using private.launch_legacy_provenance p where p.legacy_id=w.id and p.disposition_id=i.item_id
  and p.legacy_created_at=w.created_at and private.normalize_launch_import_email_v1(w.email)=s.email;
 get diagnostics affected=row_count; writes:=writes+affected;
 delete from private.launch_delivery_guard where signup_id=s.id;
 get diagnostics affected=row_count; writes:=writes+affected;
 update private.launch_retention_items set source_signup_id=null,state=case when g.handoff_token is not null then 'receipt' else 'marker' end,
  generation=generation+1,reason_code='eligible',decided_at=clock_timestamp() where item_id=i.item_id;
 writes:=writes+1;
 delete from public.signup_requests where id=s.id and intent='launch' and withdrawn_at=i.withdrawn_at and launch_match=i.launch_match;
 get diagnostics affected=row_count;
 if affected<>1 then raise exception 'launch disposition unavailable'; end if;
 writes:=writes+affected;
 result:=jsonb_build_object('outcome','disposed','workId',i.item_id,'generation',(i.generation+1)::text,'reason','eligible','writes',writes+1);
 update private.launch_import_authorizations set consumed_at=clock_timestamp(),post_scope=private.launch_retention_legacy_scope_v1(i.item_id),result_receipt=result where approval_ref=a.approval_ref;
 if a.expires_at<=clock_timestamp() or not private.launch_retention_identity_ready_v1() or not private.launch_write_fence_ready_v1() then
  raise exception 'launch disposition unavailable';
 end if;
 return result;
exception when others then
 -- PL/pgSQL subtransaction rolls back ALL writes/locks in this body. Never
 -- expose raw exceptions or partial-write counts, including timeout/constraint.
 return jsonb_build_object('outcome','refused','workId',p_item_id,'generation',p_generation::text,'reason','unavailable','writes',0);
end $$;
revoke all on function private.dispose_launch_raw_v1(uuid,bigint,bigint,text,text) from public,anon,authenticated;
grant execute on function private.dispose_launch_raw_v1(uuid,bigint,bigint,text,text) to service_role;
create function public.dispose_launch_raw_v1(p_item_id uuid,p_generation bigint,p_epoch bigint,p_scope text,p_approval_ref text)
returns jsonb language sql security invoker set search_path=pg_catalog as $$
 select private.dispose_launch_raw_v1(p_item_id,p_generation,p_epoch,p_scope,p_approval_ref);
$$;
revoke all on function public.dispose_launch_raw_v1(uuid,bigint,bigint,text,text) from public,anon,authenticated;
grant execute on function public.dispose_launch_raw_v1(uuid,bigint,bigint,text,text) to service_role;

-- Exact late finishes cannot recreate raw state or acquire delivery authority.
-- No ledger DML grant is added: this private service-only executor is privileged
-- solely to advance the matching receipt under its current owning scope.
create or replace function private.finish_launch_delivery_v1(p_id uuid,p_token uuid,p_state text,p_provider_id text default null)
returns boolean language plpgsql security definer set search_path=pg_catalog as $$
declare r public.signup_requests; g private.launch_delivery_guard; d private.launch_retention_delivery; i private.launch_retention_items;
begin
 if p_state is null or p_state not in ('sent','failed','pending','disabled') or p_token is null
  or (p_state='sent' and (p_provider_id is null or length(trim(p_provider_id))=0))
  or (p_state<>'sent' and p_provider_id is not null) then return false; end if;
 perform pg_advisory_xact_lock(hashtextextended('launch-list-fence',0));
 if not private.launch_write_fence_ready_v1() then return false; end if;
 select * into r from public.signup_requests where id=p_id and intent='launch';
 if not found then
  select x.* into i from private.launch_retention_items x join private.launch_retention_delivery y on y.item_id=x.item_id
   where y.signup_id=p_id and y.handoff_token=p_token for update of x;
  if not found or i.state<>'receipt' or not exists(select 1 from private.launch_list_control where singleton and fence_epoch=i.fence_epoch) then return false; end if;
  select * into d from private.launch_retention_delivery where signup_id=p_id and handoff_token=p_token for update;
  if not found or p_state='disabled' or (p_state='sent' and p_provider_id !~ '^[a-zA-Z0-9_-]{1,100}$') then return false; end if;
  if d.outcome in ('sent','failed') then return d.outcome=p_state and d.provider_ref is not distinct from p_provider_id; end if;
  update private.launch_retention_delivery set generation=i.generation,fence_epoch=i.fence_epoch,outcome=p_state,
   provider_ref=p_provider_id,settled_at=case when p_state in ('sent','failed') then greatest(clock_timestamp(),handoff_at) end
   where signup_id=p_id and handoff_token=p_token;
  return true;
 end if;
 perform pg_advisory_xact_lock(hashtextextended('signup-email:'||r.email,0));
 select * into r from public.signup_requests where id=p_id and intent='launch' for update;
 select * into g from private.launch_delivery_guard where signup_id=p_id for update;
 if not found then return false; end if;
 if p_state='disabled' then
  if g.claim_token is distinct from p_token or g.claim_outcome is not null
   or (g.handoff_token is not null and (not g.settled or g.handoff_state is distinct from 'failed' or g.handoff_token=p_token))
   or r.delivery_token is distinct from p_token or r.withdrawn_at is not null or r.delivery_state<>'sending' then return false; end if;
 elsif g.handoff_token is distinct from p_token or g.settled or g.handoff_at is null
  or not isfinite(g.handoff_at) or g.payload_hash is null then return false;
 end if;
 update public.signup_requests set delivery_state=p_state,provider_id=p_provider_id where id=p_id;
 if p_state='disabled' then
  update private.launch_delivery_guard set claim_outcome='disabled',claim_finished_at=clock_timestamp(),
   settled=case when handoff_token is null then true else settled end where signup_id=p_id;
 elsif p_state<>'pending' then
  update private.launch_delivery_guard set settled=true,handoff_state=p_state where signup_id=p_id;
 end if;
 return true;
end $$;
revoke all on function private.finish_launch_delivery_v1(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function private.finish_launch_delivery_v1(uuid,uuid,text,text) to service_role;

-- Withdrawal's hash lookup already precedes raw lookup. Preserve its exact
-- signature/shape and explicitly cover independent compact links below.
comment on function private.withdraw_launch_v1(text) is
 'Hash-only receipt lookup precedes raw lookup, including after atomic disposition. Repeated usable links remain already_withdrawn without identity collection or sending; no automatic expiry. Compact handoffs never restore a raw row.';

-- Cover all lifecycle/facade replacements plus private retention definitions,
-- every owning ACL/column/constraint/index/policy and the original writer guards.
create or replace function private.launch_write_fence_fingerprint_v1()
returns text language sql stable security invoker set search_path=pg_catalog as $$
 select encode(sha256(convert_to(jsonb_build_object(
  'functions',(select jsonb_agg(row(n.nspname,p.proname,pg_get_functiondef(p.oid),p.proacl) order by n.nspname,p.proname,pg_get_function_identity_arguments(p.oid))
   from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where (n.nspname='public' and p.proname in ('claim_signup_v1','finish_signup_delivery_v1','set_launch_mode_v1',
    'dispose_launch_raw_v1','finish_launch_delivery_v1','withdraw_launch_v1','inventory_launch_legacy_v1','reconcile_launch_legacy_v1'))
    or (n.nspname='private' and (p.proname in ('guard_launch_writes_v1','launch_write_fence_fingerprint_v1','launch_write_fence_ready_v1',
      'claim_launch_signup_v2','pin_launch_payload_v1','authorize_launch_delivery_v1','finish_launch_delivery_v1','withdraw_launch_v1',
      'set_launch_mode_v1','launch_cutover_data_ready_v1','launch_delivery_data_ready_v1','reconcile_launch_legacy_v1',
      'read_launch_import_authorization_v1','inventory_launch_legacy_v1','launch_import_schema_v1','dispose_launch_raw_v1') or p.proname like '%launch_retention%'))),
  'triggers',(select jsonb_agg(row(tgrelid::regclass::text,pg_get_triggerdef(oid),tgenabled) order by tgrelid::regclass::text,tgname)
   from pg_trigger where tgname in ('launch_write_fence','launch_retention_state_guard')),
  'grants',(select jsonb_agg(row(c.oid::regclass::text,c.relacl,c.relrowsecurity,c.relforcerowsecurity) order by c.oid::regclass::text)
   from pg_class c where c.oid in ('public.waitlist'::regclass,'public.signup_requests'::regclass,
    'private.launch_import_context'::regclass,'private.launch_import_authorizations'::regclass,'private.launch_write_fence_contract'::regclass,
    'private.launch_retention_items'::regclass,'private.launch_retention_delivery'::regclass,'private.launch_legacy_provenance'::regclass,
    'private.launch_suppressions'::regclass,'private.launch_withdrawal_receipts'::regclass,'private.launch_delivery_guard'::regclass)),
  'columns',(select jsonb_agg(row(attrelid::regclass::text,attname,format_type(atttypid,atttypmod),attnotnull) order by attrelid::regclass::text,attnum)
   from pg_attribute where attrelid in ('private.launch_retention_items'::regclass,'private.launch_retention_delivery'::regclass,
    'private.launch_legacy_provenance'::regclass) and attnum>0 and not attisdropped),
  'constraints',(select jsonb_agg(row(conrelid::regclass::text,conname,pg_get_constraintdef(oid)) order by conrelid::regclass::text,conname)
   from pg_constraint where conrelid in ('private.launch_retention_items'::regclass,'private.launch_retention_delivery'::regclass,
    'private.launch_legacy_provenance'::regclass,'private.launch_import_authorizations'::regclass,'private.launch_suppressions'::regclass,
    'private.launch_withdrawal_receipts'::regclass,'private.launch_delivery_guard'::regclass)),
  'policies',(select jsonb_agg(to_jsonb(p) order by schemaname,tablename,policyname) from pg_policies p
   where schemaname='private' and tablename like 'launch_%'),
  'indexes',(select jsonb_agg(indexdef order by indexname) from pg_indexes where schemaname='private' and tablename like 'launch_%')
 )::text,'UTF8')),'hex');
$$;
update private.launch_write_fence_contract set definition_hash=private.launch_write_fence_fingerprint_v1() where version=1;
commit;
