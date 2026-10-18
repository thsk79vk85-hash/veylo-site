import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { launchPostgres } from './helpers/launch-postgres.mjs';
import { launchMatch, registerLaunchSignup } from '../lib/launch-list.mjs';
import { launchEnv, launchSignup, freshClaim } from './helpers/guarded-launch.mjs';

const read = name => readFileSync(new URL(`../supabase/${name}`, import.meta.url), 'utf8');
const project = 'yohiumlrpfdhphsnnxxw', source = 'a'.repeat(40);
const deliveryOptional = ['provider_ref','claim_token','claim_outcome','claim_finished_at','settled_at','handoff_at'];
const deliveryKey = ['signup_id','handoff_token','item_id','outcome','generation','fence_epoch'];
const provenance = ['legacy_id','legacy_created_at','signup_id','disposition_id','launch_match','outcome'];
const authorityOptional = ['project_ref','source_commit','schema_identity','expected_scope','writer_ids','control_evidence',
  'test_evidence','settlement_evidence','verified_at','expires_at','revoked_at','target_mode','restore_snapshot_ref',
  'restore_replay_ref','restore_coverage_ref','retention_key_generation','post_scope','result_receipt'];
const authorityKey = ['approval_ref','operation','fence_epoch','consumed_at','retention_item_id'];
const contextKey = ['transaction_id','backend_pid','approval_ref','expected_scope','fence_epoch','legacy_id','signup_id','launch_match','owner_postmaster_start','owner_backend_start'];
const markerPaths = [
  ...['token_hash','launch_match','withdrawn_at'].map(n => `launch_withdrawal_receipts.${n}`),
  ...['launch_match','withdrawn_at','basis'].map(n => `launch_suppressions.${n}`),
  ...['item_id','source_signup_id','launch_match','key_generation','generation','fence_epoch','state','policy_version',
    'reason_code','evidence_ref','scope_hash','withdrawn_at','decided_at'].map(n => `launch_retention_items.${n}`),
];
const allPaths = [...deliveryOptional,...deliveryKey].map(n => `launch_retention_delivery.${n}`)
  .concat(provenance.map(n => `launch_legacy_provenance.${n}`),
    [...authorityOptional,...authorityKey].map(n => `launch_import_authorizations.${n}`),
    contextKey.map(n => `launch_import_context.${n}`), markerPaths);

test('unchanged Node producer does not send again because an exact finish returns false',async()=>{
  let sends=0,finishes=0,claims=0;
  const fetchImpl=async url=>{
    let body=true;
    if(url.endsWith('/claim_launch_signup_v2'))body=++claims===1?freshClaim:{suppressed:true};
    else if(url.endsWith('/finish_launch_delivery_v1')){finishes++;body=false;}
    else if(url==='https://api.resend.com/emails'){sends++;body={id:'synthetic-provider'};}
    else assert.ok(url.endsWith('/pin_launch_payload_v1')||url.endsWith('/authorize_launch_delivery_v1'));
    return new Response(JSON.stringify(body),{status:200});
  };
  const first=await registerLaunchSignup({signup:launchSignup,env:launchEnv,ip:'synthetic-ip',fetchImpl});
  assert.equal(first.status,200);assert.equal(first.body.delivery,'sent');assert.equal(sends,1);assert.equal(finishes,1);
  const retry=await registerLaunchSignup({signup:launchSignup,env:launchEnv,ip:'synthetic-ip',fetchImpl});
  assert.equal(retry.status,409);assert.equal(sends,1);assert.equal(finishes,1);
});

// Every proof below is an OWNER-INSTALLED SYNTHETIC TEST binding, never an app
// adapter or public setter. SQL is the real migrated implementation under test.
test('purpose-specific retirement preserves unrelated facts and exact replay fences', async t => {
  const db = launchPostgres();
  const call = sql => db.sql(`set role service_role; set statement_timeout='5s'; ${sql}`);
  const json = sql => JSON.parse(call(sql));
  const observe = async (name, condition = "wait_event='PgSleep'") => {
    for (let n = 0; n < 180; n++) {
      if (db.sql(`select exists(select 1 from pg_stat_activity where application_name='${name}' and ${condition})`) === 't') return;
      await new Promise(r => setTimeout(r, 20));
    }
    assert.fail(`session ${name} did not reach ${condition}`);
  };
  const snapshot = () => db.sql(`select jsonb_build_array(
    (select jsonb_agg(to_jsonb(i) order by item_id) from private.launch_retention_items i),
    (select jsonb_agg(to_jsonb(d) order by signup_id,handoff_token) from private.launch_retention_delivery d),
    (select jsonb_agg(to_jsonb(p) order by legacy_id) from private.launch_legacy_provenance p),
    (select jsonb_agg(to_jsonb(a) order by approval_ref) from private.launch_import_authorizations a),
    (select jsonb_agg(to_jsonb(c) order by transaction_id) from private.launch_import_context c),
    (select jsonb_agg(to_jsonb(s) order by id) from public.signup_requests s),
    (select jsonb_agg(to_jsonb(x) order by launch_match) from private.launch_suppressions x),
    (select jsonb_agg(to_jsonb(w) order by token_hash) from private.launch_withdrawal_receipts w))`);
  const setFields = (r, patches = {}, defaults = ['late_result']) => {
    const fields = Object.fromEntries(allPaths.map(n => [n, defaults]));
    Object.assign(fields, patches);
    db.sql(`update synthetic_test.facts set fields='${JSON.stringify(fields).replaceAll("'", "''")}'::jsonb where item_id='${r.item}'`);
  };
  const prepare = (r, operation = 'retention_receipt') => {
    const approval = `synthetic-${randomUUID()}`;
    const retired=db.sql(`select state='retired' from private.launch_retention_items where item_id='${r.item}'`)==='t';
    if(!retired)db.sql(`update private.launch_retention_items set generation=generation+1,
      fence_epoch=(select fence_epoch from private.launch_list_control),scope_hash=private.launch_retention_retirement_scope_v1('${r.item}') where item_id='${r.item}';
      `);
    db.sql(`insert into private.launch_import_authorizations(approval_ref,project_ref,source_commit,schema_identity,expected_scope,fence_epoch,
        writer_ids,control_evidence,test_evidence,settlement_evidence,verified_at,expires_at,operation,retention_key_generation)
      select '${approval}','${project}','${source}',private.launch_import_schema_v1(),${retired?`private.launch_retention_retirement_scope_v1('${r.item}')`:'scope_hash'},(select fence_epoch from private.launch_list_control),
        array['synthetic-writer'],'synthetic-control','synthetic-test','synthetic-settlement',clock_timestamp()-interval '1 second',clock_timestamp()+interval '1 hour','${operation}',coalesce(key_generation,'1')
      from private.launch_retention_items where item_id='${r.item}'`);
    const [generation,epoch,scope] = db.sql(`select i.generation||':'||a.fence_epoch||':'||a.expected_scope from private.launch_retention_items i join private.launch_import_authorizations a on a.approval_ref='${approval}' where i.item_id='${r.item}'`).split(':');
    return {...r,approval,generation,epoch,scope};
  };
  const invoke = (r, marker = false, prefix = "set statement_timeout='5s';") =>
    `set role service_role;${prefix}select public.${marker ? 'retire_launch_marker_v1' : 'minimize_launch_receipt_v1'}('${r.item}',${r.generation},${r.epoch},'${r.scope}','${r.approval}')`;
  const run = (r, marker = false) => JSON.parse(db.sql(invoke(r,marker)));
  const seed = (outcome = 'sent', legacy = false) => {
    const r = {item:randomUUID(),id:randomUUID(),token:randomUUID(),claim:randomUUID(),hash:randomUUID().replaceAll('-','').repeat(2),rawApproval:`synthetic-raw-${randomUUID()}`};
    r.email = `${r.id}@test.invalid`; r.match = launchMatch(r.email,'synthetic-retirement-key');
    db.sql(`insert into private.launch_suppressions values('${r.match}','2026-10-18','unsubscribe');
      insert into private.launch_withdrawal_receipts values('${r.hash}','${r.match}','2026-10-18');
      insert into private.launch_retention_items(item_id,launch_match,key_generation,generation,fence_epoch,state,policy_version,
        reason_code,evidence_ref,scope_hash,withdrawn_at,decided_at)
      select '${r.item}','${r.match}','1',1,fence_epoch,'receipt',1,'eligible','synthetic-withdrawal','${'c'.repeat(64)}','2026-10-18',clock_timestamp() from private.launch_list_control;
      insert into private.launch_retention_delivery(item_id,signup_id,handoff_token,generation,fence_epoch,handoff_at,outcome,settled_at,provider_ref,claim_token,claim_outcome,claim_finished_at)
      select '${r.item}','${r.id}','${r.token}',1,fence_epoch,'2026-09-01','${outcome}',${outcome === 'unknown' ? 'null' : "'2026-09-02'"},
        ${outcome === 'sent' ? "'synthetic-provider'" : 'null'},'${r.claim}','cancelled','2026-09-03' from private.launch_list_control;
      insert into synthetic_test.facts(item_id) values('${r.item}');
      ${legacy ? `insert into private.launch_legacy_provenance(legacy_id,legacy_created_at,signup_id,launch_match,outcome,disposition_id)
        values('${randomUUID()}','2026-01-01',null,'${r.match}','disposed','${r.item}');` : ''}
      insert into private.launch_import_authorizations(approval_ref,project_ref,source_commit,schema_identity,expected_scope,fence_epoch,
        writer_ids,control_evidence,test_evidence,settlement_evidence,verified_at,expires_at,operation,retention_key_generation,consumed_at,post_scope,result_receipt)
      select '${r.rawApproval}','${project}','${source}',private.launch_import_schema_v1(),'${'c'.repeat(64)}',fence_epoch,array['synthetic-writer'],
        'synthetic-control','synthetic-test','synthetic-settlement',clock_timestamp()-interval '1 second',clock_timestamp()+interval '1 hour',
        'retention_raw','1',clock_timestamp(),private.launch_retention_legacy_scope_v1('${r.item}'),
        jsonb_build_object('outcome','disposed','workId','${r.item}','generation','1','reason','eligible','writes',4) from private.launch_list_control`);
    setFields(r);
    return r;
  };
  const finish = (r, state = 'sent', provider = 'synthetic-provider') => call(`select public.finish_launch_delivery_v1('${r.id}','${r.token}','${state}',${provider === null ? 'null' : `'${provider}'`})`);
  try {
    await db.start();
    db.sql('create role anon; create role authenticated; create role service_role bypassrls; grant usage on schema public to anon,authenticated,service_role');
    db.sql(read('waitlist.sql')); db.sql('grant all on public.waitlist to service_role');
    const migrations = ['20261011050938_add_signup_intents.sql','20261013112838_launch_list_lifecycle.sql','20261013125523_launch_list_canonical_cutover.sql',
      '20261018141524_launch_list_retention_state.sql','20261018150520_launch_list_retention_disposition.sql',
      ...readdirSync(new URL('../supabase/migrations/',import.meta.url)).filter(n=>n.endsWith('_launch_list_retention_retirement.sql'))];
    let historical;
    for (const name of migrations) {
      if(name==='20261018150520_launch_list_retention_disposition.sql') {
        db.sql(`update private.launch_list_control set project_ref='${project}',source_commit='${source}',mode='canonical'`);
        const email='historical-pending-through-r@test.invalid',match=launchMatch(email,'synthetic-retirement-key'),hash='d'.repeat(64);
        historical=json(`select public.claim_launch_signup_v2('${email}','direct','${'b'.repeat(64)}','2026-10-11-v1','recorded','${match}')`);
        assert.equal(call(`select public.pin_launch_payload_v1('${historical.id}','${historical.token}','${'c'.repeat(64)}')`),'t');
        assert.equal(call(`select public.authorize_launch_delivery_v1('${historical.id}','${historical.token}',${historical.fenceEpoch},'${hash}')`),'t');
        assert.equal(call(`select public.finish_launch_delivery_v1('${historical.id}','${historical.token}','pending',null)`),'t');
        assert.equal(db.sql(`select handoff_state||':'||settled from private.launch_delivery_guard where signup_id='${historical.id}'`),'pending:true');
        assert.equal(json(`select public.withdraw_launch_v1('${hash}')`).outcome,'withdrawn');
      }
      db.sql(read(`migrations/${name}`));
    }
    t.diagnostic(`Actual fixture: waitlist.sql + ${migrations.join(', ')}`);
    const installed = db.sql("select to_regprocedure('public.minimize_launch_receipt_v1(uuid,bigint,bigint,text,text)') is not null and to_regprocedure('public.retire_launch_marker_v1(uuid,bigint,bigint,text,text)') is not null");
    await t.test('both required service-only retirement operations exist', () => assert.equal(installed,'t','Task4 receipt minimization/marker retirement are required behavior'));
    if (installed !== 't') return;
    await t.test('genuine old pre-D pending remains narrowly correctable under the fence after R',()=>{
      db.sql("update private.launch_list_control set mode='fenced'");
      try {
        assert.equal(call(`select public.finish_launch_delivery_v1('${historical.id}','${randomUUID()}','failed',null)`),'f');
        assert.equal(call(`select public.finish_launch_delivery_v1('${historical.id}','${historical.token}','failed',null)`),'t');
        assert.equal(db.sql(`select s.delivery_state||':'||g.handoff_state||':'||g.settled from public.signup_requests s join private.launch_delivery_guard g on g.signup_id=s.id where s.id='${historical.id}'`),'failed:failed:true');
        assert.equal(call(`select public.finish_launch_delivery_v1('${historical.id}','${historical.token}','sent','contradictory')`),'f');
      } finally {db.sql("update private.launch_list_control set mode='canonical'");}
    });
    await t.test('installation cannot mint field facts, independent coverage, authority or a scheduler',()=>{
      assert.deepEqual(JSON.parse(call(`select private.launch_retention_field_context_v1('${randomUUID()}',1)`)),{state:'unavailable'});
      assert.deepEqual(JSON.parse(call("select private.launch_retention_restore_coverage_v1('missing',null,0)")),{state:'unavailable'});
      assert.equal(db.sql('select count(*) from private.launch_import_authorizations'),'0');
      assert.equal(db.sql("select exists(select 1 from pg_extension where extname='pg_cron')"),'f');
    });
    db.sql(`update private.launch_list_control set project_ref='${project}',source_commit='${source}',mode='canonical';
      create schema synthetic_test; revoke all on schema synthetic_test from public,anon,authenticated,service_role;
      create table synthetic_test.facts(item_id uuid primary key,fields jsonb not null default '{}',holds text[] not null default '{}',refs text[] not null default '{}',
        link_purposes text[] not null default array['usable_link'],suppression_purposes text[] not null default array['current_intake'],
        live_keys jsonb not null default '["1"]',last_send text,link_route_retired boolean not null default false,pause_seconds float8 not null default 0);
      ${db.sql("select replace(pg_get_functiondef('private.launch_retention_context_v1(uuid,bigint)'::regprocedure),'private.launch_retention_context_v1','synthetic_test.base_context')")};
      create or replace function private.launch_retention_field_context_v1(p_item_id uuid,p_generation bigint)
      returns jsonb language plpgsql stable security invoker set search_path=pg_catalog as $fields$
      declare i private.launch_retention_items;c private.launch_list_control;x synthetic_test.facts;a private.launch_import_authorizations;p jsonb;k text;v jsonb;result jsonb:='{}';begin
        select * into i from private.launch_retention_items where item_id=p_item_id and generation=p_generation;
        select * into c from private.launch_list_control;select * into x from synthetic_test.facts where item_id=p_item_id;
        if not found then return '{"state":"unavailable"}';end if;
        if i.state='retired' then select * into a from private.launch_import_authorizations where operation='retention_marker' and consumed_at is null
          and expected_scope=private.launch_retention_retirement_scope_v1(p_item_id) and fence_epoch=c.fence_epoch limit 1;end if;
        if x.pause_seconds>0 then perform pg_sleep(x.pause_seconds);end if;
        p:=jsonb_build_object('state','verified','evidenceRef','synthetic-field','generation',i.generation::text,'epoch',case when i.state='retired' then c.fence_epoch else i.fence_epoch end::text,
          'scope',jsonb_build_object('state','verified','projectRef',c.project_ref,'sourceCommit',c.source_commit,'schemaIdentity',private.launch_import_schema_v1(),
          'keyGeneration',coalesce(i.key_generation,a.retention_key_generation),'scopeHash',coalesce(i.scope_hash,a.expected_scope)));
        for k,v in select * from jsonb_each(x.fields) loop
          result:=result||jsonb_build_object(k,case when v ? 'rawProof' then v->'rawProof' when jsonb_typeof(v)='array' then p||jsonb_build_object('purposes',v) else v end);
        end loop;return result;
      end $fields$;
      create or replace function private.launch_retention_context_v1(p_item_id uuid,p_generation bigint)
      returns jsonb language plpgsql stable security invoker set search_path=pg_catalog as $facts$
      declare f jsonb;p jsonb;x synthetic_test.facts;n text;i private.launch_retention_items;begin
        f:=synthetic_test.base_context(p_item_id,p_generation);select * into x from synthetic_test.facts where item_id=p_item_id;
        if not found then return '{"state":"unavailable"}';end if;
        select * into i from private.launch_retention_items where item_id=p_item_id;
        if i.state='retired' then
          p:=private.launch_retention_field_context_v1(p_item_id,p_generation)->'launch_retention_items.item_id';
          f:=jsonb_build_object('lane','retired','intent','launch','consent','unknown','completed',false,'withdrawnAt',null,
            'generation',p->>'generation','epoch',p->>'epoch','scope',p->'scope','withdrawal',p||'{"status":"withdrawn","at":null}',
            'fieldPurposes',private.launch_retention_field_context_v1(p_item_id,p_generation));
        elsif f->>'state'='unavailable' then return '{"state":"unavailable"}';end if;p:=f->'withdrawal';
        foreach n in array array['necessity','references','hold','delivery','link','suppression','restore'] loop
          f:=jsonb_set(f,array[n],(p-array['status','at'])||jsonb_build_object('purposes',case n when 'hold' then to_jsonb(x.holds)
            when 'references' then to_jsonb(x.refs) when 'link' then to_jsonb(x.link_purposes) when 'suppression' then to_jsonb(x.suppression_purposes) else '[]'::jsonb end));
        end loop;
        f:=jsonb_set(f,'{delivery}',f->'delivery'||'{"outcome":"sent","compactCovered":true}');
        f:=jsonb_set(f,'{link}',f->'link'||jsonb_build_object('covered',true,'lastActualSendAt',x.last_send,'lateHandoffClosed',true,'routeRetired',x.link_route_retired));
        f:=jsonb_set(f,'{suppression}',f->'suppression'||jsonb_build_object('covered',true,'liveKeyGenerations',x.live_keys));
        return jsonb_set(f,'{restore}',f->'restore'||'{"independent":true,"current":true}');
      end $facts$;
      update private.launch_write_fence_contract set definition_hash=private.launch_write_fence_fingerprint_v1()`);
    await t.test('real old import and non-restore mode caller work on R without new proof prerequisites; real context commits cleanly',()=>{
      assert.equal(db.sql(`begin;update private.launch_list_control set mode='transition';insert into public.waitlist(email) values('old-import-on-r@test.invalid');
        update private.launch_list_control set mode='fenced';set local role service_role;
        do $compat$ declare inv jsonb;out jsonb;target text;op text;n integer;begin
          for n in 1..2 loop
            inv:=public.inventory_launch_legacy_v1('synthetic-retirement-key');op:=case when n=1 then 'import' else 'mode' end;target:=case when n=2 then 'canonical' end;
            insert into private.launch_import_authorizations(approval_ref,project_ref,source_commit,schema_identity,expected_scope,fence_epoch,writer_ids,
              control_evidence,test_evidence,settlement_evidence,verified_at,expires_at,operation,target_mode)
            values('synthetic-old-r-'||n,'${project}','${source}',inv->>'schemaIdentity',inv->>'scopeHash',(inv->>'fenceEpoch')::bigint,array['synthetic-writer'],
              'synthetic-control','synthetic-test','synthetic-settlement',clock_timestamp()-interval '1 second',clock_timestamp()+interval '1 hour',op,target);
            if n=1 then
              out:=public.reconcile_launch_legacy_v1(inv->>'scopeHash','synthetic-retirement-key',true);
              if out->>'outcome' is distinct from 'reconciled' or out->>'disposalAllowed' is distinct from 'false' then raise exception 'old import incompatible';end if;
            else
              out:=public.set_launch_mode_v1((inv->>'fenceEpoch')::bigint,target,inv->>'scopeHash','synthetic-retirement-key');
              if out->>'outcome' is distinct from 'mode_changed' then raise exception 'old mode incompatible';end if;
            end if;
          end loop;
          if exists(select 1 from private.launch_import_context) then raise exception 'import context leaked';end if;
          if not exists(select 1 from public.signup_requests where email='old-import-on-r@test.invalid' and consent_status='unknown' and delivery_state='review') then raise exception 'unknown consent changed';end if;
        end $compat$;select private.launch_write_fence_ready_v1();rollback`),'t');
    });
    await t.test('ordinary roles denied; no service state writes/default issuer; new caller deadlines refuse before mutation', () => {
      for (const role of ['anon','authenticated']) for (const fn of ['minimize_launch_receipt_v1','retire_launch_marker_v1'])
        assert.throws(()=>db.sql(`set role ${role};select public.${fn}(null,null,null,null,null)`),/permission denied/);
      for (const table of ['launch_retention_items','launch_retention_delivery'])
        assert.throws(()=>call(`update private.${table} set generation=generation+1`),/permission denied/);
      const r=prepare(seed()),before=snapshot();
      for (const timeout of ['0','5001ms']) {
        const out=JSON.parse(db.sql(invoke(r,false,`set statement_timeout='${timeout}';`)));
        assert.equal(out.outcome,'refused');assert.equal(out.writes,0);assert.equal(snapshot(),before);
      }
      assert.equal(db.sql('show statement_timeout'),'0');
      assert.throws(()=>db.sql(`begin;update private.launch_import_authorizations set operation='mode',target_mode=null,retention_key_generation=null where approval_ref='${r.approval}';rollback`),/constraint/,'new nullable fields cannot open old authority CHECK NULL escapes');
    });
    await t.test('unknown nonraw consent is not fabricated; provider retires independently while optional timestamps/claim remain', () => {
      const r=seed();assert.equal(finish(r),'t');
      assert.equal(JSON.parse(db.sql(`select private.launch_retention_context_v1('${r.item}',1)`)).consent,'unknown');
      setFields(r,{'launch_retention_delivery.provider_ref':[]});
      const x=prepare(r),out=run(x);
      assert.equal(out.outcome,'minimized');assert.ok(out.writes>0);
      assert.equal(db.sql(`select provider_ref is null and handoff_at is not null and settled_at is not null and claim_token is not null and outcome='sent' from private.launch_retention_delivery where item_id='${r.item}'`),'t');
      assert.equal(finish(r),'f','lost provider comparison cannot be acknowledged or reinflated');
      const after=snapshot();assert.equal(run(x).outcome,'refused');assert.equal(snapshot(),after);
      assert.equal(db.sql(`select count(*) from public.signup_requests where id='${r.id}'`),'0');
      assert.equal(json(`select public.withdraw_launch_v1('${r.hash}')`).outcome,'already_withdrawn');
      assert.equal(json(`select public.claim_launch_signup_v2('${r.email}','direct','${'e'.repeat(64)}','2026-10-11-v1','recorded','${r.match}')`).suppressed,true);
    });
    for (const field of deliveryOptional) await t.test(`independent compact ${field} end does not erase other facts`,()=>{
      const r=seed();setFields(r,{[`launch_retention_delivery.${field}`]:[]});const x=prepare(r),out=run(x);
      assert.equal(out.outcome,'minimized');assert.ok(out.writes>0);
      assert.equal(db.sql(`select ${field} is null from private.launch_retention_delivery where item_id='${r.item}'`),'t');
      assert.equal(db.sql(`select outcome from private.launch_retention_delivery where item_id='${r.item}'`),'sent');
      assert.throws(()=>db.sql(`update private.launch_retention_delivery set generation=(select generation from private.launch_retention_items where item_id='${r.item}'),${field}=${field==='provider_ref'?"'reinflate'":field==='claim_token'?`'${randomUUID()}'`:field==='claim_outcome'?"'cancelled'":"clock_timestamp()"} where item_id='${r.item}'`),/retention|constraint/);
    });
    await t.test('retiring claim outcome does not make the independently retained claim identity/time mutable',()=>{
      const r=seed();setFields(r,{'launch_retention_delivery.claim_outcome':[]});assert.equal(run(prepare(r)).outcome,'minimized');
      const before=snapshot();
      for(const assignment of [`claim_token='${randomUUID()}'`,"claim_finished_at='2026-09-04'"])
        assert.throws(()=>db.sql(`update private.launch_retention_delivery set generation=(select generation from private.launch_retention_items where item_id='${r.item}'),${assignment} where item_id='${r.item}'`),/retention|constraint/);
      assert.equal(snapshot(),before);
    });
    await t.test('partial review has truthful positive writes, advances scope, and consumed authority never recounts',()=>{
      const r=seed();setFields(r,{'launch_retention_delivery.provider_ref':[], 'launch_retention_delivery.settled_at':{state:'unavailable'}});
      const x=prepare(r),out=run(x);assert.equal(out.outcome,'review');assert.equal(out.reason,'unavailable');assert.equal(out.writes,3,'one receipt row, one generation update and one authority consumption');
      assert.equal(out.generation,(BigInt(x.generation)+1n).toString());
      assert.equal(db.sql(`select provider_ref is null and settled_at is not null from private.launch_retention_delivery where item_id='${r.item}'`),'t');
      const after=snapshot();const replay=run(x);assert.equal(replay.outcome,'refused');assert.equal(replay.writes,0);assert.equal(snapshot(),after);
    });
    for(const bad of [{state:'verified',purposes:[]}, {state:'unavailable'}, [], true]) await t.test(`malformed/missing field evidence ${JSON.stringify(bad)} cannot erase`,()=>{
      const r=seed();setFields(r,{'launch_retention_delivery.provider_ref':{rawProof:bad}});const x=prepare(r),before=snapshot(),out=run(x);
      assert.equal(out.outcome,'review');assert.equal(out.writes,0);assert.equal(snapshot(),before);
    });
    for(const part of ['generation','epoch','projectRef','sourceCommit','schemaIdentity','keyGeneration','scopeHash']) await t.test(`stale field ${part} binding retains the affected field`,()=>{
      const r=seed();setFields(r,{'launch_retention_delivery.provider_ref':[]});const x=prepare(r);
      const proof=JSON.parse(db.sql(`select private.launch_retention_field_context_v1('${r.item}',${x.generation})->'launch_retention_delivery.provider_ref'`));
      if(part==='generation'||part==='epoch')proof[part]='999';
      else proof.scope[part]=part==='keyGeneration'?'9':part==='projectRef'?'z'.repeat(20):'f'.repeat(part==='sourceCommit'?40:64);
      setFields(r,{'launch_retention_delivery.provider_ref':{rawProof:proof}});
      const before=snapshot(),out=run(x);assert.equal(out.outcome,'review');assert.equal(out.reason,'scope_mismatch');assert.equal(out.writes,0);assert.equal(snapshot(),before);
    });
    for(const field of ['provider_ref','settled_at','claim_finished_at']) await t.test(`item-wide hold and reference protect ${field}`,()=>{
      const r=seed();setFields(r,{[`launch_retention_delivery.${field}`]:[]});
      for(const [column,purpose] of [['holds','legal_hold'],['refs','delivery_reference']]) {
        db.sql(`update synthetic_test.facts set ${column}=array['${purpose}'] where item_id='${r.item}'`);
        const x=prepare(r),before=snapshot(),out=run(x);assert.equal(out.outcome,'review');assert.equal(out.writes,0);assert.equal(snapshot(),before);
        db.sql(`update synthetic_test.facts set ${column}='{}' where item_id='${r.item}'`);
      }
    });
    await t.test('unknown handoff cannot disappear or become settled even under empty leaf purposes',()=>{
      const r=seed('unknown');setFields(r,{},[]);const x=prepare(r),out=run(x);assert.equal(out.outcome,'review');assert.equal(out.reason,'unknown_delivery');
      assert.equal(db.sql(`select outcome||':'||(handoff_at is not null)::text||':'||(settled_at is null)::text from private.launch_retention_delivery where item_id='${r.item}'`),'unknown:true:true');
      assert.equal(finish(r,'failed',null),'t');
    });
    for(const field of ['legacy_created_at','launch_match']) await t.test(`obsolete provenance ${field} can end while UUID/disposition linkage stays`,()=>{
      const r=seed('sent',true);setFields(r,{[`launch_legacy_provenance.${field}`]:[]});const out=run(prepare(r));
      assert.equal(out.outcome,'minimized');
      assert.equal(db.sql(`select ${field} is null and legacy_id is not null and disposition_id='${r.item}' from private.launch_legacy_provenance where disposition_id='${r.item}'`),'t');
      assert.equal(db.sql('select private.launch_retention_identity_ready_v1()'),'t');
    });
    await t.test('provenance row cohort ends only when all UUID/mapping/link purposes end; drift is not excused',()=>{
      const r=seed('sent',true);setFields(r,Object.fromEntries(provenance.map(n=>[`launch_legacy_provenance.${n}`,[]])));
      const out=run(prepare(r));assert.equal(out.outcome,'minimized');
      assert.equal(db.sql(`select count(*) from private.launch_legacy_provenance where disposition_id='${r.item}'`),'0');
      assert.equal(db.sql('select private.launch_retention_identity_ready_v1()'),'t');
    });
    await t.test('authority expanded evidence ends independently on the SAME consumed row; expiry/revocation never supplies an end proof',()=>{
      const r=seed();db.sql(`update private.launch_import_authorizations set revoked_at=clock_timestamp(),verified_at='2026-01-01',expires_at='2026-01-02' where approval_ref='${r.rawApproval}'`);
      const x=prepare(r),before=snapshot();assert.equal(run(x).outcome,'retained');assert.equal(snapshot(),before);
      setFields(r,Object.fromEntries(authorityOptional.map(n=>[`launch_import_authorizations.${n}`,[]])));
      const out=run(x);assert.equal(out.outcome,'minimized');
      assert.equal(db.sql(`select writer_ids is null and control_evidence is null and expected_scope is null and result_receipt is null and consumed_at is not null and operation='retention_raw' and approval_ref='${r.rawApproval}' from private.launch_import_authorizations where approval_ref='${r.rawApproval}'`),'t');
      assert.equal(db.sql('select private.launch_retention_identity_ready_v1()'),'t');
      assert.throws(()=>db.sql(`update private.launch_import_authorizations set consumed_at=null where approval_ref='${r.rawApproval}'`),/retention|constraint/);
    });
    await t.test('independently owned restore-authority references end separately on the same consumed row, not on expiry',()=>{
      const r=seed(),ref=`synthetic-owned-restore-${randomUUID()}`;
      // Owner-only synthetic association of a single-owner historical receipt.
      // Never infer this association for an unknown or shared import/restore.
      db.sql(`insert into private.launch_import_authorizations(approval_ref,project_ref,source_commit,schema_identity,expected_scope,fence_epoch,
        writer_ids,control_evidence,test_evidence,settlement_evidence,verified_at,expires_at,operation,target_mode,restore_snapshot_ref,restore_replay_ref,
        restore_coverage_ref,consumed_at,post_scope,result_receipt,retention_item_id)
        select '${ref}','${project}','${source}',private.launch_import_schema_v1(),'${'c'.repeat(64)}',fence_epoch,array['synthetic-writer'],
          'synthetic-control','synthetic-test','synthetic-settlement','2026-01-01','2026-01-02','restore','canonical',
          'synthetic-old-snapshot','synthetic-old-replay','synthetic-old-coverage','2026-01-01','${'c'.repeat(64)}','{"operation":"restore","outcome":"mode_changed"}','${r.item}' from private.launch_list_control`);
      setFields(r,{'launch_import_authorizations.restore_snapshot_ref':[]});const out=run(prepare(r));assert.equal(out.outcome,'minimized');
      assert.equal(db.sql(`select restore_snapshot_ref is null and restore_replay_ref='synthetic-old-replay' and restore_coverage_ref='synthetic-old-coverage'
        and operation='restore' and consumed_at is not null and retention_item_id='${r.item}' from private.launch_import_authorizations where approval_ref='${ref}'`),'t');
    });
    await t.test('actual live transaction blocks context retirement; committed orphan is removed under locks without PID-age inference',async()=>{
      const r=seed();const holder=db.asyncSql("set application_name='retirement-live-context';begin;select pg_current_xact_id();select pg_sleep(2);commit");
      try {
        await observe('retirement-live-context');
        const [pid,xid]=db.sql("select pid||':'||backend_xid from pg_stat_activity where application_name='retirement-live-context'").split(':');
        db.sql(`insert into private.launch_import_context(transaction_id,backend_pid,approval_ref,expected_scope,fence_epoch,launch_match,owner_postmaster_start,owner_backend_start)
          values('${xid}',${pid},'${r.rawApproval}','${'c'.repeat(64)}',0,'${r.match}',pg_postmaster_start_time(),(select backend_start from pg_stat_activity where pid=${pid}))`);
        setFields(r,Object.fromEntries(contextKey.map(n=>[`launch_import_context.${n}`,[]])));
        const out=run(prepare(r));assert.equal(out.outcome,'review');assert.equal(out.writes,0);
        assert.equal(db.sql(`select count(*) from private.launch_import_context where launch_match='${r.match}'`),'1');
      } finally {await holder;}
      const out=run(prepare(r));assert.equal(out.outcome,'minimized');
      assert.equal(db.sql(`select count(*) from private.launch_import_context where launch_match='${r.match}'`),'0');
    });
    await t.test('unknown restored context provenance is not proved dead by a coincidentally committed local xid or absent PID',()=>{
      const r=seed(),xid=db.sql('select pg_current_xact_id()');
      db.sql(`insert into private.launch_import_context(transaction_id,backend_pid,approval_ref,expected_scope,fence_epoch,launch_match)
        values('${xid}',2147483647,'${r.rawApproval}','${'c'.repeat(64)}',0,'${r.match}')`);
      setFields(r,Object.fromEntries(contextKey.map(n=>[`launch_import_context.${n}`,[]])));
      const x=prepare(r),before=snapshot(),out=run(x);assert.equal(out.outcome,'review');assert.equal(out.writes,0);assert.equal(snapshot(),before);
    });
    await t.test('zero legacy rows does not retire suppression while current intake is live; old key generations also stay',()=>{
      const r=seed();setFields(r,Object.fromEntries(['launch_match','withdrawn_at','basis'].map(n=>[`launch_suppressions.${n}`,[]])));
      db.sql(`update synthetic_test.facts set live_keys='["1","2"]' where item_id='${r.item}'`);
      const before=db.sql('select count(*) from private.launch_suppressions');
      const out=run(prepare(r,'retention_marker'),true);assert.equal(out.outcome,'refused');
      assert.equal(db.sql('select count(*) from private.launch_suppressions'),before);
      assert.equal(db.sql('select count(*) from public.waitlist'),'0');
    });
    await t.test('ended old link retires independently while canonical current intake still needs suppression',()=>{
      const r=seed();setFields(r,Object.fromEntries(['token_hash','launch_match','withdrawn_at'].map(n=>[`launch_withdrawal_receipts.${n}`,[]])));
      db.sql(`update synthetic_test.facts set link_purposes='{}',last_send='2026-01-01T00:00:00.000Z',link_route_retired=true where item_id='${r.item}'`);
      const out=run(prepare(r,'retention_marker'),true);assert.equal(out.outcome,'minimized');assert.ok(out.writes>0);
      assert.equal(db.sql(`select count(*) from private.launch_withdrawal_receipts where launch_match='${r.match}'`),'0');
      assert.equal(db.sql(`select count(*) from private.launch_suppressions where launch_match='${r.match}'`),'1');
      assert.equal(json(`select public.claim_launch_signup_v2('${r.email}','direct','${'e'.repeat(64)}','2026-10-11-v1','recorded','${r.match}')`).suppressed,true);
    });
    await t.test('locally unresolved handoff prevents link retirement despite a contradictory claimed closed late handoff',()=>{
      const r=seed('unknown');setFields(r,Object.fromEntries(['token_hash','launch_match','withdrawn_at'].map(n=>[`launch_withdrawal_receipts.${n}`,[]])));
      db.sql(`update synthetic_test.facts set link_purposes='{}',last_send='2026-01-01T00:00:00.000Z',link_route_retired=true where item_id='${r.item}'`);
      const x=prepare(r,'retention_marker'),before=snapshot(),out=run(x,true);
      assert.equal(out.outcome,'review');assert.equal(out.reason,'unknown_delivery');assert.equal(out.writes,0);assert.equal(snapshot(),before);
      assert.equal(json(`select public.withdraw_launch_v1('${r.hash}')`).outcome,'already_withdrawn');
    });
    await t.test('already-retired lookup leaves do not block independently eligible authority evidence',()=>{
      const r=seed();setFields(r,Object.fromEntries(['token_hash','launch_match','withdrawn_at'].map(n=>[`launch_withdrawal_receipts.${n}`,[]])));
      db.sql(`update synthetic_test.facts set link_purposes='{}',last_send='2026-01-01T00:00:00.000Z',link_route_retired=true where item_id='${r.item}'`);
      assert.equal(run(prepare(r,'retention_marker'),true).outcome,'minimized');
      setFields(r,{'launch_import_authorizations.control_evidence':[]});
      db.sql(`update synthetic_test.facts set fields=fields-array['launch_withdrawal_receipts.token_hash','launch_withdrawal_receipts.launch_match','launch_withdrawal_receipts.withdrawn_at'] where item_id='${r.item}'`);
      const out=run(prepare(r,'retention_marker'),true);assert.equal(out.outcome,'minimized');assert.ok(out.writes>0);
      assert.equal(db.sql(`select count(*) from private.launch_withdrawal_receipts where launch_match='${r.match}'`),'0');
    });
    for(const last of [null,new Date(Date.now()-7*86400000).toISOString()]) await t.test(`usable old link with last actual send ${last===null?'unknown':'under 30 days'} survives`,()=>{
      const r=seed();setFields(r,Object.fromEntries(['token_hash','launch_match','withdrawn_at'].map(n=>[`launch_withdrawal_receipts.${n}`,[]])));
      db.sql(`update synthetic_test.facts set link_purposes='{}',last_send=${last===null?'null':`'${last}'`},link_route_retired=true where item_id='${r.item}'`);
      const x=prepare(r,'retention_marker'),before=snapshot(),out=run(x,true);assert.equal(out.outcome,last===null?'review':'retained');assert.equal(out.writes,0);assert.equal(snapshot(),before);
      assert.equal(json(`select public.withdraw_launch_v1('${r.hash}')`).outcome,'already_withdrawn');
    });
    await t.test('real pre-command cancellation after a write rolls back fields, authority and generation and releases resources inside open transaction',async()=>{
      const r=seed();setFields(r,{'launch_retention_delivery.provider_ref':[]});
      db.sql(`create sequence synthetic_test.cancel_hits;
        create function synthetic_test.pause_erasure() returns trigger language plpgsql as $p$ begin perform nextval('synthetic_test.cancel_hits');perform pg_sleep(5.5);return new;end $p$;
        create trigger synthetic_cancel after update on private.launch_retention_delivery for each row execute function synthetic_test.pause_erasure()`);
      const x=prepare(r),before=snapshot();
      const pending=db.asyncSql(`set application_name='retirement-cancel';begin;${invoke(x,false,"set statement_timeout='500ms';")};reset role;set statement_timeout='5s';select pg_sleep(1) /* after_cancel */;commit`);
      try {
        await observe('retirement-cancel',"wait_event='PgSleep' and query like '%after_cancel%'");
        assert.equal(db.sql('select is_called from synthetic_test.cancel_hits'),'t');
        assert.equal(db.sql("select pg_try_advisory_xact_lock(hashtextextended('launch-list-fence',0))"),'t');
        assert.doesNotThrow(()=>db.sql(`begin;select item_id from private.launch_retention_items where item_id='${r.item}' for update nowait;select approval_ref from private.launch_import_authorizations where approval_ref='${x.approval}' for update nowait;rollback`));
        assert.equal(snapshot(),before);
      } finally {const out=JSON.parse(await pending);assert.equal(out.outcome,'refused');assert.equal(out.writes,0);
        db.sql('drop trigger synthetic_cancel on private.launch_retention_delivery;drop function synthetic_test.pause_erasure();drop sequence synthetic_test.cancel_hits');}
    });
    await t.test('owning lock contention refuses without serializing same-address beta claim/finish',async()=>{
      const r=seed();setFields(r,{'launch_retention_delivery.provider_ref':[]});const x=prepare(r),before=snapshot();
      const holder=db.asyncSql(`set application_name='retirement-row-holder';begin;select item_id from private.launch_retention_items where item_id='${r.item}' for update;select pg_sleep(2);commit`);
      let pending;
      try {
        await observe('retirement-row-holder');pending=db.asyncSql(`set application_name='retirement-wait';${invoke(x)}`);
        await observe('retirement-wait',"wait_event_type='Lock'");
        const beta=JSON.parse(await db.asyncSql(`set statement_timeout='600ms';set role service_role;select public.claim_signup_v1('${r.email}','beta','android','direct','${'f'.repeat(64)}')`));
        assert.equal(beta.send,true);
        assert.equal(db.sql("select exists(select 1 from pg_stat_activity where application_name='retirement-wait' and wait_event_type='Lock')"),'t');
        assert.equal(await db.asyncSql(`set statement_timeout='600ms';set role service_role;select public.finish_signup_delivery_v1('${beta.id}','${beta.token}','sent','synthetic-beta')`),'t');
      } finally {await holder;if(pending){const out=JSON.parse(await pending);assert.equal(out.outcome,'refused');assert.equal(out.writes,0);}}
      assert.equal(db.sql(`select provider_ref from private.launch_retention_delivery where item_id='${r.item}'`),'synthetic-provider');
      assert.notEqual(snapshot(),before,'only legitimate beta activity changed');
    });
    for(const actor of ['withdrawal','claim','finish']) await t.test(`field minimization versus ${actor} uses the outer fence and cannot revive erased facts`,async()=>{
      const r=seed();setFields(r,{'launch_retention_delivery.provider_ref':[]});const x=prepare(r);
      const worker=db.asyncSql(`set application_name='field-${actor}';begin;${invoke(x)};select pg_sleep(0.8);commit`);
      try {
        await observe(`field-${actor}`);
        const sql=actor==='withdrawal'?`select public.withdraw_launch_v1('${r.hash}')`:actor==='finish'?`select public.finish_launch_delivery_v1('${r.id}','${r.token}','sent','synthetic-provider')`:
          `select public.claim_launch_signup_v2('${r.email}','direct','${'e'.repeat(64)}','2026-10-11-v1','recorded','${r.match}')`;
        const competitor=db.asyncSql(`set application_name='competing-field-${actor}';set statement_timeout='5s';set role service_role;${sql}`);
        await observe(`competing-field-${actor}`,"wait_event_type='Lock'");
        assert.equal(JSON.parse(await worker).outcome,'minimized');const out=await competitor;
        if(actor==='withdrawal')assert.equal(JSON.parse(out).outcome,'already_withdrawn');
        else if(actor==='claim')assert.equal(JSON.parse(out).suppressed,true);else assert.equal(out,'f');
        assert.equal(db.sql(`select provider_ref is null and outcome='sent' from private.launch_retention_delivery where item_id='${r.item}'`),'t');
      } finally {await worker;}
    });
    for(const actor of ['hold','reference','epoch','revocation']) await t.test(`committed ${actor} invalidates the earlier field assessment before erasure`,async()=>{
      const r=seed();setFields(r,{'launch_retention_delivery.provider_ref':[]});const x=prepare(r);
      const change=actor==='hold'?`update synthetic_test.facts set holds=array['legal_hold'] where item_id='${r.item}';update private.launch_retention_items set generation=generation+1 where item_id='${r.item}'`:
        actor==='reference'?`update synthetic_test.facts set refs=array['delivery_reference'] where item_id='${r.item}';update private.launch_retention_items set generation=generation+1 where item_id='${r.item}'`:
        actor==='epoch'?`update private.launch_list_control set fence_epoch=fence_epoch+1`:
        `update private.launch_import_authorizations set revoked_at=clock_timestamp() where approval_ref='${x.approval}'`;
      const writer=db.asyncSql(`set application_name='field-change-${actor}';begin;select pg_advisory_xact_lock(hashtextextended('launch-list-fence',0));${change};select pg_sleep(0.5);commit`);
      try {
        await observe(`field-change-${actor}`);const pending=db.asyncSql(invoke(x));const out=JSON.parse(await pending);assert.equal(out.outcome,'refused');assert.equal(out.writes,0);
        assert.equal(db.sql(`select provider_ref from private.launch_retention_delivery where item_id='${r.item}'`),'synthetic-provider');
        assert.equal(db.sql(`select consumed_at is null from private.launch_import_authorizations where approval_ref='${x.approval}'`),'t');
      } finally {await writer;}
    });
    await t.test('an invalidated consumed-operation marker can end; the original authority payload cannot replay afterward',()=>{
      const r=seed();setFields(r,Object.fromEntries([...authorityOptional,...authorityKey].map(n=>[`launch_import_authorizations.${n}`,[]])));
      // The preceding epoch race supplies a real monotonic epoch advance; this
      // raw marker is seeded at that current epoch, so first prove it must stay.
      const first=prepare(r);run(first);
      const original=db.sql(`select to_jsonb(a) from private.launch_import_authorizations a where approval_ref='${first.approval}'`);
      assert.equal(db.sql(`select count(*) from private.launch_import_authorizations where approval_ref='${r.rawApproval}'`),'1');
      db.sql('update private.launch_list_control set fence_epoch=fence_epoch+1');
      const second=prepare(r),out=run(second);assert.ok(out.writes>0);
      assert.equal(db.sql(`select count(*) from private.launch_import_authorizations where approval_ref='${r.rawApproval}'`),'0');
      assert.equal(db.sql(`select count(*) from private.launch_import_authorizations where approval_ref='${first.approval}'`),'0');
      const replay=JSON.parse(original);replay.minimized_fields=[];
      db.sql(`insert into private.launch_import_authorizations select (jsonb_populate_record(null::private.launch_import_authorizations,'${JSON.stringify(replay).replaceAll("'","''")}'::jsonb)).*`);
      const before=snapshot();
      const old=json(`select public.minimize_launch_receipt_v1('${r.item}',${first.generation},${first.epoch},'${first.scope}','${first.approval}')`);
      assert.equal(old.outcome,'refused');assert.equal(old.writes,0);assert.equal(snapshot(),before);
    });
    await t.test('fenced marker ends keep older live keys; link, suppression and ledger have separate ends',()=>{
      const r=seed();setFields(r,Object.fromEntries([...deliveryOptional,...deliveryKey].map(n=>[`launch_retention_delivery.${n}`,[]])));
      assert.equal(run(prepare(r)).outcome,'minimized');
      assert.equal(db.sql(`select count(*) from private.launch_retention_delivery where item_id='${r.item}'`),'0');
      db.sql("update private.launch_list_control set mode='fenced'");
      try {
        setFields(r,Object.fromEntries(markerPaths.map(n=>[n,[]])));
        db.sql(`update synthetic_test.facts set link_purposes='{}',suppression_purposes='{}',live_keys='["1","2"]',
          last_send='2026-01-01T00:00:00.000Z',link_route_retired=true where item_id='${r.item}'`);
        const x=prepare(r,'retention_marker'),out=run(x,true);assert.equal(out.outcome,'minimized');
        assert.equal(db.sql(`select count(*) from private.launch_withdrawal_receipts where launch_match='${r.match}'`),'0');
        assert.equal(db.sql(`select count(*) from private.launch_suppressions where launch_match='${r.match}'`),'1','live older key representation still protects suppression');
        assert.equal(db.sql(`select count(*) from private.launch_retention_items where item_id='${r.item}'`),'1');
        db.sql(`update synthetic_test.facts set live_keys='[]' where item_id='${r.item}'`);
        const y=prepare(r,'retention_marker');assert.equal(run(y,true).outcome,'retired');
        assert.equal(db.sql(`select count(*) from private.launch_suppressions where launch_match='${r.match}'`),'0');
        assert.equal(run(y,true).outcome,'refused');
      } finally {db.sql("update private.launch_list_control set mode='canonical'");}
    });
    await t.test('expiry, unknown actual send, and usable route never retire the link even while intake is fenced',()=>{
      db.sql("update private.launch_list_control set mode='fenced'");
      try {
        for(const [last,usable] of [[null,false],[new Date(Date.now()-7*86400000).toISOString(),false],['2026-01-01T00:00:00.000Z',true]]) {
          // Seed under canonical owner load, restore the fence before each RPC.
          db.sql("update private.launch_list_control set mode='canonical'");const r=seed();db.sql("update private.launch_list_control set mode='fenced'");
          setFields(r,Object.fromEntries(['token_hash','launch_match','withdrawn_at'].map(n=>[`launch_withdrawal_receipts.${n}`,[]])));
          db.sql(`update synthetic_test.facts set link_purposes=${usable?"array['usable_link']":"'{}'"},
            last_send=${last===null?'null':`'${last}'`},link_route_retired=${!usable} where item_id='${r.item}'`);
          const x=prepare(r,'retention_marker'),before=snapshot(),out=run(x,true);assert.equal(out.outcome,last===null?'review':'retained');assert.equal(out.writes,0);assert.equal(snapshot(),before);
          assert.equal(json(`select public.withdraw_launch_v1('${r.hash}')`).outcome,'already_withdrawn');
        }
      } finally {db.sql("update private.launch_list_control set mode='canonical'");}
    });
    await t.test('invalid live-key projection cannot stand in for all older key generations having ended',()=>{
      const r=seed();setFields(r,Object.fromEntries([...deliveryOptional,...deliveryKey].map(n=>[`launch_retention_delivery.${n}`,[]])));run(prepare(r));
      db.sql("update private.launch_list_control set mode='fenced'");
      try {
        setFields(r,Object.fromEntries(markerPaths.map(n=>[n,[]])));
        db.sql(`update synthetic_test.facts set link_purposes='{}',suppression_purposes='{}',live_keys='[1]',last_send='2026-01-01T00:00:00.000Z',link_route_retired=true where item_id='${r.item}'`);
        run(prepare(r,'retention_marker'),true);
        assert.equal(db.sql(`select count(*) from private.launch_suppressions where launch_match='${r.match}'`),'1');
      } finally {db.sql("update private.launch_list_control set mode='canonical'");}
    });
    for(const field of ['policy_version','reason_code','decided_at']) await t.test(`independent optional ledger ${field} end preserves unrelated decision facts`,()=>{
      const r=seed();setFields(r,{[`launch_retention_items.${field}`]:[]});
      const x=prepare(r,'retention_marker'),before=JSON.parse(db.sql(`select to_jsonb(i) from private.launch_retention_items i where item_id='${r.item}'`));
      const out=run(x,true);assert.equal(out.outcome,'minimized');assert.equal(out.writes,2);
      const after=JSON.parse(db.sql(`select to_jsonb(i) from private.launch_retention_items i where item_id='${r.item}'`));
      assert.equal(after[field],null);assert.deepEqual(after.minimized_fields,[field]);assert.equal(after.generation,before.generation+1);
      for(const name of ['policy_version','reason_code','decided_at'].filter(n=>n!==field))assert.equal(after[name],before[name]);
      assert.equal(run(x,true).writes,0);
    });
    await t.test('matching facts retire while consumed-operation markers remain, then every ended cohort can close without a permanent self-created receipt',()=>{
      const r=seed();setFields(r,Object.fromEntries([...deliveryOptional,...deliveryKey].map(n=>[`launch_retention_delivery.${n}`,[]])));run(prepare(r));
      db.sql("update private.launch_list_control set mode='fenced'");
      try {
        setFields(r,Object.fromEntries(markerPaths.filter(n=>!['item_id','generation','fence_epoch','state'].some(k=>n===`launch_retention_items.${k}`)).map(n=>[n,[]])));
        db.sql(`update synthetic_test.facts set link_purposes='{}',suppression_purposes='{}',live_keys='[]',last_send='2026-01-01T00:00:00.000Z',link_route_retired=true where item_id='${r.item}'`);
        const x=prepare(r,'retention_marker'),out=run(x,true);assert.equal(out.outcome,'retired');
        assert.equal(db.sql(`select state='retired' and launch_match is null and key_generation is null and withdrawn_at is null and scope_hash is null and evidence_ref is null and decided_at is null and reason_code is null and policy_version is null from private.launch_retention_items where item_id='${r.item}'`),'t');
        assert.ok(Number(db.sql(`select count(*) from private.launch_import_authorizations where retention_item_id='${r.item}'`))>0);
        db.sql('update private.launch_list_control set fence_epoch=fence_epoch+1');setFields(r,{},[]);
        const y=prepare(r,'retention_marker'),original=db.sql(`select to_jsonb(a) from private.launch_import_authorizations a where approval_ref='${y.approval}'`),closed=run(y,true);
        assert.equal(closed.outcome,'retired');assert.ok(closed.writes>0);
        assert.equal(db.sql(`select count(*) from private.launch_retention_items where item_id='${r.item}'`),'0');
        assert.equal(db.sql(`select count(*) from private.launch_import_authorizations where retention_item_id='${r.item}' or approval_ref='${y.approval}'`),'0');
        assert.equal(run(y,true).outcome,'refused');
        db.sql(`insert into private.launch_import_authorizations select (jsonb_populate_record(null::private.launch_import_authorizations,'${original.replaceAll("'","''")}'::jsonb)).*`);
        const before=snapshot();assert.equal(run(y,true).outcome,'refused');assert.equal(snapshot(),before);
        assert.equal(json(`select public.claim_launch_signup_v2('${r.email}','direct','${'e'.repeat(64)}','2026-10-11-v1','recorded','${r.match}')`).maintenance,true);
      } finally {db.sql("update private.launch_list_control set mode='canonical'");}
    });
    await t.test('fingerprint covers new private hooks, public ACLs and minimization guards',()=>{
      assert.equal(db.sql('select private.launch_write_fence_ready_v1()'),'t');
      assert.equal(db.sql("begin;grant execute on function public.minimize_launch_receipt_v1(uuid,bigint,bigint,text,text) to anon;select private.launch_write_fence_ready_v1();rollback"),'f');
      assert.equal(db.sql("begin;alter function private.launch_retention_field_context_v1(uuid,bigint) security definer;select private.launch_write_fence_ready_v1();rollback"),'f');
    });
    await t.test('current fingerprint definition itself is covered, including harmless definition drift',()=>{
      const definition=db.sql("select pg_get_functiondef('private.launch_write_fence_fingerprint_v1()'::regprocedure)");
      assert.equal(db.sql(`begin;${definition.replace('select encode','select /* synthetic drift */ encode')};select private.launch_write_fence_ready_v1();rollback`),'f');
    });
  } finally {db.cleanup();}
});
