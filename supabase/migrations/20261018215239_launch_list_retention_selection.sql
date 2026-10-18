-- Forward-only Q: choose unique usable authority BEFORE bounding the page.
-- Read-only inventory, unchanged v1 arguments/envelope, no cursor/issuer/clock.
begin;
do $$ begin
 if not private.launch_write_fence_ready_v1() then
  raise exception 'launch retention selection requires the accepted fence';
 end if;
end $$;
create or replace function private.inventory_launch_retention_v1(p_limit integer default 100)
returns jsonb language plpgsql stable security invoker set search_path=pg_catalog as $$
declare c private.launch_list_control;items jsonb;result jsonb;installed_schema text;
begin
 result:=jsonb_build_object('state','unavailable','items','[]'::jsonb,'hasMore',false,
  'reasons',jsonb_build_array('unavailable','coverage_unavailable','copies_unavailable'));
 if p_limit is null or p_limit<1 or p_limit>100 or not private.launch_write_fence_ready_v1() then return result;end if;
 select * into c from private.launch_list_control where singleton;
 if c.project_ref is null or c.source_commit is null or c.mode='transition' then
  return result||jsonb_build_object('state','disabled','reasons',jsonb_build_array('coverage_unavailable','copies_unavailable'));
 end if;
 if c.restore_required then return result;end if;
 installed_schema:=private.launch_import_schema_v1();
 -- Authority is only admission, never current purpose/hold/restore proof.
 -- Unusable authority cannot occupy every bounded slot ahead of usable work.
 -- Preserve blocked objects unchanged for private review; consumed/stale scopes
 -- cease to take priority on the next invocation, including positive-write review.
 with candidates as (
  select i.*,case when i.state='retired' then 'marker' else i.state end as lane,
   coalesce(i.scope_hash,private.launch_retention_retirement_scope_v1(i.item_id)) as work_scope
  from private.launch_retention_items i
 ), work as (
  select i.*,a.approval_ref from candidates i left join lateral (
   select min(a.approval_ref) as approval_ref from private.launch_import_authorizations a
   where a.operation='retention_'||i.lane and a.project_ref=c.project_ref and a.source_commit=c.source_commit
    and a.schema_identity=installed_schema and a.expected_scope=i.work_scope
    and a.expected_scope=case when i.lane='raw' then private.launch_retention_scope_v1(i.item_id)
      else private.launch_retention_retirement_scope_v1(i.item_id) end
    and a.fence_epoch=c.fence_epoch and (i.state='retired' or i.fence_epoch=c.fence_epoch)
    and (i.state='retired' or a.retention_key_generation=i.key_generation)
    and a.consumed_at is null and a.revoked_at is null and a.minimized_fields='{}'
    and a.verified_at<=now() and a.expires_at>now()
   having count(*)=1
  ) a on true
 ), page as (
  select * from work order by (approval_ref is null),decided_at nulls last,item_id limit p_limit+1
 ) select coalesce(jsonb_agg(jsonb_build_object('itemId',item_id,'generation',generation::text,'epoch',c.fence_epoch::text,
    'scope',work_scope,'approvalRef',approval_ref,'lane',lane,'ageSeconds',null,
    'reason',case when approval_ref is null then 'unavailable' else 'eligible' end)
    order by (approval_ref is null),decided_at nulls last,item_id),'[]'::jsonb) into items from page;
 return jsonb_build_object('state','ready','items',(select coalesce(jsonb_agg(value order by ordinality),'[]'::jsonb)
   from jsonb_array_elements(items) with ordinality where ordinality<=p_limit),
  'hasMore',jsonb_array_length(items)>p_limit,
  'reasons',jsonb_build_array('coverage_unavailable','copies_unavailable'));
exception when others then return result;
end $$;
-- P already fingerprints this private implementation and facade/ACLs. Refresh
-- only the owner-installed expected digest; service cannot certify new code.
update private.launch_write_fence_contract set definition_hash=private.launch_write_fence_fingerprint_v1() where version=1;
commit;
