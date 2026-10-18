import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { launchPostgres } from './helpers/launch-postgres.mjs';
import { launchMatch } from '../lib/launch-list.mjs';
import { withOwnedCleanup } from './helpers/owned-cleanup.mjs';

const key='synthetic-races-key', project='yohiumlrpfdhphsnnxxw', source='a'.repeat(40);
const read=name=>readFileSync(new URL(`../supabase/${name}`,import.meta.url),'utf8');
test('two-session raw cleanup races preserve owning fences and independent beta progress',async t=>{
  const db=launchPostgres();
  const observe=async(name,condition="wait_event='PgSleep'",attempts=150)=>{
    for(let i=0;i<attempts;i++) {
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
      insert into synthetic_test.facts(item_id,holds,refs) values('${item}','{}','{}');
      update private.launch_retention_items set generation=2,scope_hash=private.launch_retention_scope_v1('${item}') where item_id='${item}';
      insert into private.launch_import_authorizations(approval_ref,project_ref,source_commit,schema_identity,expected_scope,fence_epoch,writer_ids,control_evidence,test_evidence,settlement_evidence,verified_at,expires_at,operation,retention_key_generation)
        select '${approval}','${project}','${source}',private.launch_import_schema_v1(),scope_hash,fence_epoch,array['synthetic-writer'],'synthetic-control','synthetic-test','synthetic-settlement',clock_timestamp()-interval '1 second',clock_timestamp()+interval '1 hour','retention_raw','1' from private.launch_retention_items where item_id='${item}'`);
    const [scope,epoch]=db.sql(`select scope_hash||':'||fence_epoch from private.launch_retention_items where item_id='${item}'`).split(':');
    return {item,id,token,hash,approval,email,match,scope,epoch};
  };
  // Separate protocol commands: configure the caller BEFORE dispatch, never
  // set_config inside the API SELECT. No global role/default setting is changed.
  const disposal=(r,timeout='5s')=>`set statement_timeout='${timeout}'; select public.dispose_launch_raw_v1('${r.item}',2,${r.epoch},'${r.scope}','${r.approval}')`;
  const snapshot=()=>db.sql(`select jsonb_build_array(
    (select jsonb_agg(to_jsonb(s) order by id) from public.signup_requests s),
    (select jsonb_agg(to_jsonb(g) order by signup_id) from private.launch_delivery_guard g),
    (select jsonb_agg(to_jsonb(i) order by item_id) from private.launch_retention_items i),
    (select jsonb_agg(to_jsonb(d) order by signup_id,handoff_token) from private.launch_retention_delivery d),
    (select jsonb_agg(to_jsonb(a) order by approval_ref) from private.launch_import_authorizations a),
    (select jsonb_agg(to_jsonb(x) order by launch_match) from private.launch_suppressions x),
    (select jsonb_agg(to_jsonb(w) order by token_hash) from private.launch_withdrawal_receipts w),
    (select to_jsonb(c) from private.launch_list_control c where singleton))`);
  // A committed owner-only gate keeps each holder alive until the observer
  // confirms the contender. No fixed holder sleep or shortened lock window.
  const withRace=async(r,body)=>{
    const gate=randomUUID(),actors=[];
    db.sql(`insert into synthetic_test.barriers values('${gate}',false)`);
    const release=()=>db.sql(`update synthetic_test.barriers set released=true where id='${gate}'`);
    const race={
      wait:`reset role;set statement_timeout='25s';do $gate$ begin while not (select released from synthetic_test.barriers where id='${gate}') loop perform pg_sleep(0.02);end loop;end $gate$;`,
      start(query){const actor=db.asyncSql(query).then(output=>({output}),error=>({error}));actors.push(actor);return actor;},
      async output(actor){const result=await actor;if(result.error)throw result.error;return result.output;},release,
    };
    return withOwnedCleanup(()=>body(race),[
      release,
      async()=>{const results=await Promise.all(actors),errors=results.filter(r=>r.error).map(r=>r.error);if(errors.length)throw new AggregateError(errors,'Owned race actors failed.');},
      ()=>{
        assert.equal(db.sql("select pg_try_advisory_xact_lock(hashtextextended('launch-list-fence',0))"),'t','every actor releases the outer fence');
        assert.equal(db.sql(`begin;set lock_timeout='300ms';select count(*) from (select 1 from public.signup_requests where id='${r.id}' for update nowait) s;rollback`),db.sql(`select count(*) from public.signup_requests where id='${r.id}'`));
      },
      ()=>{
        // Settle this exact synthetic handoff even if an overlap assertion fails;
        // a following global import check must not inherit an unknown delivery.
        const state=JSON.parse(db.sql(`select coalesce(
          (select jsonb_build_object('state',outcome,'settled',outcome in ('sent','failed')) from private.launch_retention_delivery where signup_id='${r.id}' and handoff_token='${r.token}'),
          (select jsonb_build_object('state',s.delivery_state,'settled',g.settled) from public.signup_requests s join private.launch_delivery_guard g on g.signup_id=s.id where s.id='${r.id}'))`));
        if(state.settled)assert.ok(['sent','failed'].includes(state.state),'do not replay an already settled raw finish, whose original API returns false');
        else assert.equal(db.sql(`select public.finish_launch_delivery_v1('${r.id}','${r.token}','failed',null)`),'t');
      },
    ]);
  };
  try {
    await db.start();
    db.sql('create role anon; create role authenticated; create role service_role bypassrls; grant usage on schema public to anon,authenticated,service_role');
    db.sql(read('waitlist.sql'));db.sql('grant all on public.waitlist to service_role');
    for(const n of ['20261011050938_add_signup_intents.sql','20261013112838_launch_list_lifecycle.sql','20261013125523_launch_list_canonical_cutover.sql','20261018141524_launch_list_retention_state.sql']) db.sql(read(`migrations/${n}`));
    for(const n of readdirSync(new URL('../supabase/migrations/',import.meta.url)).filter(n=>n.endsWith('_launch_list_retention_disposition.sql'))) db.sql(read(`migrations/${n}`));
    assert.equal(db.sql("select to_regprocedure('public.dispose_launch_raw_v1(uuid,bigint,bigint,text,text)') is not null"),'t','cleanup must be installed before real races');
    db.sql(`update private.launch_list_control set mode='canonical',project_ref='${project}',source_commit='${source}';
      create schema synthetic_test; revoke all on schema synthetic_test from public,anon,authenticated,service_role;
      create table synthetic_test.facts(item_id uuid primary key,holds text[],refs text[],pause_seconds double precision not null default 0);
      create table synthetic_test.barriers(id uuid primary key,released boolean not null);
      create sequence synthetic_test.proof_calls;
      ${db.sql("select replace(pg_get_functiondef('private.launch_retention_context_v1(uuid,bigint)'::regprocedure),'private.launch_retention_context_v1','synthetic_test.base_context')")};
      create or replace function private.launch_retention_context_v1(p_item_id uuid,p_generation bigint) returns jsonb language plpgsql stable security invoker set search_path=pg_catalog as $facts$
      declare f jsonb;p jsonb;x synthetic_test.facts;n text;begin
        f:=synthetic_test.base_context(p_item_id,p_generation);select * into x from synthetic_test.facts where item_id=p_item_id;
        if not found then return '{"state":"unavailable"}'::jsonb;end if;
        perform nextval('synthetic_test.proof_calls');
        if x.pause_seconds>0 then perform pg_sleep(x.pause_seconds);end if;p:=f->'withdrawal';
        foreach n in array array['necessity','references','hold','delivery','link','suppression','restore'] loop
          f:=jsonb_set(f,array[n],(p-array['status','at'])||jsonb_build_object('purposes',case n when 'references' then to_jsonb(x.refs) when 'hold' then to_jsonb(x.holds) else '[]'::jsonb end));
        end loop;
        f:=jsonb_set(f,'{delivery}',f->'delivery'||'{"outcome":"unknown","compactCovered":true}'::jsonb);
        f:=jsonb_set(f,'{link}',f->'link'||'{"covered":true}'::jsonb);f:=jsonb_set(f,'{suppression}',f->'suppression'||'{"covered":true}'::jsonb);
        return jsonb_set(f,'{restore}',f->'restore'||'{"independent":true,"current":true}'::jsonb);
      end $facts$;
      update private.launch_write_fence_contract set definition_hash=private.launch_write_fence_fingerprint_v1()`);
    await t.test('unbounded and over-five-second disposal callers refuse before proof or writes',()=>{
      const outcomes=[];
      for(const timeout of ['0','5001ms','6s']) {
        const r=seed(),before=snapshot(),proofs=db.sql('select last_value::text||is_called from synthetic_test.proof_calls');
        const out=JSON.parse(db.sql(`set role service_role;${disposal(r,timeout)}`));outcomes.push(out.outcome);
        if(out.outcome==='refused') {
          assert.equal(out.reason,'unavailable');assert.equal(out.writes,0);assert.equal(snapshot(),before);
          assert.equal(db.sql('select last_value::text||is_called from synthetic_test.proof_calls'),proofs);
        }
        assert.equal(db.sql(`select public.finish_launch_delivery_v1('${r.id}','${r.token}','failed')`),'t');
      }
      assert.deepEqual(outcomes,['refused','refused','refused']);
      assert.equal(db.sql("show statement_timeout"),'0','unrelated connections retain their default');
    });
    await t.test('pre-command five-second deadline cancels a real 5.5-second proof and releases locks inside the open transaction',async()=>{
      const r=seed();db.sql(`update synthetic_test.facts set pause_seconds=5.5 where item_id='${r.item}'`);
      const before=snapshot(),began=performance.now();
      await withRace(r,async race=>{
        const running=race.start(`set application_name='bounded-slow-proof';begin;set local role service_role;
          select clock_timestamp() as server_started \\gset
          ${disposal(r)};
          select extract(epoch from (clock_timestamp()-:'server_started'::timestamptz))*1000;
          ${race.wait}commit`);
        await observe('bounded-slow-proof');
        await observe('bounded-slow-proof',"wait_event='PgSleep' and query like '%$gate$%'",400);
        const observed=performance.now()-began;
        assert.equal(db.sql("select pg_try_advisory_xact_lock(hashtextextended('launch-list-fence',0))"),'t');
        assert.doesNotThrow(()=>db.sql(`begin;select item_id from private.launch_retention_items where item_id='${r.item}' for update nowait;
          select id from public.signup_requests where id='${r.id}' for update nowait;
          select approval_ref from private.launch_import_authorizations where approval_ref='${r.approval}' for update nowait;rollback`));
        assert.equal(snapshot(),before);
        race.release();const [json,ms]=(await race.output(running)).split('\n'),elapsed=Number(ms);
        t.diagnostic(`server API interval ${elapsed}ms; external observer scheduled after ${Math.round(observed)}ms`);
        assert.ok(elapsed>=4500&&elapsed<5500,'real pre-command deadline, not the 5.5-second proof, ended the API statement');
        assert.deepEqual(JSON.parse(json),{outcome:'refused',workId:r.item,generation:'2',reason:'unavailable',writes:0});
      });
    });
    await t.test('actual statement cancellation after compact insertion rolls all writes back with sanitized count-only refusal',async()=>{
      db.sql(`create sequence synthetic_test.cancel_hits;
        create function synthetic_test.pause_after_compact() returns trigger language plpgsql as $pause$
          begin perform nextval('synthetic_test.cancel_hits');perform pg_sleep(5.5);return new;end $pause$;
        create trigger synthetic_cancel after insert on private.launch_retention_delivery for each row execute function synthetic_test.pause_after_compact()`);
      const r=seed(),before=snapshot(),began=Date.now();
      await withOwnedCleanup(()=>withRace(r,async race=>{
        const out=JSON.parse(await race.output(race.start(`set role service_role;${disposal(r,'500ms')}`)));
        assert.ok(Date.now()-began<2000);assert.equal(db.sql('select is_called from synthetic_test.cancel_hits'),'t');
        assert.deepEqual(out,{outcome:'refused',workId:r.item,generation:'2',reason:'unavailable',writes:0});assert.equal(snapshot(),before);
        assert.equal(db.sql("select pg_try_advisory_xact_lock(hashtextextended('launch-list-fence',0))"),'t');
      }),[()=>db.sql('drop trigger synthetic_cancel on private.launch_retention_delivery;drop function synthetic_test.pause_after_compact();drop sequence synthetic_test.cancel_hits')]);
    });
    await t.test('same-address beta claim AND finish complete while cleanup waits for a launch tuple',async()=>{
      const r=seed();
      await withRace(r,async race=>{
        const holder=race.start(`set application_name='raw-tuple-holder';begin;
          select id from public.signup_requests where id='${r.id}' for update;${race.wait}commit`);
        await observe('raw-tuple-holder');
        const cleanup=race.start(`set application_name='raw-cleanup-wait';set role service_role;${disposal(r)}`);
        await observe('raw-cleanup-wait',"wait_event_type='Lock'");
        const began=Date.now();
        const beta=JSON.parse(await db.asyncSql(`set statement_timeout='900ms';set lock_timeout='600ms';set role service_role;
          select public.claim_signup_v1('${r.email}','beta','android','direct','${'e'.repeat(64)}')`));
        assert.equal(beta.send,true);
        assert.equal(db.sql("select exists(select 1 from pg_stat_activity where application_name='raw-cleanup-wait' and wait_event_type='Lock')"),'t','cleanup still waits after beta claim');
        assert.equal(await db.asyncSql(`set statement_timeout='900ms';set role service_role;select public.finish_signup_delivery_v1('${beta.id}','${beta.token}','sent','beta-race-provider')`),'t');
        assert.ok(Date.now()-began<1500,'same-address beta completes within deadline while launch cleanup is still waiting');
        assert.equal(db.sql("select exists(select 1 from pg_stat_activity where application_name='raw-cleanup-wait' and wait_event_type='Lock')"),'t','cleanup still waits through beta finish');
        // Hold through the actual lock-timeout result, not an elapsed guess.
        const out=JSON.parse(await race.output(cleanup));assert.equal(out.outcome,'refused');assert.equal(out.reason,'unavailable');assert.equal(out.writes,0);
        race.release();await race.output(holder);
      });
      assert.equal(db.sql(`select count(*) from public.signup_requests where id='${r.id}'`),'1');
      assert.equal(db.sql(`select delivery_state||':'||provider_id from public.signup_requests where email='${r.email}' and intent='beta'`),'sent:beta-race-provider');
    });
    for(const actor of ['withdrawal','claim','finish']) await t.test(`cleanup versus ${actor} serializes on launch fence and cannot revive raw data`,async()=>{
      const r=seed();
      await withRace(r,async race=>{
        const cleaning=race.start(`set application_name='cleanup-${actor}';begin;set local role service_role;
          ${disposal(r)};${race.wait}commit`);
        await observe(`cleanup-${actor}`);
        // Reproduce observer scheduling later than the old one-second holder.
        // This delay is an adversarial test input, never synchronization.
        if(actor==='withdrawal')await new Promise(resolve=>setTimeout(resolve,1200));
        const operation=actor==='withdrawal'?`select public.withdraw_launch_v1('${r.hash}')`:actor==='finish'?`select public.finish_launch_delivery_v1('${r.id}','${r.token}','sent','race-provider')`:`select public.claim_launch_signup_v2('${r.email}','direct','${'f'.repeat(64)}','2026-10-11-v1','recorded','${r.match}')`;
        const competing=race.start(`set statement_timeout='6s';set application_name='competitor-${actor}';set role service_role;${operation}`);
        await observe(`competitor-${actor}`,"wait_event_type='Lock'");
        assert.equal(db.sql(`select exists(select 1 from pg_stat_activity where application_name='cleanup-${actor}' and wait_event='PgSleep')`),'t','holder overlaps actual contender');
        race.release();assert.equal(JSON.parse(await race.output(cleaning)).outcome,'disposed');
        const out=await race.output(competing);
        if(actor==='withdrawal')assert.equal(JSON.parse(out).outcome,'already_withdrawn');
        else if(actor==='claim')assert.equal(JSON.parse(out).suppressed,true);else assert.equal(out,'t');
        assert.equal(db.sql(`select count(*) from public.signup_requests where id='${r.id}'`),'0');
        if(actor!=='finish')assert.equal(db.sql(`select public.finish_launch_delivery_v1('${r.id}','${r.token}','failed')`),'t');
      });
    });
    await t.test('I2 failed overlap assertion still releases, settles every actor and isolates following readiness',async()=>{
      const r=seed(),original=Error('synthetic observer assertion');
      await assert.rejects(withRace(r,async race=>{
        race.start(`set application_name='failure-cleanup';begin;set local role service_role;${disposal(r)};${race.wait}commit`);
        await observe('failure-cleanup');
        race.start(`set statement_timeout='6s';set application_name='failure-competitor';set role service_role;select public.withdraw_launch_v1('${r.hash}')`);
        await observe('failure-competitor',"wait_event_type='Lock'");
        throw original;
      }),error=>error===original);
      assert.equal(db.sql("select count(*) from pg_stat_activity where application_name in ('failure-cleanup','failure-competitor')"),'0');
      assert.equal(db.sql('select private.launch_delivery_data_ready_v1()'),'t');
      assert.equal(db.sql(`select outcome from private.launch_retention_delivery where signup_id='${r.id}'`),'failed');
    });
    for(const actor of ['hold','reference','epoch']) await t.test(`committed ${actor} change invalidates the exact earlier cleanup decision`,async()=>{
      const r=seed();
      const change=actor==='hold'?`update synthetic_test.facts set holds=array['legal_hold'] where item_id='${r.item}';update private.launch_retention_items set generation=generation+1,reason_code='held' where item_id='${r.item}'`:actor==='reference'?`update synthetic_test.facts set refs=array['delivery_reference'] where item_id='${r.item}';update private.launch_retention_items set generation=generation+1,reason_code='live_reference' where item_id='${r.item}'`:actor==='epoch'?`update private.launch_list_control set fence_epoch=fence_epoch+1`:`update public.signup_requests set source='instagram' where id='${r.id}'`;
      await withRace(r,async race=>{
        const writer=race.start(`set application_name='owning-${actor}';begin;select pg_advisory_xact_lock(hashtextextended('launch-list-fence',0));${change};${race.wait}commit`);
        await observe(`owning-${actor}`);
        const cleanup=race.start(`set application_name='stale-${actor}';set role service_role;${disposal(r)}`);
        await observe(`stale-${actor}`,"wait_event_type='Lock'");
        race.release();await race.output(writer);
        const out=JSON.parse(await race.output(cleanup));assert.equal(out.outcome,'refused');assert.equal(out.writes,0);
        assert.equal(db.sql(`select count(*) from public.signup_requests where id='${r.id}'`),'1');
        assert.equal(db.sql(`select consumed_at is null from private.launch_import_authorizations where approval_ref='${r.approval}'`),'t');
        assert.equal(db.sql(`select count(*) from private.launch_retention_delivery where item_id='${r.item}'`),'0');
        assert.equal(JSON.parse(db.sql(disposal(r))).outcome,'refused');
        assert.equal(db.sql(`select public.finish_launch_delivery_v1('${r.id}','${r.token}','failed')`),'t');
      });
    });
    await t.test('actual import API holds the launch fence and invalidates prior canonical cleanup scope',async()=>{
      const r=seed();assert.equal(db.sql(`select public.finish_launch_delivery_v1('${r.id}','${r.token}','failed')`),'t');
      // Owner-only fixture simulates already verified maintenance entry; the
      // importer itself executes the unmodified import authority/transaction.
      db.sql("update private.launch_list_control set mode='fenced'");
      const inv=JSON.parse(db.sql(`select public.inventory_launch_legacy_v1('${key}')`));
      db.sql(`insert into private.launch_import_authorizations(approval_ref,project_ref,source_commit,schema_identity,expected_scope,fence_epoch,writer_ids,control_evidence,test_evidence,settlement_evidence,verified_at,expires_at)
        values('synthetic-import-race','${project}','${source}','${inv.schemaIdentity}','${inv.scopeHash}',${inv.fenceEpoch},array['synthetic-writer'],'synthetic-control','synthetic-test','synthetic-settlement',clock_timestamp()-interval '1 second',clock_timestamp()+interval '1 hour')`);
      await withOwnedCleanup(()=>withRace(r,async race=>{
        assert.equal(db.sql('select private.launch_delivery_data_ready_v1()'),'t','all earlier synthetic handoffs are settled before import');
        const importing=race.start(`set statement_timeout='8s';set application_name='actual-import';begin;set local role service_role;
          select public.reconcile_launch_legacy_v1('${inv.scopeHash}','${key}',true);${race.wait}commit`);
        await observe('actual-import');
        const cleanup=race.start(`set application_name='cleanup-after-import';set role service_role;${disposal(r)}`);
        await observe('cleanup-after-import',"wait_event_type='Lock'");
        race.release();const imported=JSON.parse(await race.output(importing));assert.equal(imported.outcome,'reconciled');assert.equal(imported.disposalAllowed,false);
        const refused=JSON.parse(await race.output(cleanup));assert.equal(refused.outcome,'refused');assert.equal(refused.writes,0);
        assert.equal(db.sql(`select consumed_at is null from private.launch_import_authorizations where approval_ref='${r.approval}'`),'t');
        assert.equal(db.sql('select count(*) from private.launch_import_context'),'0');
        assert.equal(db.sql(`select count(*) from public.signup_requests where id='${r.id}'`),'1');
      }),[()=>db.sql("update private.launch_list_control set mode='canonical'")]);
    });
    await t.test('outer-fence timeout returns fixed count-only refusal with no partial loss',async()=>{
      const r=seed(),before=snapshot();
      await withRace(r,async race=>{
        const holder=race.start(`set application_name='timeout-holder';begin;select pg_advisory_xact_lock(hashtextextended('launch-list-fence',0));${race.wait}commit`);
        await observe('timeout-holder');
        const cleanup=race.start(`set application_name='timeout-contender';set role service_role;${disposal(r)}`);
        await observe('timeout-contender',"wait_event_type='Lock'");
        const out=JSON.parse(await race.output(cleanup));assert.equal(out.outcome,'refused');assert.equal(out.reason,'unavailable');assert.equal(out.writes,0);
        assert.equal(snapshot(),before);race.release();await race.output(holder);
      });
      assert.equal(db.sql(`select count(*) from public.signup_requests where id='${r.id}'`),'1');
    });
  } finally {db.cleanup();}
});
