import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { launchPostgres } from './helpers/launch-postgres.mjs';
import { launchMatch } from '../lib/launch-list.mjs';

const key='synthetic-races-key', project='yohiumlrpfdhphsnnxxw', source='a'.repeat(40);
const read=name=>readFileSync(new URL(`../supabase/${name}`,import.meta.url),'utf8');
test('two-session raw cleanup races preserve owning fences and independent beta progress',async t=>{
  const db=launchPostgres();
  const observe=async(name,condition="wait_event='PgSleep'")=>{
    for(let i=0;i<150;i++) {
      if(db.sql(`select exists(select 1 from pg_stat_activity where application_name='${name}' and ${condition})`)==='t') return;
      await new Promise(r=>setTimeout(r,20));
    }
    assert.fail(`session ${name} never reached ${condition}`);
  };
  const seed=()=>{
    const item=randomUUID(),id=randomUUID(),token=randomUUID(),hash=randomUUID().replaceAll('-','').repeat(2),approval=`synthetic-${randomUUID()}`;
    const email=`${id}@test.invalid`,match=launchMatch(email,key);
    db.sql(`insert into public.signup_requests(id,email,intent,platform,source,consent_version,withdrawn_at,launch_match,launch_unsubscribe_hash,delivery_state,delivery_token,delivery_template_version,launch_token_nonce,delivery_first_attempt_at,delivery_attempted_at)
      values('${id}','${email}','launch','unspecified','direct','2026-10-11-v1','2026-10-18','${match}','${hash}','sending','${token}','launch-v1',gen_random_uuid(),'2026-10-17','2026-10-17');
      insert into private.launch_suppressions values('${match}','2026-10-18','unsubscribe');
      insert into private.launch_withdrawal_receipts values('${hash}','${match}','2026-10-18');
      insert into private.launch_delivery_guard(signup_id,fence_epoch,claim_token,payload_hash,handoff_token,handoff_at,settled)
        select '${id}',fence_epoch,'${token}','${'d'.repeat(64)}','${token}','2026-10-17',false from private.launch_list_control;
      insert into private.launch_retention_items(item_id,source_signup_id,launch_match,key_generation,generation,fence_epoch,state,policy_version,reason_code,evidence_ref,scope_hash,withdrawn_at,decided_at)
        select '${item}','${id}','${match}','1',1,fence_epoch,'raw',1,'eligible','synthetic-evidence','${'c'.repeat(64)}','2026-10-18',clock_timestamp() from private.launch_list_control;
      insert into synthetic_test.facts values('${item}','{}','{}');
      update private.launch_retention_items set generation=2,scope_hash=private.launch_retention_scope_v1('${item}') where item_id='${item}';
      insert into private.launch_import_authorizations(approval_ref,project_ref,source_commit,schema_identity,expected_scope,fence_epoch,writer_ids,control_evidence,test_evidence,settlement_evidence,verified_at,expires_at,operation,retention_key_generation)
        select '${approval}','${project}','${source}',private.launch_import_schema_v1(),scope_hash,fence_epoch,array['synthetic-writer'],'synthetic-control','synthetic-test','synthetic-settlement',clock_timestamp()-interval '1 second',clock_timestamp()+interval '1 hour','retention_raw','1' from private.launch_retention_items where item_id='${item}'`);
    const [scope,epoch]=db.sql(`select scope_hash||':'||fence_epoch from private.launch_retention_items where item_id='${item}'`).split(':');
    return {item,id,token,hash,approval,email,match,scope,epoch};
  };
  const disposal=r=>`select public.dispose_launch_raw_v1('${r.item}',2,${r.epoch},'${r.scope}','${r.approval}')`;
  try {
    await db.start();
    db.sql('create role anon; create role authenticated; create role service_role bypassrls; grant usage on schema public to anon,authenticated,service_role');
    db.sql(read('waitlist.sql'));db.sql('grant all on public.waitlist to service_role');
    for(const n of ['20261011050938_add_signup_intents.sql','20261013112838_launch_list_lifecycle.sql','20261013125523_launch_list_canonical_cutover.sql','20261018141524_launch_list_retention_state.sql']) db.sql(read(`migrations/${n}`));
    for(const n of readdirSync(new URL('../supabase/migrations/',import.meta.url)).filter(n=>n.endsWith('_launch_list_retention_disposition.sql'))) db.sql(read(`migrations/${n}`));
    assert.equal(db.sql("select to_regprocedure('public.dispose_launch_raw_v1(uuid,bigint,bigint,text,text)') is not null"),'t','cleanup must be installed before real races');
    db.sql(`update private.launch_list_control set mode='canonical',project_ref='${project}',source_commit='${source}';
      create schema synthetic_test; revoke all on schema synthetic_test from public,anon,authenticated,service_role;
      create table synthetic_test.facts(item_id uuid primary key,holds text[],refs text[]);
      ${db.sql("select replace(pg_get_functiondef('private.launch_retention_context_v1(uuid,bigint)'::regprocedure),'private.launch_retention_context_v1','synthetic_test.base_context')")};
      create or replace function private.launch_retention_context_v1(p_item_id uuid,p_generation bigint) returns jsonb language plpgsql stable security invoker set search_path=pg_catalog as $facts$
      declare f jsonb;p jsonb;x synthetic_test.facts;n text;begin
        f:=synthetic_test.base_context(p_item_id,p_generation);select * into x from synthetic_test.facts where item_id=p_item_id;
        if not found then return '{"state":"unavailable"}'::jsonb;end if;p:=f->'withdrawal';
        foreach n in array array['necessity','references','hold','delivery','link','suppression','restore'] loop
          f:=jsonb_set(f,array[n],(p-array['status','at'])||jsonb_build_object('purposes',case n when 'references' then to_jsonb(x.refs) when 'hold' then to_jsonb(x.holds) else '[]'::jsonb end));
        end loop;
        f:=jsonb_set(f,'{delivery}',f->'delivery'||'{"outcome":"unknown","compactCovered":true}'::jsonb);
        f:=jsonb_set(f,'{link}',f->'link'||'{"covered":true}'::jsonb);f:=jsonb_set(f,'{suppression}',f->'suppression'||'{"covered":true}'::jsonb);
        return jsonb_set(f,'{restore}',f->'restore'||'{"independent":true,"current":true}'::jsonb);
      end $facts$;
      update private.launch_write_fence_contract set definition_hash=private.launch_write_fence_fingerprint_v1()`);
    await t.test('same-address beta claim AND finish complete while cleanup waits for a launch tuple',async()=>{
      const r=seed();
      const holder=db.asyncSql(`set statement_timeout='8s';set application_name='raw-tuple-holder';begin;
        select id from public.signup_requests where id='${r.id}' for update;select pg_sleep(2);commit`);
      let cleanup;
      try {
        await observe('raw-tuple-holder');
        cleanup=db.asyncSql(`set statement_timeout='6s';set application_name='raw-cleanup-wait';set role service_role;${disposal(r)}`);
        await observe('raw-cleanup-wait',"wait_event_type='Lock'");
        const began=Date.now();
        const beta=JSON.parse(await db.asyncSql(`set statement_timeout='900ms';set lock_timeout='600ms';set role service_role;
          select public.claim_signup_v1('${r.email}','beta','android','direct','${'e'.repeat(64)}')`));
        assert.equal(beta.send,true);
        assert.equal(await db.asyncSql(`set statement_timeout='900ms';set role service_role;select public.finish_signup_delivery_v1('${beta.id}','${beta.token}','sent','beta-race-provider')`),'t');
        assert.ok(Date.now()-began<1500,'same-address beta completes within deadline while launch cleanup is still waiting');
        assert.equal(db.sql("select exists(select 1 from pg_stat_activity where application_name='raw-tuple-holder' and wait_event='PgSleep')"),'t');
      } finally {await holder;if(cleanup)await cleanup;}
      assert.equal(db.sql(`select delivery_state||':'||provider_id from public.signup_requests where email='${r.email}' and intent='beta'`),'sent:beta-race-provider');
      assert.equal(db.sql(`select public.finish_launch_delivery_v1('${r.id}','${r.token}','failed')`),'t');
    });
    for(const actor of ['withdrawal','claim','finish']) await t.test(`cleanup versus ${actor} serializes on launch fence and cannot revive raw data`,async()=>{
      const r=seed();
      const cleaning=db.asyncSql(`set statement_timeout='8s';set application_name='cleanup-${actor}';begin;set local role service_role;
        ${disposal(r)};select pg_sleep(1);commit`);
      try {
        await observe(`cleanup-${actor}`);
        const operation=actor==='withdrawal'?`select public.withdraw_launch_v1('${r.hash}')`:actor==='finish'?`select public.finish_launch_delivery_v1('${r.id}','${r.token}','sent','race-provider')`:`select public.claim_launch_signup_v2('${r.email}','direct','${'f'.repeat(64)}','2026-10-11-v1','recorded','${r.match}')`;
        const competing=db.asyncSql(`set statement_timeout='6s';set application_name='competitor-${actor}';set role service_role;${operation}`);
        await observe(`competitor-${actor}`,"wait_event_type='Lock'");
        assert.equal(JSON.parse((await cleaning).split('\n')[0]).outcome,'disposed');
        const out=await competing;
        if(actor==='withdrawal')assert.equal(JSON.parse(out).outcome,'already_withdrawn');
        else if(actor==='claim')assert.equal(JSON.parse(out).suppressed,true);else assert.equal(out,'t');
        assert.equal(db.sql(`select count(*) from public.signup_requests where id='${r.id}'`),'0');
        if(actor!=='finish')assert.equal(db.sql(`select public.finish_launch_delivery_v1('${r.id}','${r.token}','failed')`),'t');
      } finally {await cleaning;}
    });
    for(const actor of ['hold','reference','epoch']) await t.test(`committed ${actor} change invalidates the exact earlier cleanup decision`,async()=>{
      const r=seed();
      const change=actor==='hold'?`update synthetic_test.facts set holds=array['legal_hold'] where item_id='${r.item}';update private.launch_retention_items set generation=generation+1,reason_code='held' where item_id='${r.item}'`:actor==='reference'?`update synthetic_test.facts set refs=array['delivery_reference'] where item_id='${r.item}';update private.launch_retention_items set generation=generation+1,reason_code='live_reference' where item_id='${r.item}'`:actor==='epoch'?`update private.launch_list_control set fence_epoch=fence_epoch+1`:`update public.signup_requests set source='instagram' where id='${r.id}'`;
      const writer=db.asyncSql(`set statement_timeout='8s';set application_name='owning-${actor}';begin;select pg_advisory_xact_lock(hashtextextended('launch-list-fence',0));${change};select pg_sleep(0.4);commit`);
      try {
        await observe(`owning-${actor}`);
        const cleanup=db.asyncSql(`set statement_timeout='5s';set role service_role;${disposal(r)}`);
        const out=JSON.parse(await cleanup);assert.equal(out.outcome,'refused');await writer;
        assert.equal(db.sql(`select count(*) from public.signup_requests where id='${r.id}'`),'1');
        assert.equal(db.sql(`select consumed_at is null from private.launch_import_authorizations where approval_ref='${r.approval}'`),'t');
        assert.equal(db.sql(`select count(*) from private.launch_retention_delivery where item_id='${r.item}'`),'0');
        assert.equal(JSON.parse(db.sql(disposal(r))).outcome,'refused');
        assert.equal(db.sql(`select public.finish_launch_delivery_v1('${r.id}','${r.token}','failed')`),'t');
      } finally {await writer;}
    });
    await t.test('actual import API holds the launch fence and invalidates prior canonical cleanup scope',async()=>{
      const r=seed();assert.equal(db.sql(`select public.finish_launch_delivery_v1('${r.id}','${r.token}','failed')`),'t');
      // Owner-only fixture simulates already verified maintenance entry; the
      // importer itself executes the unmodified import authority/transaction.
      db.sql("update private.launch_list_control set mode='fenced'");
      const inv=JSON.parse(db.sql(`select public.inventory_launch_legacy_v1('${key}')`));
      db.sql(`insert into private.launch_import_authorizations(approval_ref,project_ref,source_commit,schema_identity,expected_scope,fence_epoch,writer_ids,control_evidence,test_evidence,settlement_evidence,verified_at,expires_at)
        values('synthetic-import-race','${project}','${source}','${inv.schemaIdentity}','${inv.scopeHash}',${inv.fenceEpoch},array['synthetic-writer'],'synthetic-control','synthetic-test','synthetic-settlement',clock_timestamp()-interval '1 second',clock_timestamp()+interval '1 hour')`);
      const importing=db.asyncSql(`set statement_timeout='8s';set application_name='actual-import';begin;set local role service_role;
        select public.reconcile_launch_legacy_v1('${inv.scopeHash}','${key}',true);select pg_sleep(0.5);commit`);
      try{
        await observe('actual-import');
        const cleanup=db.asyncSql(`set statement_timeout='5s';set application_name='cleanup-after-import';set role service_role;${disposal(r)}`);
        await observe('cleanup-after-import',"wait_event_type='Lock'");
        const imported=JSON.parse((await importing).split('\n')[0]);assert.equal(imported.outcome,'reconciled');assert.equal(imported.disposalAllowed,false);
        assert.equal(JSON.parse(await cleanup).outcome,'refused');
        assert.equal(db.sql(`select consumed_at is null from private.launch_import_authorizations where approval_ref='${r.approval}'`),'t');
        assert.equal(db.sql('select count(*) from private.launch_import_context'),'0');
        assert.equal(db.sql(`select count(*) from public.signup_requests where id='${r.id}'`),'1');
      }finally{await importing;db.sql("update private.launch_list_control set mode='canonical'");}
    });
    await t.test('outer-fence timeout returns fixed count-only refusal with no partial loss',async()=>{
      const r=seed();const holder=db.asyncSql("set application_name='timeout-holder';begin;select pg_advisory_xact_lock(hashtextextended('launch-list-fence',0));select pg_sleep(2);commit");
      try {await observe('timeout-holder');const out=JSON.parse(await db.asyncSql(`set role service_role;${disposal(r)}`));assert.equal(out.outcome,'refused');assert.equal(out.reason,'unavailable');assert.equal(out.writes,0);} finally {await holder;}
      assert.equal(db.sql(`select count(*) from public.signup_requests where id='${r.id}'`),'1');
    });
  } finally {db.cleanup();}
});
