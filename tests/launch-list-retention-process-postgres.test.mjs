import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync,readdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createOwnedLaunchRetentionFixture } from './helpers/launch-retention-fixture.mjs';
import { createLaunchRetentionClient } from '../lib/launch-retention-client.mjs';
import { processLaunchRetention } from '../lib/process-launch-retention.mjs';
const read=n=>readFileSync(new URL(`../supabase/${n}`,import.meta.url),'utf8');
const project='yohiumlrpfdhphsnnxxw',source='a'.repeat(40);

test('bounded processing and actual startup-deadline supplier on W+I+L+C+S+D+R+P+Q',async t=>{
  const fixture=createOwnedLaunchRetentionFixture(),db=fixture.db;
  const client=createLaunchRetentionClient({transport:fixture.transport});
  const call=q=>db.sql(`set role service_role;${q}`);
  const snapshot=()=>db.sql(`select jsonb_build_array(
    (select jsonb_agg(to_jsonb(s) order by id) from public.signup_requests s),
    (select jsonb_agg(to_jsonb(i) order by item_id) from private.launch_retention_items i),
    (select jsonb_agg(to_jsonb(a) order by approval_ref) from private.launch_import_authorizations a),
    (select jsonb_agg(to_jsonb(d) order by signup_id,handoff_token) from private.launch_retention_delivery d))`);
  const seed=(consent='recorded',decisionAt='clock_timestamp()')=>{
    const itemId=randomUUID(),signup=randomUUID(),match=randomUUID().replaceAll('-','').repeat(2),approvalRef=`synthetic-${randomUUID()}`;
    db.sql(`insert into public.signup_requests(id,email,intent,platform,source,consent_status,consent_version,registration_origin,withdrawn_at,launch_match,delivery_state)
      values('${signup}','${signup}@test.invalid','launch','unspecified','direct','${consent}',${consent==='recorded'?"'original'":"null"},
        '${consent==='recorded'?'current_form':'legacy_api'}','2026-10-18','${match}','disabled');
      insert into private.launch_suppressions values('${match}','2026-10-18','unsubscribe');
      insert into private.launch_retention_items(item_id,source_signup_id,launch_match,key_generation,generation,fence_epoch,state,policy_version,reason_code,evidence_ref,scope_hash,withdrawn_at,decided_at)
      values('${itemId}','${signup}','${match}','1',9007199254740993,0,'raw',1,'eligible','synthetic-evidence','${'c'.repeat(64)}','2026-10-18',${decisionAt});
      update private.launch_retention_items set generation=generation+1,scope_hash=private.launch_retention_scope_v1('${itemId}') where item_id='${itemId}';
      insert into private.launch_import_authorizations(approval_ref,project_ref,source_commit,schema_identity,expected_scope,fence_epoch,writer_ids,
        control_evidence,test_evidence,settlement_evidence,verified_at,expires_at,operation,retention_key_generation)
      select '${approvalRef}','${project}','${source}',private.launch_import_schema_v1(),scope_hash,0,array['synthetic-writer'],
        'synthetic-control','synthetic-test','synthetic-settlement',clock_timestamp()-interval '1 second',clock_timestamp()+interval '1 hour','retention_raw','1'
        from private.launch_retention_items where item_id='${itemId}'`);
    return {itemId,generation:'9007199254740994',epoch:'0',scope:db.sql(`select scope_hash from private.launch_retention_items where item_id='${itemId}'`),approvalRef,lane:'raw'};
  };
  const locksFree=r=>{
    assert.equal(db.sql(`begin;set lock_timeout='300ms';select pg_try_advisory_xact_lock(hashtextextended('launch-list-fence',0));
      select count(*) from (select 1 from private.launch_retention_items where item_id='${r.itemId}' for update) q;
      select count(*) from (select 1 from private.launch_import_authorizations where approval_ref='${r.approvalRef}' for update) q;rollback`),'t\n1\n1');
  };
  try{
    await fixture.start();
    db.sql('create role anon;create role authenticated;create role service_role bypassrls;grant usage on schema public to anon,authenticated,service_role');
    db.sql(read('waitlist.sql'));db.sql('grant all on public.waitlist to service_role');
    const migrations=['20261011050938_add_signup_intents.sql','20261013112838_launch_list_lifecycle.sql','20261013125523_launch_list_canonical_cutover.sql',
      '20261018141524_launch_list_retention_state.sql','20261018150520_launch_list_retention_disposition.sql','20261018170026_launch_list_retention_retirement.sql',
      ...readdirSync(new URL('../supabase/migrations/',import.meta.url)).filter(n=>n.endsWith('_launch_list_retention_processing.sql')||n.endsWith('_launch_list_retention_selection.sql')).sort()];
    for(const name of migrations)db.sql(read(`migrations/${name}`));
    t.diagnostic(`Actual fixture: waitlist.sql + ${migrations.join(', ')}`);
    const installed=db.sql("select to_regprocedure('public.inventory_launch_retention_v1(integer)') is not null and to_regprocedure('public.sweep_launch_rate_events_v1(integer)') is not null");
    await t.test('required processing inventory and independent idle sweep exist',()=>assert.equal(installed,'t','Task5 must install read-only inventory and bounded idle sweep'));
    if(installed!=='t')return;
    await t.test('default OFF/unavailable owns no authority or schedules; old APIs and grants unchanged',async()=>{
      assert.equal((await client.inventory({limit:100})).state,'disabled');
      assert.equal(db.sql('select count(*) from private.launch_import_authorizations'),'0');
      assert.equal(db.sql("select exists(select 1 from pg_extension where extname='pg_cron')"),'f');
      for(const role of ['anon','authenticated'])for(const fn of ['inventory_launch_retention_v1','sweep_launch_rate_events_v1'])
        assert.throws(()=>db.sql(`set role ${role};select public.${fn}(1)`),/permission denied/);
      for(const table of ['launch_retention_items','launch_retention_delivery'])assert.throws(()=>call(`delete from private.${table}`),/permission denied/);
      assert.equal(db.sql('select private.launch_write_fence_ready_v1()'),'t');assert.equal(db.sql('show statement_timeout'),'0');
    });
    await t.test('strictly one day boundary and recent ten-minute enforcement survive independent idle sweep',async()=>{
      // One transaction fixes now(): equality is tested against the exact server boundary.
      assert.equal(db.sql(`begin;insert into public.signup_rate_events(ip_hash,created_at) values
        ('old',now()-interval '1 day 1 second'),('boundary',now()-interval '1 day'),('recent',now()-interval '9 minutes');
        set local role service_role;set local statement_timeout='5s';select public.sweep_launch_rate_events_v1(100)->>'completed';
        reset role;select string_agg(ip_hash,',' order by ip_hash) from public.signup_rate_events;rollback`),'1\nboundary,recent');
      db.sql(`insert into public.signup_rate_events(ip_hash,created_at) select '${'b'.repeat(64)}',now()-interval '9 minutes' from generate_series(1,10);
        insert into public.signup_rate_events(ip_hash,created_at) select 'old',now()-interval '2 days' from generate_series(1,3)`);
      assert.deepEqual(await client.sweepRateEvents({limit:2}),{state:'processed',visited:2,completed:2,remaining:true});
      assert.deepEqual(await client.sweepRateEvents({limit:2}),{state:'processed',visited:1,completed:1,remaining:false});
      assert.equal(JSON.parse(call(`select public.claim_signup_v1('rate@test.invalid','beta','ios','direct','${'b'.repeat(64)}')`)).limited,true);
      assert.equal(db.sql('select count(*) from public.signup_rate_events'),'10');
    });
    db.sql(`update private.launch_list_control set project_ref='${project}',source_commit='${source}',mode='canonical'`);
    db.sql(`insert into public.signup_requests(email,intent,platform,source,consent_version)
      values('active@test.invalid','launch','unspecified','direct','original'),
        ('active@test.invalid','beta','ios','direct','original'),('active@test.invalid','beta','android','direct','original')`);
    const preserved=()=>db.sql("select jsonb_agg(to_jsonb(s) order by id) from public.signup_requests s where email='active@test.invalid'");
    const beforePreserved=preserved();
    await t.test('rate sweep progresses while an exceptional launch transaction owns the outer fence',async()=>{
      db.sql("insert into public.signup_rate_events(ip_hash,created_at) values('independent',now()-interval '2 days')");
      const holder=db.asyncSql("set application_name='task5-owned-fence';begin;select pg_advisory_xact_lock(hashtextextended('launch-list-fence',0));select pg_sleep(3);commit");
      try{
        let observed=false;
        for(let n=0;n<100;n++){
          if(db.sql("select exists(select 1 from pg_stat_activity where application_name='task5-owned-fence' and wait_event='PgSleep')")==='t'){observed=true;break;}
          await new Promise(resolve=>setTimeout(resolve,20));
        }
        assert.equal(observed,true,'owned fence holder must be observed before testing independence');
        assert.equal((await client.sweepRateEvents({limit:1})).completed,1);
        assert.equal(db.sql("select exists(select 1 from pg_stat_activity where application_name='task5-owned-fence' and wait_event='PgSleep')"),'t','holder must still own the fence after rate completion');
      }finally{await holder;}
    });
    const unavailable=seed('recorded',"'2000-01-01'");
    await t.test('I1 an old synthetic decision time is not an eligibility clock or population proof',async()=>{
      const inv=await client.inventory({limit:1});
      assert.equal(inv.items[0].ageSeconds,null,'neither decision date nor a bounded page establishes oldest eligible age');
    });
    await t.test('inventory is read-only exact bigint with unbound facts returning review and no mutation',async()=>{
      const before=snapshot();const inv=await client.inventory({limit:1});
      assert.equal(inv.items[0].generation,'9007199254740994');assert.equal(inv.items[0].scope,unavailable.scope);
      const out=await client.apply(unavailable);assert.equal(out.outcome,'review');assert.equal(out.reason,'unavailable');
      assert.equal(snapshot(),before);
      assert.equal(JSON.parse(db.sql('begin read only;set local role service_role;select public.inventory_launch_retention_v1(100);commit')).state,'ready');
    });
    // Owner-only synthetic purpose binding; no setter ships. nextval proves
    // entry and observes the startup GUC on the same connection as real D.
    db.sql(`create schema synthetic_test;create sequence synthetic_test.proof_calls;create sequence synthetic_test.reached_write;
      create table synthetic_test.settings(pause_seconds float8 not null,pause_write boolean not null default false);insert into synthetic_test.settings(pause_seconds) values(0);
      create function synthetic_test.pause_after_delete() returns trigger language plpgsql as $pause$
        begin if (select pause_write from synthetic_test.settings) then
          perform nextval('synthetic_test.reached_write');perform pg_sleep(6);end if;return old;end $pause$;
      create trigger synthetic_reached_write after delete on public.signup_requests for each row execute function synthetic_test.pause_after_delete();
      ${db.sql("select replace(pg_get_functiondef('private.launch_retention_context_v1(uuid,bigint)'::regprocedure),'private.launch_retention_context_v1','synthetic_test.base_context')")};
      create or replace function private.launch_retention_context_v1(p_item_id uuid,p_generation bigint)
      returns jsonb language plpgsql volatile security invoker set search_path=pg_catalog as $facts$
      declare f jsonb;p jsonb;n text;begin
        if current_setting('statement_timeout')<>'5s' then raise exception 'startup deadline absent';end if;
        perform nextval('synthetic_test.proof_calls');perform pg_sleep((select pause_seconds from synthetic_test.settings));
        f:=synthetic_test.base_context(p_item_id,p_generation);if f->>'state'='unavailable' then return f;end if;p:=(f->'withdrawal')-array['status','at'];
        foreach n in array array['necessity','references','hold','delivery','link','suppression','restore'] loop
          f:=jsonb_set(f,array[n],p||jsonb_build_object('purposes',case n when 'suppression' then '["current_intake"]'::jsonb else '[]'::jsonb end));end loop;
        f:=jsonb_set(f,'{delivery}',f->'delivery'||'{"outcome":"none","compactCovered":true}');
        f:=jsonb_set(f,'{link}',f->'link'||'{"covered":true}');f:=jsonb_set(f,'{suppression}',f->'suppression'||'{"covered":true}');
        return jsonb_set(f,'{restore}',f->'restore'||'{"independent":true,"current":true}');end $facts$;
      update private.launch_write_fence_contract set definition_hash=private.launch_write_fence_fingerprint_v1();
      update private.launch_import_authorizations set schema_identity=private.launch_import_schema_v1() where consumed_at is null`);
    await t.test('same real client/owned supplier succeeds under startup timer; stale retry has zero writes',async()=>{
      const out=await client.apply(unavailable);assert.equal(out.outcome,'disposed');assert.ok(out.writes>0);assert.equal(out.generation,'9007199254740995');
      assert.equal(db.sql('select last_value from synthetic_test.proof_calls'),'1');
      const retry=await client.apply(unavailable);assert.equal(retry.outcome,'already_disposed');assert.equal(retry.writes,0);
      assert.equal((await client.inventory({limit:100})).items.find(i=>i.itemId===unavailable.itemId).ageSeconds,null,'D resetting decision time cannot invent a cross-lane eligibility clock');
      assert.equal(db.sql('show statement_timeout'),'0');
    });
    await t.test('same supplier cancels real slow protected proof at startup 5000ms and releases locks',async()=>{
      const r=seed(),before=snapshot();db.sql('update synthetic_test.settings set pause_seconds=6');
      try{
        const start=performance.now(),out=await client.apply(r),elapsed=performance.now()-start;
        assert.equal(out.reason,'unavailable');assert.equal(out.writes,0);assert.ok(elapsed>=4500&&elapsed<10000,`server cancellation elapsed ${elapsed}ms`);
        assert.equal(db.sql('select last_value from synthetic_test.proof_calls'),'2');assert.equal(snapshot(),before);locksFree(r);
        t.diagnostic(`Actual slow proof cancelled after ${Math.round(elapsed)}ms`);
      }finally{db.sql('update synthetic_test.settings set pause_seconds=0');}
    });
    await t.test('reached-write cancellation rolls real D back including item and authority and releases locks',async()=>{
      const r=seed(),before=snapshot();db.sql('update synthetic_test.settings set pause_write=true');
      try{
        const out=await client.apply(r);assert.equal(out.writes,0);assert.equal(out.reason,'unavailable');
        assert.equal(db.sql('select last_value||\':\'||is_called from synthetic_test.reached_write'),'1:true');assert.equal(snapshot(),before);locksFree(r);
      }finally{db.sql('update synthetic_test.settings set pause_write=false');}
    });
    await t.test('ordinary completion plus unknown consent/unavailable copies is partial; rate work ignores exceptional launch',async()=>{
      seed();seed('unknown');
      db.sql("insert into public.signup_rate_events(ip_hash,created_at) values('idle-old',now()-interval '2 days')");
      const r=await processLaunchRetention({client,limit:100});assert.equal(r.state,'partial');
      assert.ok(r.counts.raw.completed>0);assert.ok(r.counts.raw.review>0);assert.equal(r.rateEvents.completed,1);
      assert.ok(r.reasons.includes('copies_unavailable'));assert.equal(Object.hasOwn(r,'allCopiesDeleted'),false);
      assert.doesNotMatch(JSON.stringify(r),/@|provider|approval|scopeHash|handoff/);
    });
    await t.test('real R positive-write review is partial through the same processor and consumed authority is not recounted',async()=>{
      db.sql(`create or replace function private.launch_retention_field_context_v1(p_item_id uuid,p_generation bigint)
        returns jsonb language sql stable security invoker set search_path=pg_catalog as $fields$
        select jsonb_build_object('launch_retention_delivery.provider_ref',jsonb_build_object('state','verified','evidenceRef','synthetic-field',
          'generation',i.generation::text,'epoch',i.fence_epoch::text,'purposes','[]'::jsonb,
          'scope',jsonb_build_object('state','verified','projectRef',c.project_ref,'sourceCommit',c.source_commit,
            'schemaIdentity',private.launch_import_schema_v1(),'keyGeneration',i.key_generation,'scopeHash',i.scope_hash)))
          from private.launch_retention_items i cross join private.launch_list_control c where i.item_id=p_item_id and i.generation=p_generation;
        $fields$;update private.launch_write_fence_contract set definition_hash=private.launch_write_fence_fingerprint_v1()`);
      const id=randomUUID(),signup=randomUUID(),token=randomUUID(),approval=`synthetic-r-${randomUUID()}`;
      db.sql(`insert into private.launch_retention_items(item_id,launch_match,key_generation,generation,fence_epoch,state,policy_version,reason_code,evidence_ref,scope_hash,withdrawn_at,decided_at)
        values('${id}','${'d'.repeat(64)}','1',1,0,'receipt',1,'eligible','synthetic-evidence','${'c'.repeat(64)}','2026-10-18',clock_timestamp());
        insert into private.launch_retention_delivery(item_id,signup_id,handoff_token,generation,fence_epoch,handoff_at,outcome,settled_at,provider_ref)
        values('${id}','${signup}','${token}',1,0,'2026-09-01','sent','2026-09-02','synthetic-provider');
        update private.launch_retention_items set generation=generation+1,scope_hash=private.launch_retention_retirement_scope_v1('${id}') where item_id='${id}';
        insert into private.launch_import_authorizations(approval_ref,project_ref,source_commit,schema_identity,expected_scope,fence_epoch,writer_ids,
          control_evidence,test_evidence,settlement_evidence,verified_at,expires_at,operation,retention_key_generation)
        select '${approval}','${project}','${source}',private.launch_import_schema_v1(),scope_hash,0,array['synthetic-writer'],
          'synthetic-control','synthetic-test','synthetic-settlement',clock_timestamp()-interval '1 second',clock_timestamp()+interval '1 hour','retention_receipt','1'
          from private.launch_retention_items where item_id='${id}'`);
      const first=await processLaunchRetention({client});assert.equal(first.state,'partial');assert.ok(first.counts.receipt.review>=1);assert.equal(first.counts.receipt.completed,0);
      assert.equal(db.sql(`select provider_ref is null from private.launch_retention_delivery where item_id='${id}'`),'t');
      assert.equal(db.sql(`select consumed_at is not null and result_receipt->>'outcome'='review' and (result_receipt->>'writes')::int>0
        from private.launch_import_authorizations where approval_ref='${approval}'`),'t');
      const after=snapshot(),again=await processLaunchRetention({client});assert.equal(again.state,'partial');assert.equal(again.counts.receipt.completed,0);assert.equal(snapshot(),after);
    });
    await t.test('I1 unchanged blocked prefix cannot hide usable authority beyond the hundredth row',async()=>{
      db.sql(`insert into private.launch_retention_items(item_id,launch_match,key_generation,generation,fence_epoch,state,policy_version,reason_code,evidence_ref,scope_hash,withdrawn_at,decided_at)
        select gen_random_uuid(),repeat(md5('blocked-prefix-'||n),2),'1',1,0,'marker',1,'unavailable','synthetic-blocked','${'c'.repeat(64)}','2026-10-18','1990-01-01'
        from generate_series(1,100) n`);
      const blocked=()=>db.sql("select jsonb_agg(to_jsonb(i) order by item_id) from private.launch_retention_items i where evidence_ref='synthetic-blocked'");
      const before=blocked();
      for(let invocation=0;invocation<2;invocation++){
        const eligible=seed();
        const inventory=await client.inventory({limit:100});
        assert.equal(inventory.items.length,100);assert.equal(inventory.hasMore,true);
        assert.ok(inventory.items.some(i=>i.itemId===eligible.itemId&&i.reason==='eligible'),'a usable authority beyond 100 unchanged blocked rows must be selected');
        assert.ok(inventory.items.some(i=>i.approvalRef===null&&i.reason==='unavailable'),'blocked work remains visible for review');
        const receipt=await processLaunchRetention({client,limit:100});
        assert.equal(receipt.state,'partial');assert.ok(receipt.counts.raw.completed>0);
        assert.ok(Object.values(receipt.counts).reduce((sum,c)=>sum+c.visited,0)<=100);
        assert.equal(db.sql(`select state||':'||(source_signup_id is null) from private.launch_retention_items where item_id='${eligible.itemId}'`),'marker:true','a disabled unsent source is removed without inventing a handoff receipt');
        assert.equal(blocked(),before,'progress cannot mutate, authorize or dismiss blocked work');
      }
      const beforeRead=snapshot();
      assert.equal(JSON.parse(db.sql('begin read only;set local role service_role;select public.inventory_launch_retention_v1(100);commit')).state,'ready');
      assert.equal(snapshot(),beforeRead);
    });
    await t.test('fingerprint covers new processing facade definitions/ACLs and no new global defaults',()=>{
      assert.equal(db.sql(`begin;revoke execute on function public.sweep_launch_rate_events_v1(integer) from service_role;
        select private.launch_write_fence_ready_v1();rollback`),'f');
      assert.equal(db.sql('select private.launch_write_fence_ready_v1()'),'t');assert.equal(db.sql('show statement_timeout'),'0');
      const definition=db.sql("select pg_get_functiondef('private.inventory_launch_retention_v1(integer)'::regprocedure)");
      const altered=definition.replace('p_limit>100','p_limit>99');assert.notEqual(altered,definition);
      assert.equal(db.sql(`begin;${altered};select private.launch_write_fence_ready_v1();
        set local role service_role;select public.inventory_launch_retention_v1(1)->>'state';rollback`),'f\nunavailable','Q body drift must fail the existing owner-installed fingerprint');
      assert.equal(db.sql('select private.launch_write_fence_ready_v1()'),'t');
    });
    await t.test('active launch and both platform beta rows remain byte-equivalent; SQL bounds fail closed',async()=>{
      assert.equal(preserved(),beforePreserved);
      const inv=await client.inventory({limit:1});assert.equal(inv.items.length,1);assert.equal(inv.hasMore,true);
      for(const limit of ['null','0','101']){
        assert.equal(JSON.parse(call(`select public.inventory_launch_retention_v1(${limit})`)).state,'unavailable');
        assert.equal(JSON.parse(call(`select public.sweep_launch_rate_events_v1(${limit})`)).completed,0);
      }
    });
  }finally{fixture.cleanup();}
});

// Separate owned fixtures distinguish uncovered raw work from a genuinely empty
// local ledger AFTER the accepted R operation. No production copy proof is seeded.
async function installProcessingFixture(t,fixture){
  await fixture.start();const db=fixture.db;
  db.sql('create role anon;create role authenticated;create role service_role bypassrls;grant usage on schema public to anon,authenticated,service_role');
  db.sql(read('waitlist.sql'));db.sql('grant all on public.waitlist to service_role');
  const names=['20261011050938_add_signup_intents.sql','20261013112838_launch_list_lifecycle.sql','20261013125523_launch_list_canonical_cutover.sql',
    '20261018141524_launch_list_retention_state.sql','20261018150520_launch_list_retention_disposition.sql',
    '20261018170026_launch_list_retention_retirement.sql','20261018184435_launch_list_retention_processing.sql',
    '20261018215239_launch_list_retention_selection.sql'];
  for(const name of names)db.sql(read(`migrations/${name}`));
  t.diagnostic(`Actual separate I2 fixture: waitlist.sql + ${names.join(', ')}`);
  db.sql(`update private.launch_list_control set project_ref='${project}',source_commit='${source}',mode='canonical'`);
}
test('I2 empty ledger with unenrolled withdrawn unknown-consent raw work remains unavailable, rate-only progress partial',async t=>{
  const fixture=createOwnedLaunchRetentionFixture(),db=fixture.db,client=createLaunchRetentionClient({transport:fixture.transport});
  try{
    await installProcessingFixture(t,fixture);
    db.sql(`insert into public.signup_requests(email,intent,platform,source,registration_origin,consent_status,consent_version,withdrawn_at,delivery_state)
      values('unenrolled@test.invalid','launch','unspecified','direct','legacy_api','unknown',null,'2026-10-18','review')`);
    assert.equal(db.sql('select count(*) from private.launch_retention_items'),'0');
    const inv=await client.inventory({limit:1});assert.equal(inv.items.length,0);
    assert.ok(inv.reasons.includes('coverage_unavailable'));assert.ok(inv.reasons.includes('copies_unavailable'));
    assert.equal((await processLaunchRetention({client})).state,'unavailable');
    db.sql("insert into public.signup_rate_events(ip_hash,created_at) values('old',now()-interval '2 days')");
    const r=await processLaunchRetention({client});assert.equal(r.state,'partial');assert.equal(r.rateEvents.completed,1);
    assert.ok(r.reasons.includes('coverage_unavailable'));assert.ok(r.reasons.includes('copies_unavailable'));
    assert.equal(db.sql("select consent_status||':'||delivery_state from public.signup_requests where email='unenrolled@test.invalid'"),'unknown:review');
  }finally{fixture.cleanup();}
});
test('I2 accepted R removes the final local marker but unavailable coverage/copy follow-up survives empty ledger and rate purge',async t=>{
  const fixture=createOwnedLaunchRetentionFixture(),db=fixture.db,client=createLaunchRetentionClient({transport:fixture.transport});
  try{
    await installProcessingFixture(t,fixture);
    // OWNER-ONLY SYNTHETIC ended LOCAL marker proofs. No provider/copy/coverage
    // binding, old signup erasure, authority issuer or production fact is supplied.
    db.sql(`update private.launch_list_control set mode='fenced';
      create or replace function private.launch_retention_context_v1(p_item_id uuid,p_generation bigint)
      returns jsonb language plpgsql stable security invoker set search_path=pg_catalog as $facts$
      declare i private.launch_retention_items;c private.launch_list_control;p jsonb;scope jsonb;f jsonb;fields jsonb:='{}';n text;begin
        select * into i from private.launch_retention_items where item_id=p_item_id and generation=p_generation;
        if not found then return '{"state":"unavailable"}';end if;select * into c from private.launch_list_control;
        scope:=jsonb_build_object('state','verified','projectRef',c.project_ref,'sourceCommit',c.source_commit,
          'schemaIdentity',private.launch_import_schema_v1(),'keyGeneration',i.key_generation,'scopeHash',i.scope_hash);
        p:=jsonb_build_object('state','verified','evidenceRef','synthetic-local-end','generation',i.generation::text,'epoch',i.fence_epoch::text,'scope',scope,'purposes','[]'::jsonb);
        f:=jsonb_build_object('lane',i.state,'intent','launch','consent','unknown','completed',false,'generation',i.generation::text,'epoch',i.fence_epoch::text,'scope',scope);
        foreach n in array array['withdrawal','necessity','references','hold','delivery','link','suppression','restore'] loop f:=jsonb_set(f,array[n],p);end loop;
        f:=jsonb_set(f,'{withdrawal}',p||jsonb_build_object('status','withdrawn','at',to_char(i.withdrawn_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')));
        f:=jsonb_set(f,'{delivery}',p||'{"outcome":"none","compactCovered":true}');f:=jsonb_set(f,'{link}',p||'{"covered":true}');
        f:=jsonb_set(f,'{suppression}',p||'{"covered":true,"liveKeyGenerations":[]}');f:=jsonb_set(f,'{restore}',p||'{"independent":true,"current":true}');
        for n in select key from jsonb_each(to_jsonb(i)-'minimized_fields') where value<>'null'::jsonb loop
          fields:=fields||jsonb_build_object('launch_retention_items.'||n,p);end loop;
        return f||jsonb_build_object('fieldPurposes',fields);end $facts$;
      update private.launch_write_fence_contract set definition_hash=private.launch_write_fence_fingerprint_v1()`);
    const id=randomUUID(),approval=`synthetic-end-${randomUUID()}`;
    db.sql(`insert into private.launch_retention_items(item_id,launch_match,key_generation,generation,fence_epoch,state,policy_version,reason_code,evidence_ref,scope_hash,withdrawn_at,decided_at)
      values('${id}','${'d'.repeat(64)}','1',1,0,'marker',1,'eligible','synthetic-evidence','${'c'.repeat(64)}','2026-10-18','2026-10-18');
      update private.launch_retention_items set generation=generation+1,scope_hash=private.launch_retention_retirement_scope_v1('${id}') where item_id='${id}';
      insert into private.launch_import_authorizations(approval_ref,project_ref,source_commit,schema_identity,expected_scope,fence_epoch,writer_ids,
        control_evidence,test_evidence,settlement_evidence,verified_at,expires_at,operation,retention_key_generation)
      select '${approval}','${project}','${source}',private.launch_import_schema_v1(),scope_hash,0,array['synthetic-writer'],
        'synthetic-control','synthetic-test','synthetic-settlement',clock_timestamp()-interval '1 second',clock_timestamp()+interval '1 hour','retention_marker','1'
        from private.launch_retention_items where item_id='${id}'`);
    const scope=db.sql(`select scope_hash from private.launch_retention_items where item_id='${id}'`);
    const out=await client.apply({itemId:id,generation:'2',epoch:'0',scope,approvalRef:approval,lane:'marker'});
    assert.equal(out.outcome,'retired');assert.ok(out.writes>0);
    assert.equal(db.sql('select count(*) from private.launch_retention_items'),'0');
    assert.equal(db.sql('select count(*) from public.signup_requests'),'0');
    const inv=await client.inventory({limit:1});assert.equal(inv.items.length,0);
    assert.ok(inv.reasons.includes('coverage_unavailable'));assert.ok(inv.reasons.includes('copies_unavailable'));
    assert.equal((await processLaunchRetention({client})).state,'unavailable');
    db.sql("insert into public.signup_rate_events(ip_hash,created_at) values('old',now()-interval '2 days')");
    const r=await processLaunchRetention({client});assert.equal(r.state,'partial');assert.equal(r.rateEvents.completed,1);
    assert.ok(r.reasons.includes('coverage_unavailable'));assert.ok(r.reasons.includes('copies_unavailable'));
  }finally{fixture.cleanup();}
});
