import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID,createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {launchDataApi} from './helpers/launch-dataapi.mjs';
import {createLaunchRetentionClient} from '../lib/launch-retention-client.mjs';
import {processLaunchRetention,runReceipt} from '../lib/process-launch-retention.mjs';
import {launchPostgres} from './helpers/launch-postgres.mjs';
import {launchMatch} from '../lib/launch-list.mjs';
import {consolidationReceipt} from '../lib/consolidate-launch-list.mjs';
const migrations=['20261011050938_add_signup_intents.sql','20261013112838_launch_list_lifecycle.sql',
  '20261013125523_launch_list_canonical_cutover.sql','20261018141524_launch_list_retention_state.sql',
  '20261018150520_launch_list_retention_disposition.sql','20261018170026_launch_list_retention_retirement.sql',
  '20261018184435_launch_list_retention_processing.sql'];
const read=n=>readFileSync(new URL(`../supabase/${n}`,import.meta.url),'utf8');
const project='yohiumlrpfdhphsnnxxw',source='a'.repeat(40),key='synthetic-http-only-key';
const quote=v=>v===null?'null':`'${String(v).replaceAll("'","''")}'`;
const hash=v=>createHash('sha256').update(v).digest('hex');
async function raw(api,rpc,args,role='service'){
  const r=await fetch(`${api.url}/rpc/${rpc}`,{method:'POST',headers:api.headers[role],body:JSON.stringify(args)});
  return {status:r.status,body:await r.json()};
}
async function rpc(api,name,args){const r=await raw(api,name,args);assert.equal(r.status,200,JSON.stringify(r.body));return r.body;}
async function install(api,t){
  await api.start();api.sql(read('waitlist.sql'));api.sql('grant all on public.waitlist to service_role');
  for(const n of migrations)api.sql(read(`migrations/${n}`));await api.reload();
  t.diagnostic(`Actual full HTTP fixture ${api.names.postgrest}: waitlist.sql + ${migrations.join(', ')}; PostgREST14.13 / PostgreSQL17.6.1.134`);
}
const tupleArgs=i=>({p_item_id:i.itemId,p_generation:i.generation,p_epoch:i.epoch,p_scope:i.scope,p_approval_ref:i.approvalRef});
function approve(db,item,operation){
  db.sql(`insert into private.launch_import_authorizations(approval_ref,project_ref,source_commit,schema_identity,expected_scope,fence_epoch,writer_ids,
    control_evidence,test_evidence,settlement_evidence,verified_at,expires_at,operation,retention_key_generation)
    values('${item.approvalRef}','${project}','${source}',private.launch_import_schema_v1(),'${item.scope}',${item.epoch},array['synthetic-writer'],
    'synthetic-control','synthetic-test','synthetic-settlement',clock_timestamp()-interval '1 second',clock_timestamp()+interval '1 hour','${operation}','1')`);
}
function bindFacts(db){
  // Owner-only SYNTHETIC proofs, never exposed as a caller assertion or issuer.
  db.sql(`create schema synthetic_test;revoke all on schema synthetic_test from public,anon,authenticated,service_role;
    create sequence synthetic_test.proof_calls;create sequence synthetic_test.reached_write;
    create table synthetic_test.settings(pause_seconds float8,pause_write boolean);insert into synthetic_test.settings values(0,false);
    create function synthetic_test.pause_after_delete() returns trigger language plpgsql as $pause$
      begin if (select pause_write from synthetic_test.settings) then perform nextval('synthetic_test.reached_write');perform pg_sleep(6);end if;return old;end $pause$;
    create trigger synthetic_http_write after delete on public.signup_requests for each row execute function synthetic_test.pause_after_delete();
    ${db.sql("select replace(pg_get_functiondef('private.launch_retention_context_v1(uuid,bigint)'::regprocedure),'private.launch_retention_context_v1','synthetic_test.base_context')")};
    create or replace function private.launch_retention_context_v1(p_item_id uuid,p_generation bigint)
    returns jsonb language plpgsql volatile security invoker set search_path=pg_catalog as $facts$
    declare f jsonb;p jsonb;n text;begin
      if current_setting('statement_timeout')<>'5s' then raise exception 'synthetic startup timer absent';end if;
      perform nextval('synthetic_test.proof_calls');perform pg_sleep((select pause_seconds from synthetic_test.settings));
      f:=synthetic_test.base_context(p_item_id,p_generation);if f->>'state'='unavailable' then return f;end if;p:=(f->'withdrawal')-array['status','at'];
      foreach n in array array['necessity','references','hold','delivery','link','suppression','restore'] loop
        f:=jsonb_set(f,array[n],p||jsonb_build_object('purposes',case n when 'suppression' then '["current_intake"]'::jsonb
          when 'link' then '["usable_link"]'::jsonb else '[]'::jsonb end));end loop;
      f:=jsonb_set(f,'{delivery}',f->'delivery'||'{"outcome":"unknown","compactCovered":true}');
      f:=jsonb_set(f,'{link}',f->'link'||'{"covered":true}');f:=jsonb_set(f,'{suppression}',f->'suppression'||'{"covered":true}');
      return jsonb_set(f,'{restore}',f->'restore'||'{"independent":true,"current":true}');end $facts$;
    update private.launch_write_fence_contract set definition_hash=private.launch_write_fence_fingerprint_v1();
    update private.launch_import_authorizations set schema_identity=private.launch_import_schema_v1() where consumed_at is null`);
}
test('real owned PostgREST HTTP retention integration on all seven accepted migrations',async t=>{
  const api=launchDataApi();
  const client=createLaunchRetentionClient({transport:api.transport});
  const snapshot=()=>api.sql(`select jsonb_build_array(
    (select jsonb_agg(to_jsonb(s) order by id) from public.signup_requests s),
    (select jsonb_agg(to_jsonb(i) order by item_id) from private.launch_retention_items i),
    (select jsonb_agg(to_jsonb(d) order by signup_id,handoff_token) from private.launch_retention_delivery d),
    (select jsonb_agg(to_jsonb(a) order by approval_ref) from private.launch_import_authorizations a),
    (select jsonb_agg(to_jsonb(w) order by token_hash) from private.launch_withdrawal_receipts w),
    (select jsonb_agg(to_jsonb(s) order by launch_match) from private.launch_suppressions s))`);
  const claim=email=>rpc(api,'claim_launch_signup_v2',{p_email:email,p_source:'direct',p_ip_hash:hash(randomUUID()),p_consent_version:'2026-10-11-v1',p_consent_status:'recorded',p_launch_match:launchMatch(email,key)});
  const finish=(r,state,provider=null,token=r.token)=>rpc(api,'finish_launch_delivery_v1',{p_id:r.id,p_token:token,p_state:state,p_provider_id:provider});
  const seed=async(email)=>{
    const r=await claim(email),link=hash(randomUUID());assert.equal(r.send,true);
    assert.equal(await rpc(api,'pin_launch_payload_v1',{p_id:r.id,p_token:r.token,p_payload_hash:'d'.repeat(64)}),true);
    assert.equal(await rpc(api,'authorize_launch_delivery_v1',{p_id:r.id,p_token:r.token,p_fence_epoch:r.fenceEpoch,p_unsubscribe_hash:link}),true);
    assert.equal((await rpc(api,'withdraw_launch_v1',{p_token_hash:link})).outcome,'withdrawn');
    const itemId=randomUUID(),approvalRef=`synthetic-${randomUUID()}`;
    api.sql(`insert into private.launch_retention_items(item_id,source_signup_id,launch_match,key_generation,generation,fence_epoch,state,policy_version,reason_code,evidence_ref,scope_hash,withdrawn_at,decided_at)
      select '${itemId}',id,launch_match,'1',9007199254740992,0,'raw',1,'eligible','synthetic-evidence','${'c'.repeat(64)}',withdrawn_at,'2000-01-01' from public.signup_requests where id='${r.id}';
      update private.launch_retention_items set generation=generation+1,scope_hash=private.launch_retention_scope_v1('${itemId}') where item_id='${itemId}'`);
    const item={itemId,generation:'9007199254740993',epoch:'0',scope:api.sql(`select scope_hash from private.launch_retention_items where item_id='${itemId}'`),approvalRef,lane:'raw'};
    approve(api,item,'retention_raw');return {...r,link,item,email};
  };
  const locksFree=r=>assert.equal(api.sql(`begin;set lock_timeout='300ms';select pg_try_advisory_xact_lock(hashtextextended('launch-list-fence',0));
    select count(*) from (select 1 from private.launch_retention_items where item_id='${r.item.itemId}' for update) q;
    select count(*) from (select 1 from private.launch_import_authorizations where approval_ref='${r.item.approvalRef}' for update) q;rollback`),'t\n1\n1');
  try{
    await install(api,t);
    const response=await fetch(`${api.url}/rpc/inventory_launch_retention_v1`,{method:'POST',headers:api.headers.service,body:'{"p_limit":1}'});
    assert.equal(response.status,200);
    const expected={state:'disabled',items:[],hasMore:false,reasons:['coverage_unavailable','copies_unavailable']};
    assert.deepEqual(await response.json(),expected,'raw real HTTP baseline works before protected-client integration');
    const actual=await client.inventory({limit:1}).catch(error=>error.message);
    assert.deepEqual(actual,expected,'owned protected HTTP supplier must deliver the real API receipt through the production client');
    await t.test('ordinary HTTP roles cannot invoke new maintenance, private tables, authority or proof functions',async()=>{
      for(const role of ['anon','authenticated']){
        for(const name of ['dispose_launch_raw_v1','minimize_launch_receipt_v1','retire_launch_marker_v1'])
          assert.ok([401,403,404].includes((await raw(api,name,api.fixtureCall,role)).status),`${role} ${name}`);
        for(const name of ['inventory_launch_retention_v1','sweep_launch_rate_events_v1'])
          assert.ok([401,403,404].includes((await raw(api,name,{p_limit:1},role)).status));
        for(const table of ['launch_retention_items','launch_import_authorizations','launch_withdrawal_receipts']){
          const r=await fetch(`${api.url}/${table}`,{headers:{...api.headers[role],'Accept-Profile':'private'}});
          assert.ok([401,403,404,406].includes(r.status));await r.body?.cancel();
        }
        assert.ok([401,403,404].includes((await raw(api,'launch_retention_context_v1',{p_item_id:randomUUID(),p_generation:'1'},role)).status));
      }
      for(const table of ['launch_retention_items','launch_retention_delivery','launch_import_authorizations']){
        assert.equal(api.sql(`select relrowsecurity from pg_class where oid='private.${table}'::regclass`),'t');
        for(const role of ['anon','authenticated'])assert.equal(api.sql(`select has_table_privilege('${role}','private.${table}','select,insert,update,delete')`),'f');
      }
      assert.throws(()=>api.sql('set role service_role;delete from private.launch_retention_items'),/permission denied/);
      assert.throws(()=>api.sql("set role service_role;update private.launch_write_fence_contract set definition_hash='bad'"),/permission denied/);
      const result=await processLaunchRetention({client});assert.equal(result.state,'disabled');assert.ok(result.reasons.includes('copies_unavailable'));
      await assert.rejects(createLaunchRetentionClient().inventory(),{message:'Launch retention unavailable.'});
    });
    api.sql(`update private.launch_list_control set project_ref='${project}',source_commit='${source}',mode='canonical'`);
    const active=await claim('active-http@test.invalid');
    for(const platform of ['ios','android']){
      const r=await rpc(api,'claim_signup_v1',{p_email:'shared-http@test.invalid',p_intent:'beta',p_platform:platform,p_source:'direct',p_ip_hash:hash(randomUUID())});
      assert.equal(await rpc(api,'finish_signup_delivery_v1',{p_id:r.id,p_token:r.token,p_state:'sent',p_provider_id:'synthetic-beta'}),true);
    }
    const preserved=()=>api.sql(`select jsonb_agg(to_jsonb(s) order by id) from public.signup_requests s where intent='beta' or id='${active.id}'`),beforePreserved=preserved();
    const r=await seed('compact-http@test.invalid');Object.assign(api.fixtureCall,tupleArgs(r.item));
    await t.test('unbound owning facts remain review, exact string bigint inventory has null age and independent uncertainty',async()=>{
      const before=snapshot(),inventory=await client.inventory({limit:1});
      assert.equal(inventory.items[0].generation,'9007199254740993');assert.equal(inventory.items[0].ageSeconds,null);
      assert.deepEqual(inventory.reasons,['coverage_unavailable','copies_unavailable']);
      assert.equal((await client.apply(r.item)).outcome,'review');assert.equal(snapshot(),before);
    });
    bindFacts(api);
    await t.test('malformed/null/stale HTTP tuples cannot consume authority or write',async()=>{
      const before=snapshot();
      for(const patch of [{p_generation:'9007199254740992'},{p_epoch:'1'},{p_scope:'f'.repeat(64)},{p_approval_ref:'synthetic-other'},
        ...Object.keys(api.fixtureCall).map(k=>({[k]:null}))]){
        const out=await rpc(api,'dispose_launch_raw_v1',{...api.fixtureCall,...patch});assert.equal(out.outcome,'refused');assert.equal(out.writes,0);
      }
      const malformed=await raw(api,'dispose_launch_raw_v1',{...api.fixtureCall,p_generation:'synthetic-private-invalid-bigint'});
      assert.equal(malformed.status,400);assert.equal(malformed.body.code,'22P02');
      assert.match(malformed.body.message,/synthetic-private-invalid-bigint/,'raw type conversion boundary is NOT silently sanitized by SQL');
      assert.equal(snapshot(),before);
    });
    await t.test('service HTTP disposal returns exact advanced bigint; replay and repeated withdrawal preserve no-resend',async()=>{
      const out=await client.apply(r.item);assert.equal(out.outcome,'disposed');assert.equal(out.generation,'9007199254740994');assert.ok(out.writes>0);
      assert.equal(api.sql(`select count(*) from public.signup_requests where id='${r.id}'`),'0');
      const after=snapshot();assert.equal((await client.apply(r.item)).outcome,'already_disposed');assert.equal(snapshot(),after);
      assert.equal((await rpc(api,'withdraw_launch_v1',{p_token_hash:r.link})).outcome,'already_withdrawn');
      assert.equal((await claim(r.email)).suppressed,true);assert.equal(preserved(),beforePreserved);
    });
    await t.test('old four-argument Boolean finish handles compact pending/terminal, rejects incompatible terminal/token/provider',async()=>{
      assert.equal(await finish(r,'pending'),true);assert.equal(api.sql('select private.launch_delivery_data_ready_v1()'),'f');
      assert.equal(await finish(r,'sent','synthetic-late-provider'),true);const before=snapshot();
      assert.equal(await finish(r,'sent','synthetic-late-provider'),true);
      assert.equal(await finish(r,'failed'),false);assert.equal(await finish(r,'pending'),false);
      assert.equal(await finish(r,'sent','different-provider'),false);assert.equal(await finish(r,'sent','synthetic-late-provider',randomUUID()),false);
      assert.equal(snapshot(),before);assert.equal((await claim(r.email)).suppressed,true);
    });
    for(const mode of ['proof','write'])await t.test(`actual HTTP startup timer cancels slow ${mode}, rolls back and releases owning locks`,async()=>{
      const work=await seed(`${mode}-timeout@test.invalid`),before=snapshot();
      const proofCalls=BigInt(api.sql('select last_value from synthetic_test.proof_calls'));
      api.sql(`update synthetic_test.settings set pause_seconds=${mode==='proof'?6:0},pause_write=${mode==='write'}`);
      try{
        const start=performance.now(),out=await client.apply(work.item),elapsed=performance.now()-start;
        assert.equal(out.writes,0);assert.equal(out.reason,'unavailable');assert.ok(elapsed>=4500&&elapsed<10000,`${elapsed}ms actual command cancellation`);
        if(mode==='write')assert.equal(api.sql("select last_value||':'||is_called from synthetic_test.reached_write"),'1:true');
        assert.equal(BigInt(api.sql('select last_value from synthetic_test.proof_calls')),proofCalls+1n,'real protected proof entered on this executing connection');
        assert.equal(snapshot(),before);locksFree(work);t.diagnostic(`HTTP ${mode} cancellation elapsed=${Math.round(elapsed)}ms; reached owning D operation`);
      }finally{api.sql('update synthetic_test.settings set pause_seconds=0,pause_write=false');}
    });
    await t.test('outside-body raw API exception is visible; private client and RunReceipt sanitize it',async()=>{
      api.sql("update synthetic_http.fault set mode='error'");
      try{
        const out=await raw(api,'inventory_launch_retention_v1',{p_limit:1});assert.equal(out.status,400);
        assert.equal(out.body.message,'synthetic-private-backend-marker');assert.equal(out.body.details,'synthetic-private-detail');
        await assert.rejects(client.inventory(),{message:'Launch retention unavailable.'});
        const receipt=runReceipt(await processLaunchRetention({client}));assert.equal(receipt.state,'unavailable');
        assert.doesNotMatch(JSON.stringify(receipt),/synthetic-private|P0001|detail|backend|@/);
        t.diagnostic(`Raw outside-body HTTP ${out.status}/${out.body.code} includes synthetic message/detail; private boundary rejects allowlisted output only`);
      }finally{api.sql("update synthetic_http.fault set mode='none'");}
    });
    await t.test('outside-body actual statement cancellation is a raw HTTP error and private sanitized failure',async()=>{
      api.sql("update synthetic_http.fault set mode='sleep'");
      try{
        const start=performance.now(),out=await raw(api,'inventory_launch_retention_v1',{p_limit:1});
        assert.equal(out.body.code,'57014');assert.ok(out.status>=400);assert.ok(performance.now()-start>=4500);
        await assert.rejects(client.inventory(),{message:'Launch retention unavailable.'});
        t.diagnostic(`Raw outside-body cancellation HTTP ${out.status}/${out.body.code}; startup timer exercised before retention body`);
      }finally{api.sql("update synthetic_http.fault set mode='none'");}
    });
    await t.test('actual executing-connection loss rolls back; raw response and private sanitized failure are distinct',async()=>{
      const work=await seed('connection-loss@test.invalid');
      const terminate=async()=>{
        let pid;
        for(let n=0;n<100;n++){
          pid=api.sql(`select pid from pg_stat_activity where application_name='${api.names.postgrest}' and wait_event='PgSleep' and query like '%dispose_launch_raw_v1%'`);
          if(pid)break;await new Promise(resolve=>setTimeout(resolve,20));
        }
        assert.match(pid,/^[0-9]+$/,'observe this exact owned RPC executing before connection termination');
        assert.equal(api.sql(`select pg_terminate_backend(${pid})`),'t');
      };
      api.sql('update synthetic_test.settings set pause_seconds=6');
      try{
        const before=snapshot();const pending=raw(api,'dispose_launch_raw_v1',tupleArgs(work.item));await terminate();const observed=await pending;
        assert.ok(observed.status>=400);assert.equal(observed.body.code,'PGRST001');
        const safe=client.apply(work.item).catch(error=>error.message);await terminate();assert.equal(await safe,'Launch retention unavailable.');
        assert.equal(snapshot(),before);locksFree(work);t.diagnostic(`Raw killed-connection HTTP ${observed.status}/${observed.body.code}; client fixed diagnostic only`);
      }finally{api.sql('update synthetic_test.settings set pause_seconds=0');}
    });
    await t.test('actual R positive-write review is partial; retired provider comparison returns false without refill/resend',async()=>{
      api.sql(`create or replace function private.launch_retention_field_context_v1(p_item_id uuid,p_generation bigint)
        returns jsonb language sql stable security invoker set search_path=pg_catalog as $fields$
        select jsonb_build_object('launch_retention_delivery.provider_ref',jsonb_build_object('state','verified','evidenceRef','synthetic-field',
          'generation',i.generation::text,'epoch',i.fence_epoch::text,'purposes','[]'::jsonb,
          'scope',jsonb_build_object('state','verified','projectRef',c.project_ref,'sourceCommit',c.source_commit,
            'schemaIdentity',private.launch_import_schema_v1(),'keyGeneration',i.key_generation,'scopeHash',i.scope_hash)))
          from private.launch_retention_items i cross join private.launch_list_control c where i.item_id=p_item_id and i.generation=p_generation;
        $fields$;update private.launch_write_fence_contract set definition_hash=private.launch_write_fence_fingerprint_v1();
        update private.launch_retention_items set generation=generation+1,scope_hash=private.launch_retention_retirement_scope_v1('${r.item.itemId}') where item_id='${r.item.itemId}'`);
      const item={...r.item,lane:'receipt',generation:api.sql(`select generation::text from private.launch_retention_items where item_id='${r.item.itemId}'`),
        scope:api.sql(`select scope_hash from private.launch_retention_items where item_id='${r.item.itemId}'`),approvalRef:`synthetic-r-${randomUUID()}`};
      approve(api,item,'retention_receipt');
      const out=await processLaunchRetention({client});assert.equal(out.state,'partial');assert.ok(out.counts.receipt.review>=1);assert.equal(out.counts.receipt.completed,0);
      const result=JSON.parse(api.sql(`select result_receipt from private.launch_import_authorizations where approval_ref='${item.approvalRef}'`));
      assert.equal(result.outcome,'review');assert.ok(result.writes>0);assert.equal(result.generation,'9007199254740996');
      assert.equal(api.sql(`select provider_ref is null and 'provider_ref'=any(minimized_fields) from private.launch_retention_delivery where item_id='${item.itemId}'`),'t');
      const before=snapshot();assert.equal(await finish(r,'sent','synthetic-late-provider'),false);assert.equal(snapshot(),before);
      assert.equal((await client.apply(item)).writes,0);assert.equal((await claim(r.email)).suppressed,true);
      assert.ok(out.reasons.includes('coverage_unavailable'));assert.ok(out.reasons.includes('copies_unavailable'));assert.equal(out.oldestEligibleAgeSeconds,null);
    });
    await t.test('idle rate-only cleanup is bounded partial and preserves recent abuse window, active launch and both beta platforms',async()=>{
      api.sql("insert into public.signup_rate_events(ip_hash,created_at) select 'synthetic-old',now()-interval '2 days' from generate_series(1,3)");
      const sweep=await client.sweepRateEvents({limit:2});assert.deepEqual(sweep,{state:'processed',visited:2,completed:2,remaining:true});
      const out=await processLaunchRetention({client,limit:1});assert.equal(out.state,'partial');assert.equal(out.rateEvents.completed,1);
      assert.equal(preserved(),beforePreserved);assert.equal(api.sql('show statement_timeout'),'0');
      assert.equal(api.sql("select count(*) from pg_db_role_setting where setconfig::text like '%statement_timeout%'"),'0');
    });
  }finally{await api.cleanup();}
});

test('nonempty old import/mode and independently current complete restore through real HTTP on FULL migrated set',async t=>{
  const api=launchDataApi(),other=launchPostgres();let barrier;
  const inventory=()=>rpc(api,'inventory_launch_legacy_v1',{p_match_key:key});
  const mode=(iv,target='canonical')=>rpc(api,'set_launch_mode_v1',{p_expected_epoch:iv.fenceEpoch,p_mode:target,p_scope:iv.scopeHash,p_match_key:key});
  const legacyApproval=(iv,operation,target=null)=>{
    const ref=`synthetic-${randomUUID()}`;
    api.sql(`insert into private.launch_import_authorizations(approval_ref,project_ref,source_commit,schema_identity,expected_scope,fence_epoch,writer_ids,
      control_evidence,test_evidence,settlement_evidence,verified_at,expires_at,operation,target_mode,restore_snapshot_ref,restore_replay_ref,restore_coverage_ref)
      values('${ref}','${project}','${source}','${iv.schemaIdentity}','${iv.scopeHash}',${iv.fenceEpoch},array['synthetic-writer'],
      'synthetic-control','synthetic-test','synthetic-settlement',clock_timestamp()-interval '1 second',clock_timestamp()+interval '1 hour','${operation}',${quote(target)},
      ${operation==='restore'?"'synthetic-snapshot','synthetic-replay','synthetic-coverage'":'null,null,null'})`);return ref;
  };
  const dump=name=>{
    const r=spawnSync('docker',['--host','unix:///Users/johntawadros/.docker/run/docker.sock','exec',name,'pg_dump','-h','/tmp','-U','postgres','-d','postgres',
      '--data-only','--schema=public','--schema=private','--no-owner','--no-privileges','--exclude-table=private.launch_list_control','--exclude-table=private.launch_write_fence_contract'],
    {encoding:'utf8',timeout:30000,maxBuffer:8*1024*1024});assert.equal(r.status,0,r.stderr);return r.stdout;
  };
  const fence=async()=>{
    other.sql('update synthetic_restore.barrier set released=false');
    barrier=other.asyncSql(`set statement_timeout='45s';set application_name='task6-independent-source';begin;
      select pg_advisory_xact_lock(hashtextextended('launch-list-fence',0));
      do $barrier$ begin while not (select released from synthetic_restore.barrier) loop perform pg_sleep(0.02);end loop;end $barrier$;commit`);
    let observed=false;
    for(let n=0;n<100;n++){
      if(other.sql("select exists(select 1 from pg_stat_activity where application_name='task6-independent-source' and wait_event='PgSleep')")==='t'){observed=true;break;}
      await new Promise(resolve=>setTimeout(resolve,20));
    }
    assert.equal(observed,true);assert.equal(other.sql("select pg_try_advisory_xact_lock(hashtextextended('launch-list-fence',0))"),'f');
  };
  const release=async()=>{if(barrier){other.sql('update synthetic_restore.barrier set released=true');await barrier;barrier=undefined;}};
  const sourceDigest=()=>other.sql('select private.launch_retention_replay_digest_v1(null)');
  const proofFor=(ref,iv)=>{
    const head=JSON.parse(other.sql("select jsonb_build_object('head',head,'watermark',watermark::text,'keys',keys) from synthetic_restore.current_head"));
    return {state:'verified',evidenceRef:'synthetic-other-owned-source',origin:'independent_current',stableBarrierRef:'task6-independent-source',
      approvalRef:ref,operation:'restore',namespace:`launch-retention-v1:${project}`,projectRef:project,sourceCommit:source,schemaIdentity:iv.schemaIdentity,
      fingerprint:api.sql('select private.launch_write_fence_fingerprint_v1()'),scopeHash:iv.scopeHash,epoch:String(iv.fenceEpoch),
      snapshotRef:'synthetic-snapshot',replayRef:'synthetic-replay',coverageRef:'synthetic-coverage',externalHead:head.head,coveredHead:head.head,
      externalWatermark:head.watermark,coveredWatermark:head.watermark,liveKeyGenerations:head.keys,coveredKeyGenerations:head.keys,manifestDigest:sourceDigest()};
  };
  const bind=proof=>api.sql(`delete from synthetic_restore.coverage;insert into synthetic_restore.coverage values(${quote(JSON.stringify(proof))}::jsonb)`);
  try{
    await install(api,t);await other.start();
    other.sql('create role anon;create role authenticated;create role service_role bypassrls;grant usage on schema public to anon,authenticated,service_role');
    other.sql(read('waitlist.sql'));other.sql('grant all on public.waitlist to service_role');
    for(const n of migrations)other.sql(read(`migrations/${n}`));
    t.diagnostic(`Independent network-none source ${other.name}: same waitlist.sql + ALL seven accepted migrations`);
    api.sql(`update private.launch_list_control set project_ref='${project}',source_commit='${source}';
      insert into public.waitlist(email,created_at) values('legacy-http@test.invalid','2026-01-01'),('suppressed-import@test.invalid','2026-01-02');
      insert into private.launch_suppressions values('${launchMatch('suppressed-import@test.invalid',key)}','2026-01-03','legacy-reconciliation');
      insert into public.signup_requests(email,intent,platform,source,consent_version,launch_match,delivery_state)
      values('snapshot-http@test.invalid','launch','unspecified','direct','original','${launchMatch('snapshot-http@test.invalid',key)}','disabled')`);
    for(const platform of ['ios','android']){
      const r=await rpc(api,'claim_signup_v1',{p_email:'beta-restore@test.invalid',p_intent:'beta',p_platform:platform,p_source:'direct',p_ip_hash:hash(randomUUID())});
      assert.equal(await rpc(api,'finish_signup_delivery_v1',{p_id:r.id,p_token:r.token,p_state:'sent',p_provider_id:'synthetic-beta'}),true);
    }
    const beta=()=>api.sql("select jsonb_agg(to_jsonb(s) order by id) from public.signup_requests s where intent='beta'"),beforeBeta=beta();
    await t.test('original nonempty import and mode contracts work unchanged on all migrations; disposalAllowed remains false',async()=>{
      let iv=await inventory();assert.equal(iv.counts.legacy,2);legacyApproval(iv,'mode','fenced');assert.equal((await mode(iv,'fenced')).outcome,'mode_changed');
      iv=await inventory();legacyApproval(iv,'import');
      const out=consolidationReceipt(await rpc(api,'reconcile_launch_legacy_v1',{p_expected_scope:iv.scopeHash,p_match_key:key,p_apply:true}));
      assert.equal(out.outcome,'reconciled');assert.equal(out.equality,true);assert.equal(out.disposalAllowed,false);assert.equal(out.emails,0);
      assert.throws(()=>consolidationReceipt({...out,disposalAllowed:true}),/unavailable/);
      assert.equal(api.sql("select consent_status||':'||delivery_state from public.signup_requests where email='legacy-http@test.invalid'"),'unknown:review');
      assert.equal(api.sql('select count(*) from private.launch_legacy_provenance'),'2');
      iv=await inventory();legacyApproval(iv,'mode','canonical');assert.equal((await mode(iv)).outcome,'mode_changed');assert.equal(beta(),beforeBeta);
    });
    const epoch=api.sql('select fence_epoch::text from private.launch_list_control');
    other.sql(`update private.launch_list_control set project_ref='${project}',source_commit='${source}',mode='canonical',fence_epoch=${epoch}`);
    // The independent source begins at the same older synthetic snapshot, then
    // advances AFTER it. Its actual current state, not target absence, is read.
    other.sql(`begin;set local session_replication_role=replica;${dump(api.names.postgres)}\ncommit;`);
    other.sql(`update private.launch_list_control set fence_epoch=fence_epoch+1;
      create schema synthetic_restore;create table synthetic_restore.barrier(released boolean);insert into synthetic_restore.barrier values(true);
      create table synthetic_restore.current_head(head text,watermark bigint,keys jsonb);
      insert into synthetic_restore.current_head values('${hash('current-source-head')}','9007199254740993','["1","2"]');
      insert into private.launch_suppressions values('${launchMatch('snapshot-http@test.invalid',key)}','2026-10-18','unsubscribe');
      update public.signup_requests set withdrawn_at='2026-10-18' where email='snapshot-http@test.invalid';
      delete from public.signup_requests where email='snapshot-http@test.invalid';
      insert into private.launch_withdrawal_receipts values('${'d'.repeat(64)}','${launchMatch('snapshot-http@test.invalid',key)}','2026-10-18')`);
    const ids=[randomUUID(),randomUUID()],signups=[randomUUID(),randomUUID()],tokens=[randomUUID(),randomUUID()];
    const currentEpoch=other.sql('select fence_epoch::text from private.launch_list_control');
    for(let n=0;n<2;n++)other.sql(`insert into private.launch_suppressions values('${String(n+1).repeat(64)}','2026-10-18','unsubscribe');
      insert into private.launch_retention_items(item_id,launch_match,key_generation,generation,fence_epoch,state,policy_version,reason_code,evidence_ref,scope_hash,withdrawn_at,decided_at)
      values('${ids[n]}','${String(n+1).repeat(64)}','${n+1}',9007199254740993,${currentEpoch},'receipt',1,'eligible','synthetic-evidence','${'c'.repeat(64)}','2026-10-18','2026-10-18');
      insert into private.launch_retention_delivery(item_id,signup_id,handoff_token,generation,fence_epoch,handoff_at,outcome,settled_at,provider_ref)
      values('${ids[n]}','${signups[n]}','${tokens[n]}',9007199254740993,${currentEpoch},'2026-09-01','${n===0?'unknown':'sent'}',${n===0?'null':"'2026-09-02'"},${n===0?'null':"'synthetic-provider'"})`);
    api.sql(`update private.launch_list_control set mode='fenced',restore_required=true,fence_epoch=${currentEpoch}`);
    let iv=await inventory(),ref=legacyApproval(iv,'restore','canonical');
    await t.test('unchanged old restore signature with opaque refs cannot self-certify the snapshot',async()=>{
      assert.equal((await mode(iv)).outcome,'refused');assert.equal(api.sql(`select consumed_at is null from private.launch_import_authorizations where approval_ref='${ref}'`),'t');
      assert.equal(api.sql('select restore_required from private.launch_list_control'),'t');
    });
    api.sql(`delete from private.launch_import_authorizations where approval_ref='${ref}';
      create schema synthetic_restore;revoke all on schema synthetic_restore from public,anon,authenticated,service_role;
      create table synthetic_restore.coverage(proof jsonb);
      create or replace function private.launch_retention_restore_coverage_v1(p_approval_ref text,p_scope text,p_epoch bigint)
      returns jsonb language sql stable security definer set search_path=pg_catalog as $proof$
      select coalesce((select proof from synthetic_restore.coverage limit 1),'{"state":"unavailable"}'::jsonb) $proof$;
      update private.launch_write_fence_contract set definition_hash=private.launch_write_fence_fingerprint_v1()`);
    iv=await inventory();ref=legacyApproval(iv,'restore','canonical');
    await t.test('OTHER current source manifest detects every missing snapshot identity, not matching counts or copied refs',async()=>{
      await fence();try{
        bind(proofFor(ref,iv));assert.equal(api.sql('select count(*) from private.launch_retention_items'),'0');
        assert.equal((await mode(iv)).outcome,'refused');assert.equal(api.sql('select restore_required from private.launch_list_control'),'t');
      }finally{await release();}
    });
    // Test-owner replay only, never a shipped generic importer. Exact complete
    // raw synthetic snapshot data and all safety cohorts are applied together.
    api.sql(`begin;set local session_replication_role=replica;
      delete from private.launch_import_context;delete from private.launch_retention_delivery;delete from private.launch_legacy_provenance;
      delete from private.launch_retention_items;delete from private.launch_withdrawal_receipts;delete from private.launch_suppressions;
      delete from private.launch_import_authorizations;delete from public.waitlist;delete from public.signup_requests;delete from public.signup_rate_events;
      ${dump(other.name)}\ncommit;`);
    iv=await inventory();ref=legacyApproval(iv,'restore','canonical');
    const base=proofFor(ref,iv);
    for(const [name,patch] of [
      ['stale head',{coveredHead:hash('older')}],['stale watermark',{coveredWatermark:'9007199254740992'}],
      ['missing older live key',{coveredKeyGenerations:['2']}],['self-certified source',{origin:'restored_snapshot'}],
      ['tampered full manifest',{manifestDigest:'f'.repeat(64)}],['missing source barrier',{stableBarrierRef:null}],
    ])await t.test(`HTTP restore refuses ${name} without consuming approval`,async()=>{
      bind({...base,...patch});assert.equal((await mode(iv)).outcome,'refused');
      assert.equal(api.sql(`select consumed_at is null from private.launch_import_authorizations where approval_ref='${ref}'`),'t');
    });
    await t.test('complete current coverage and exact applied digest still cannot settle an unknown handoff',async()=>{
      await fence();try{
        bind(proofFor(ref,iv));assert.equal(api.sql(`select private.launch_retention_replay_digest_v1('${ref}')`),sourceDigest());
        assert.equal(api.sql(`set role service_role;select private.launch_retention_restore_ready_v1((select a from private.launch_import_authorizations a where approval_ref='${ref}'),'${iv.scopeHash}',${iv.fenceEpoch})`),'t');
        assert.equal((await mode(iv)).outcome,'refused');
      }finally{await release();}
    });
    assert.equal(other.sql(`set role service_role;select public.finish_launch_delivery_v1('${signups[0]}','${tokens[0]}','failed',null)`),'t');
    const settled=other.sql(`select to_jsonb(d) from private.launch_retention_delivery d where item_id='${ids[0]}'`);
    api.sql(`delete from private.launch_retention_delivery where item_id='${ids[0]}';
      insert into private.launch_retention_delivery select (jsonb_populate_record(null::private.launch_retention_delivery,${quote(settled)}::jsonb)).*;
      delete from private.launch_import_authorizations where approval_ref='${ref}'`);
    other.sql(`update synthetic_restore.current_head set head='${hash('settled-current-head')}',watermark=watermark+1`);
    iv=await inventory();ref=legacyApproval(iv,'restore','canonical');
    await t.test('independent source fence persists through legitimate nonempty HTTP restore activation and rebase',async()=>{
      await fence();try{
        bind(proofFor(ref,iv));assert.equal(api.sql(`select private.launch_retention_replay_digest_v1('${ref}')`),sourceDigest());
        const out=await mode(iv);assert.equal(out.outcome,'mode_changed');assert.equal(out.operation,'restore');assert.equal(out.disposalAllowed,false);
        assert.equal(other.sql("select pg_try_advisory_xact_lock(hashtextextended('launch-list-fence',0))"),'f','OTHER source stays fenced THROUGH activation');
        assert.equal(api.sql('select restore_required from private.launch_list_control'),'f');
        assert.equal(api.sql(`select bool_and(generation=9007199254740994 and fence_epoch=${BigInt(currentEpoch)+1n}) from private.launch_retention_items`),'t');
        assert.equal((await mode(iv)).outcome,'refused');assert.equal(beta(),beforeBeta);
        assert.equal((await rpc(api,'claim_launch_signup_v2',{p_email:'snapshot-http@test.invalid',p_source:'direct',p_ip_hash:hash(randomUUID()),p_consent_version:'2026-10-11-v1',p_consent_status:'recorded',p_launch_match:launchMatch('snapshot-http@test.invalid',key)})).suppressed,true);
      }finally{await release();}
    });
    await t.test('stopped rollback keeps exact finish and beta usable, without raw resurrection',async()=>{
      api.sql("update private.launch_list_control set mode='fenced',restore_required=true");
      assert.equal(await rpc(api,'finish_launch_delivery_v1',{p_id:signups[0],p_token:tokens[0],p_state:'failed',p_provider_id:null}),true);
      assert.equal(api.sql("select count(*) from public.signup_requests where email='snapshot-http@test.invalid'"),'0');
      const betaClaim=await rpc(api,'claim_signup_v1',{p_email:'after-stop@test.invalid',p_intent:'beta',p_platform:'android',p_source:'direct',p_ip_hash:hash(randomUUID())});
      assert.equal(betaClaim.send,true);
    });
  }finally{await release();await api.cleanup();other.cleanup();}
});

test('HTTP keeps independent uncertainty for unenrolled raw work and after actual R removes the last local marker',async t=>{
  const api=launchDataApi(),client=createLaunchRetentionClient({transport:api.transport});
  const uncertain=r=>{assert.ok(r.reasons.includes('coverage_unavailable'));assert.ok(r.reasons.includes('copies_unavailable'));};
  try{
    await install(api,t);
    api.sql(`update private.launch_list_control set project_ref='${project}',source_commit='${source}',mode='canonical';
      insert into public.signup_requests(email,intent,platform,source,registration_origin,consent_status,consent_version,withdrawn_at,delivery_state)
      values('unenrolled-http@test.invalid','launch','unspecified','direct','legacy_api','unknown',null,'2026-10-18','review')`);
    await t.test('configured empty ledger does not conceal unenrolled unknown-consent raw work; rate progress is partial',async()=>{
      const inv=await client.inventory();assert.equal(inv.items.length,0);uncertain(inv);
      assert.equal((await processLaunchRetention({client})).state,'unavailable');
      api.sql("insert into public.signup_rate_events(ip_hash,created_at) values('old',now()-interval '2 days')");
      const out=await processLaunchRetention({client});assert.equal(out.state,'partial');assert.equal(out.rateEvents.completed,1);uncertain(out);
      assert.equal(api.sql("select consent_status||':'||delivery_state from public.signup_requests where email='unenrolled-http@test.invalid'"),'unknown:review');
    });
    // Reset only this synthetic fixture between the two distinct populations.
    api.sql(`delete from public.signup_requests;update private.launch_list_control set mode='fenced';
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
    const id=randomUUID();api.sql(`insert into private.launch_retention_items(item_id,launch_match,key_generation,generation,fence_epoch,state,policy_version,reason_code,evidence_ref,scope_hash,withdrawn_at,decided_at)
      values('${id}','${'e'.repeat(64)}','1',9007199254740992,0,'marker',1,'eligible','synthetic-evidence','${'c'.repeat(64)}','2026-10-18','2026-10-18');
      update private.launch_retention_items set generation=generation+1,scope_hash=private.launch_retention_retirement_scope_v1('${id}') where item_id='${id}'`);
    const item={itemId:id,generation:'9007199254740993',epoch:'0',scope:api.sql(`select scope_hash from private.launch_retention_items where item_id='${id}'`),approvalRef:`synthetic-${randomUUID()}`,lane:'marker'};
    approve(api,item,'retention_marker');
    await t.test('actual service HTTP R retirement removes its final local item but cannot close coverage or copies',async()=>{
      const result=await client.apply(item);assert.equal(result.outcome,'retired');assert.ok(result.writes>0);assert.equal(result.generation,'9007199254740994');
      assert.equal(api.sql('select count(*) from private.launch_retention_items'),'0');assert.equal(api.sql('select count(*) from public.signup_requests'),'0');
      const inv=await client.inventory();assert.equal(inv.items.length,0);uncertain(inv);assert.equal((await processLaunchRetention({client})).state,'unavailable');
      api.sql("insert into public.signup_rate_events(ip_hash,created_at) values('old',now()-interval '2 days')");
      const out=await processLaunchRetention({client});assert.equal(out.state,'partial');assert.equal(out.rateEvents.completed,1);uncertain(out);assert.equal(out.oldestEligibleAgeSeconds,null);
    });
  }finally{await api.cleanup();}
});
