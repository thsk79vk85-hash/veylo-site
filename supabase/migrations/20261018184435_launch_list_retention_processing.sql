-- Dormant website-only bounded consumer interfaces. No issuer, schedule,
-- production adapter, grant enforcement against old callers or activation.
begin;
create function private.inventory_launch_retention_v1(p_limit integer default 100)
returns jsonb language plpgsql stable security invoker set search_path=pg_catalog as $$
declare c private.launch_list_control;items jsonb;result jsonb;
begin
 result:=jsonb_build_object('state','unavailable','items','[]'::jsonb,'hasMore',false,'reasons',jsonb_build_array('unavailable'));
 if p_limit is null or p_limit<1 or p_limit>100 or not private.launch_write_fence_ready_v1() then return result;end if;
 select * into c from private.launch_list_control where singleton;
 if c.project_ref is null or c.source_commit is null or c.mode='transition' then
  return result||jsonb_build_object('state','disabled','reasons','[]'::jsonb);
 end if;
 if c.restore_required then return result;end if;
 -- Observation only. A valid existing authority is not proof of current field,
 -- consent, hold, copy or reference eligibility. Apply rechecks every owner.
 with candidates as (
  select i.*,case when i.state='retired' then 'marker' else i.state end as lane,
   coalesce(i.scope_hash,private.launch_retention_retirement_scope_v1(i.item_id)) as work_scope
  from private.launch_retention_items i order by i.decided_at nulls last,i.item_id limit p_limit+1
 ), work as (
  select i.*,a.approval_ref from candidates i left join lateral (
   select min(a.approval_ref) as approval_ref from private.launch_import_authorizations a
   where a.operation='retention_'||i.lane and a.project_ref=c.project_ref and a.source_commit=c.source_commit
    and a.schema_identity=private.launch_import_schema_v1() and a.expected_scope=i.work_scope
    and a.expected_scope=case when i.lane='raw' then private.launch_retention_scope_v1(i.item_id)
      else private.launch_retention_retirement_scope_v1(i.item_id) end
    and a.fence_epoch=c.fence_epoch and (i.state='retired' or i.fence_epoch=c.fence_epoch)
    and (i.state='retired' or a.retention_key_generation=i.key_generation)
    and a.consumed_at is null and a.revoked_at is null and a.minimized_fields='{}'
    and a.verified_at<=now() and a.expires_at>now()
   having count(*)=1
  ) a on true
 ) select coalesce(jsonb_agg(jsonb_build_object('itemId',item_id,'generation',generation::text,'epoch',c.fence_epoch::text,
    'scope',work_scope,'approvalRef',approval_ref,'lane',lane,
    'ageSeconds',greatest(0,floor(extract(epoch from now()-coalesce(decided_at,now()))))::bigint,
    'reason',case when approval_ref is null then 'unavailable' else 'eligible' end)
    order by decided_at nulls last,item_id),'[]'::jsonb) into items from work;
 return jsonb_build_object('state','ready','items',(select coalesce(jsonb_agg(value order by ordinality),'[]'::jsonb)
   from jsonb_array_elements(items) with ordinality where ordinality<=p_limit),
  'hasMore',jsonb_array_length(items)>p_limit,
  'reasons',case when jsonb_array_length(items)>0 then jsonb_build_array('copies_unavailable') else '[]'::jsonb end);
exception when others then return result;
end $$;

create function private.sweep_launch_rate_events_v1(p_limit integer default 100)
returns jsonb language plpgsql security invoker set search_path=pg_catalog set lock_timeout='1000ms' as $$
declare deadline integer;n integer;remaining boolean;
begin
 select setting::integer into deadline from pg_settings where name='statement_timeout';
 -- Admission only. Supplied trusted transport establishes the timer at startup
 -- or BEFORE dispatch; this check is not timer-arm attestation.
 if p_limit is null or p_limit<1 or p_limit>100 or deadline<1 or deadline>5000
  or not private.launch_write_fence_ready_v1() then
  return jsonb_build_object('state','unavailable','visited',0,'completed',0,'remaining',true);end if;
 -- No launch fence/owning item dependency: exceptions cannot starve rate expiry.
 -- Strictly older than the EXISTING day; no ten-minute enforcement changes.
 with expired as (select id from public.signup_rate_events where created_at<now()-interval '1 day'
  order by created_at,id for update skip locked limit p_limit), removed as (
  delete from public.signup_rate_events e using expired x where e.id=x.id returning e.id)
 select count(*) into n from removed;
 select exists(select 1 from public.signup_rate_events where created_at<now()-interval '1 day') into remaining;
 return jsonb_build_object('state',case when n>0 then 'processed' when remaining then 'unavailable' else 'idle' end,
  'visited',n,'completed',n,'remaining',remaining);
exception when query_canceled then
 return jsonb_build_object('state','unavailable','visited',0,'completed',0,'remaining',true);
when others then
 return jsonb_build_object('state','unavailable','visited',0,'completed',0,'remaining',true);
end $$;

create function public.inventory_launch_retention_v1(p_limit integer default 100)
returns jsonb language sql stable security invoker set search_path=pg_catalog as $$
 select private.inventory_launch_retention_v1(p_limit);
$$;
create function public.sweep_launch_rate_events_v1(p_limit integer default 100)
returns jsonb language sql security invoker set search_path=pg_catalog as $$
 select private.sweep_launch_rate_events_v1(p_limit);
$$;
revoke all on function private.inventory_launch_retention_v1(integer),private.sweep_launch_rate_events_v1(integer),
 public.inventory_launch_retention_v1(integer),public.sweep_launch_rate_events_v1(integer) from public,anon,authenticated;
grant execute on function private.inventory_launch_retention_v1(integer),private.sweep_launch_rate_events_v1(integer),
 public.inventory_launch_retention_v1(integer),public.sweep_launch_rate_events_v1(integer) to service_role;

-- Extend the SAME owner-installed fingerprint, without changing accepted SQL
-- bytes or giving service the ability to certify an altered contract.
do $$ declare d text;needle text;begin
 d:=pg_get_functiondef('private.launch_write_fence_fingerprint_v1()'::regprocedure);
 needle:='''minimize_launch_receipt_v1'',''retire_launch_marker_v1''';
 if strpos(d,needle)=0 then raise exception 'accepted processing fingerprint mismatch';end if;
 d:=replace(d,needle,'''inventory_launch_retention_v1'',''sweep_launch_rate_events_v1'','||needle);
 needle:='''triggers'',(select';
 if strpos(d,needle)=0 then raise exception 'accepted rate fingerprint mismatch';end if;
 d:=replace(d,needle,'''rateContract'',(select row(c.relacl,c.relrowsecurity,c.relforcerowsecurity)::text from pg_class c where c.oid=''public.signup_rate_events''::regclass),'||needle);
 execute d;
end $$;
update private.launch_write_fence_contract set definition_hash=private.launch_write_fence_fingerprint_v1() where version=1;
commit;
