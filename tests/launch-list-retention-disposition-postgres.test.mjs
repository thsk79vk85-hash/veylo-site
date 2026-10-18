import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { launchPostgres } from './helpers/launch-postgres.mjs';
import { launchMatch } from '../lib/launch-list.mjs';

const key = 'synthetic-disposition-key', project = 'yohiumlrpfdhphsnnxxw', source = 'a'.repeat(40);
const read = name => readFileSync(new URL(`../supabase/${name}`, import.meta.url), 'utf8');

test('atomic raw disposition and exact late finish real PostgreSQL contract', async t => {
  const db = launchPostgres();
  // psql sends this SET as a separate command BEFORE the API command. A SET
  // clause on the function or set_config inside its SELECT cannot arm its timer.
  const call = query => db.sql(`set role service_role; set statement_timeout='5s'; ${query}`);
  const json = query => JSON.parse(call(query));
  const snapshot = () => db.sql(`select jsonb_build_array(
    (select jsonb_agg(to_jsonb(s) order by id) from public.signup_requests s),
    (select jsonb_agg(to_jsonb(w) order by id) from public.waitlist w),
    (select jsonb_agg(to_jsonb(p) order by legacy_id) from private.launch_legacy_provenance p),
    (select jsonb_agg(to_jsonb(g) order by signup_id) from private.launch_delivery_guard g),
    (select jsonb_agg(to_jsonb(i) order by item_id) from private.launch_retention_items i),
    (select jsonb_agg(to_jsonb(d) order by signup_id,handoff_token) from private.launch_retention_delivery d),
    (select jsonb_agg(to_jsonb(a) order by approval_ref) from private.launch_import_authorizations a))`);
  const finish = (r, state, provider = null, token = r.token) => call(`select public.finish_launch_delivery_v1('${r.id}','${token}','${state}',${provider === null ? 'null' : `'${provider}'`})`);
  const claim = email => json(`select public.claim_launch_signup_v2('${email}','direct','${randomUUID().replaceAll('-', '').repeat(2)}','2026-10-11-v1','recorded','${launchMatch(email, key)}')`);
  const handoff = r => {
    const hash = randomUUID().replaceAll('-', '').repeat(2);
    assert.equal(call(`select public.pin_launch_payload_v1('${r.id}','${r.token}','${'d'.repeat(64)}')`), 't');
    assert.equal(call(`select public.authorize_launch_delivery_v1('${r.id}','${r.token}',${r.fenceEpoch},'${hash}')`), 't');
    return hash;
  };
  // Owner-only synthetic bindings are installed in this fixture, never shipped.
  const bindSyntheticFacts = () => db.sql(`
    create schema synthetic_test;
    revoke all on schema synthetic_test from public,anon,authenticated,service_role;
    create table synthetic_test.facts(item_id uuid primary key, necessity text[] not null default '{}',
      refs text[] not null default '{}', holds text[] not null default '{}', available boolean not null default true, fault text);
    ${db.sql("select replace(pg_get_functiondef('private.launch_retention_context_v1(uuid,bigint)'::regprocedure),'private.launch_retention_context_v1','synthetic_test.base_context')")};
    create or replace function private.launch_retention_context_v1(p_item_id uuid,p_generation bigint)
    returns jsonb language plpgsql stable security invoker set search_path=pg_catalog as $facts$
    declare f jsonb; p jsonb; x synthetic_test.facts; n text; begin
      f:=synthetic_test.base_context(p_item_id,p_generation);
      select * into x from synthetic_test.facts where item_id=p_item_id;
      if not found or not x.available or f->>'state'='unavailable' then return jsonb_build_object('state','unavailable'); end if;
      p:=f->'withdrawal';
      foreach n in array array['necessity','references','hold','delivery','link','suppression','restore'] loop
        f:=jsonb_set(f,array[n],(p-array['status','at'])||jsonb_build_object('purposes',
          case n when 'necessity' then to_jsonb(x.necessity) when 'references' then to_jsonb(x.refs)
           when 'hold' then to_jsonb(x.holds) when 'link' then '["usable_link"]'::jsonb
           when 'suppression' then '["current_intake"]'::jsonb when 'delivery' then '["late_result","no_resend"]'::jsonb else '[]'::jsonb end));
      end loop;
      f:=jsonb_set(f,'{delivery}',f->'delivery'||'{"outcome":"unknown","compactCovered":true}'::jsonb);
      f:=jsonb_set(f,'{link}',f->'link'||'{"covered":true}'::jsonb);
      f:=jsonb_set(f,'{suppression}',f->'suppression'||'{"covered":true}'::jsonb);
      f:=jsonb_set(f,'{restore}',f->'restore'||'{"independent":true,"current":true}'::jsonb);
      return case x.fault when 'missing_lane' then f-'lane' when 'missing_intent' then f-'intent'
       when 'missing_consent' then f-'consent' when 'unknown_link_purpose' then jsonb_set(f,'{link,purposes}','["unrecognized"]')
       when 'duplicate_link_purpose' then jsonb_set(f,'{link,purposes}','["usable_link","usable_link"]') else f end;
    end $facts$;
    update private.launch_write_fence_contract set definition_hash=private.launch_write_fence_fingerprint_v1();`);
  const prepare = (r, hash, legacy = false) => {
    assert.ok(['withdrawn', 'already_withdrawn'].includes(json(`select public.withdraw_launch_v1('${hash}')`).outcome));
    const item = randomUUID(), approval = `synthetic-${randomUUID()}`;
    if (legacy) db.sql(`insert into public.waitlist(email,created_at) values((select email from public.signup_requests where id='${r.id}'),'2026-01-01');
      insert into private.launch_legacy_provenance(legacy_id,legacy_created_at,signup_id,launch_match,outcome)
      select w.id,w.created_at,s.id,s.launch_match,'suppressed' from public.waitlist w join public.signup_requests s on s.email=w.email where s.id='${r.id}'`);
    db.sql(`insert into private.launch_retention_items(item_id,source_signup_id,launch_match,key_generation,generation,fence_epoch,state,policy_version,reason_code,evidence_ref,scope_hash,withdrawn_at,decided_at)
      select '${item}',id,launch_match,'1',1,${r.fenceEpoch},'raw',1,'eligible','synthetic-evidence','${'c'.repeat(64)}',withdrawn_at,clock_timestamp()
      from public.signup_requests where id='${r.id}';
      insert into synthetic_test.facts(item_id) values('${item}');
      update private.launch_retention_items set generation=generation+1,scope_hash=private.launch_retention_scope_v1('${item}') where item_id='${item}';
      insert into private.launch_import_authorizations(approval_ref,project_ref,source_commit,schema_identity,expected_scope,fence_epoch,writer_ids,control_evidence,test_evidence,settlement_evidence,verified_at,expires_at,operation,retention_key_generation)
      select '${approval}','${project}','${source}',private.launch_import_schema_v1(),scope_hash,fence_epoch,array['synthetic-writer'],'synthetic-control','synthetic-test','synthetic-settlement',clock_timestamp()-interval '1 second',clock_timestamp()+interval '1 hour','retention_raw','1'
      from private.launch_retention_items where item_id='${item}'`);
    const scope = db.sql(`select scope_hash from private.launch_retention_items where item_id='${item}'`);
    return { ...r, item, approval, scope, hash, generation: '2' };
  };
  const dispose = (r, gen = r.generation, epoch = r.fenceEpoch, scope = r.scope, approval = r.approval) => json(`select public.dispose_launch_raw_v1('${r.item}',${gen},${epoch},'${scope}','${approval}')`);
  try {
    await db.start();
    db.sql('create role anon; create role authenticated; create role service_role bypassrls; grant usage on schema public to anon,authenticated,service_role');
    db.sql(read('waitlist.sql')); db.sql('grant all on public.waitlist to service_role');
    for (const name of ['20261011050938_add_signup_intents.sql', '20261013112838_launch_list_lifecycle.sql', '20261013125523_launch_list_canonical_cutover.sql', '20261018141524_launch_list_retention_state.sql']) db.sql(read(`migrations/${name}`));
    db.sql(`update private.launch_list_control set project_ref='${project}',source_commit='${source}',mode='canonical'`);
    // Genuine old PUBLIC APIs establish the old pending:true shape BEFORE D.
    // No guard mutation or post-D reconstruction stands in for this boundary.
    const historical={};
    for(const name of ['sent','failed','fenced-sent','fenced-failed','compact','compact-missing','missing']) {
      const r=claim(`old-pending-${name}@test.invalid`),hash=handoff(r);
      assert.equal(finish(r,'pending'),'t');
      assert.equal(db.sql(`select handoff_state||':'||settled from private.launch_delivery_guard where signup_id='${r.id}'`),'pending:true');
      if(['fenced-failed','compact','compact-missing'].includes(name))assert.equal(json(`select public.withdraw_launch_v1('${hash}')`).outcome,'withdrawn');
      historical[name]={...r,hash};
    }
    const trueTerminals=[];
    for(const state of ['sent','failed']) {
      const r=claim(`old-terminal-${state}@test.invalid`);handoff(r);
      assert.equal(finish(r,state,state==='sent'?'old-terminal-provider':null),'t');trueTerminals.push({...r,state});
    }
    const terminalRows=()=>db.sql(`select jsonb_agg(jsonb_build_array(to_jsonb(s),to_jsonb(g)) order by s.id)
      from public.signup_requests s join private.launch_delivery_guard g on g.signup_id=s.id where s.id in (${trueTerminals.map(r=>`'${r.id}'`).join(',')})`);
    const terminalBefore=terminalRows();
    for (const name of readdirSync(new URL('../supabase/migrations/', import.meta.url)).filter(n => n.endsWith('_launch_list_retention_disposition.sql'))) db.sql(read(`migrations/${name}`));
    for(const name of ['sent','failed','fenced-sent','fenced-failed']) await t.test(`old real-API pending before D accepts exact ${name} result without resend or terminal regression`,()=>{
      const r=historical[name],state=name.endsWith('failed')?'failed':'sent',provider=state==='sent'?'old-late-provider':null;
      if(name.startsWith('fenced'))db.sql("update private.launch_list_control set mode='fenced'");
      try {
        if(name==='fenced-sent')assert.equal(json(`select public.withdraw_launch_v1('${r.hash}')`).outcome,'withdrawn');
        const before=snapshot();
        assert.equal(finish(r,state,provider,randomUUID()),'f');assert.equal(snapshot(),before);
        assert.equal(finish(r,'disabled'),'f');assert.equal(snapshot(),before);
        assert.equal(finish(r,state,provider),'t');
        assert.equal(db.sql(`select s.delivery_state||':'||g.handoff_state||':'||g.settled from public.signup_requests s join private.launch_delivery_guard g on g.signup_id=s.id where s.id='${r.id}'`),`${state}:${state}:true`);
        const after=snapshot();assert.equal(finish(r,state==='sent'?'failed':'sent',state==='sent'?null:'contradiction'),'f');assert.equal(snapshot(),after);
        if(!name.startsWith('fenced'))assert.equal(claim(`old-pending-${name}@test.invalid`).send,false);
      } finally {if(name.startsWith('fenced'))db.sql("update private.launch_list_control set mode='canonical'");}
    });
    await t.test('D does not rewrite genuine old terminal rows; incomplete historical pending proof cannot settle',()=>{
      assert.equal(terminalRows(),terminalBefore);
      for(const r of trueTerminals)assert.equal(finish(r,r.state==='sent'?'failed':'sent',r.state==='sent'?null:'contradiction'),'f');
      assert.equal(terminalRows(),terminalBefore);
      const r=historical.missing;
      for(const edit of ['handoff_at=null','payload_hash=null'])assert.equal(db.sql(`begin;
        update private.launch_delivery_guard set ${edit} where signup_id='${r.id}';
        select public.finish_launch_delivery_v1('${r.id}','${r.token}','sent','must-not-settle');rollback`),'f');
      assert.equal(finish(r,'failed'),'t');
    });
    await t.test('pending completion remains unresolved before raw removal', () => {
      const r = claim('raw-pending@test.invalid'); handoff(r);
      assert.equal(finish(r, 'pending'), 't');
      assert.equal(db.sql(`select settled from private.launch_delivery_guard where signup_id='${r.id}'`), 'f');
      assert.equal(finish(r, 'sent', 'later-provider'), 't');
    });
    assert.equal(db.sql("select to_regprocedure('public.dispose_launch_raw_v1(uuid,bigint,bigint,text,text)') is not null"), 't', 'required atomic disposition API must exist');
    await t.test('default protected facts and authority remain unavailable; ordinary roles denied', () => {
      const r=claim('unavailable@test.invalid'), hash=handoff(r), item=randomUUID();
      assert.equal(json(`select public.withdraw_launch_v1('${hash}')`).outcome,'withdrawn');
      db.sql(`insert into private.launch_retention_items(item_id,source_signup_id,launch_match,key_generation,generation,fence_epoch,state,policy_version,reason_code,evidence_ref,scope_hash,withdrawn_at,decided_at)
        select '${item}',id,launch_match,'1',1,0,'raw',1,'eligible','synthetic-evidence','${'c'.repeat(64)}',withdrawn_at,clock_timestamp() from public.signup_requests where id='${r.id}';
        update private.launch_retention_items set generation=2,scope_hash=private.launch_retention_scope_v1('${item}') where item_id='${item}';
        insert into private.launch_import_authorizations(approval_ref,project_ref,source_commit,schema_identity,expected_scope,fence_epoch,writer_ids,control_evidence,test_evidence,settlement_evidence,verified_at,expires_at,operation,retention_key_generation)
        select 'synthetic-unavailable','${project}','${source}',private.launch_import_schema_v1(),scope_hash,0,array['synthetic-writer'],'synthetic-control','synthetic-test','synthetic-settlement',clock_timestamp()-interval '1 second',clock_timestamp()+interval '1 hour','retention_raw','1' from private.launch_retention_items where item_id='${item}'`);
      const scope=db.sql(`select scope_hash from private.launch_retention_items where item_id='${item}'`);
      const before = snapshot();
      const unavailable=json(`select public.dispose_launch_raw_v1('${item}',2,0,'${scope}','synthetic-unavailable')`);
      assert.equal(unavailable.outcome,'review');assert.equal(unavailable.reason,'unavailable');assert.equal(unavailable.writes,0);
      assert.equal(json(`select public.dispose_launch_raw_v1('${randomUUID()}',1,0,'${'c'.repeat(64)}','synthetic-missing')`).outcome, 'refused');
      for (const role of ['anon','authenticated']) assert.throws(() => db.sql(`set role ${role}; select public.dispose_launch_raw_v1(null,null,null,null,null)`), /permission denied/);
      assert.equal(snapshot(), before);
      assert.equal(db.sql('select count(*) from private.launch_import_authorizations where consumed_at is not null'), '0');
      assert.equal(finish(r,'failed'),'t');
    });
    bindSyntheticFacts();
    await t.test('withdrawn old pending:true preserves unresolved compact facts after D and raw removal',()=>{
      const r=historical.compact,x=prepare(r,r.hash);
      assert.equal(dispose(x).outcome,'disposed');
      assert.equal(db.sql(`select outcome||':'||(settled_at is null)::text||':'||(provider_ref is null)::text from private.launch_retention_delivery where signup_id='${r.id}'`),'pending:true:true');
      assert.equal(json(`select public.withdraw_launch_v1('${r.hash}')`).outcome,'already_withdrawn');
      assert.equal(claim('old-pending-compact@test.invalid').suppressed,true);
      assert.equal(finish(r,'pending'),'t');
      assert.equal(db.sql('select private.launch_delivery_data_ready_v1()'),'f');
      assert.equal(finish(r,'sent','old-compact-provider'),'t');
      const after=snapshot();assert.equal(finish(r,'sent','old-compact-provider'),'t');
      assert.equal(finish(r,'failed'),'f');assert.equal(finish(r,'sent','old-compact-provider',randomUUID()),'f');assert.equal(snapshot(),after);
    });
    await t.test('missing evidence on withdrawn old pending remains review and cannot create compact settlement',()=>{
      const r=historical['compact-missing'];
      db.sql(`update private.launch_delivery_guard set payload_hash=null where signup_id='${r.id}'`);
      const x=prepare(r,r.hash),before=snapshot(),out=dispose(x);
      assert.equal(out.outcome,'review');assert.equal(out.reason,'unknown_delivery');assert.equal(out.writes,0);assert.equal(snapshot(),before);
      assert.equal(finish(r,'sent','must-not-settle'),'f');assert.equal(snapshot(),before);
      db.sql(`update private.launch_delivery_guard set payload_hash='${'d'.repeat(64)}' where signup_id='${r.id}'`);
      assert.equal(finish(r,'failed'),'t');
    });
    const active = claim('active@test.invalid');
    for(const [platform,ip] of [['ios','b'],['android','e']]) {
      const beta = json(`select public.claim_signup_v1('unknown@test.invalid','beta','${platform}','direct','${ip.repeat(64)}')`);
      assert.equal(call(`select public.finish_signup_delivery_v1('${beta.id}','${beta.token}','sent','beta-provider')`), 't');
    }
    const preserved = () => db.sql(`select jsonb_agg(to_jsonb(s) order by id) from public.signup_requests s where intent='beta' or id='${active.id}'`);
    const beforePreserved = preserved();
    let unknown;
    await t.test('withdrawn raw erasure preserves link, independent suppression, active and every beta field', () => {
      const r = claim('unknown@test.invalid'), hash = handoff(r); unknown = prepare(r, hash);
      const out = dispose(unknown);
      assert.equal(out.outcome, 'disposed'); assert.equal(out.generation, '3'); assert.equal(out.workId, unknown.item);
      assert.equal(typeof out.writes, 'number'); assert.equal(out.reason, 'eligible');
      assert.doesNotMatch(JSON.stringify(out), /@|provider|handoff|email|scopeHash/);
      assert.equal(db.sql(`select count(*) from public.signup_requests where id='${r.id}'`), '0');
      assert.equal(db.sql(`select count(*) from private.launch_delivery_guard where signup_id='${r.id}'`), '0');
      assert.equal(db.sql(`select outcome||':'||(settled_at is null)::text||':'||(provider_ref is null)::text from private.launch_retention_delivery where signup_id='${r.id}'`), 'unknown:true:true');
      assert.equal(json(`select public.withdraw_launch_v1('${hash}')`).outcome, 'already_withdrawn');
      assert.equal(claim('unknown@test.invalid').suppressed, true);
      assert.equal(preserved(), beforePreserved);
      const after = snapshot(); assert.equal(dispose(unknown).outcome, 'already_disposed'); assert.equal(snapshot(), after);
      assert.equal(dispose(unknown, '1').outcome, 'refused');
    });
    await t.test('pending completion after raw removal remains unresolved; exact definitive result is terminal', () => {
      assert.equal(finish(unknown, 'pending'), 't');
      assert.equal(db.sql(`select outcome||':'||(settled_at is null)::text from private.launch_retention_delivery where signup_id='${unknown.id}'`), 'pending:true');
      assert.equal(db.sql('select private.launch_delivery_data_ready_v1()'), 'f');
      assert.equal(finish(unknown, 'sent', 'late-provider'), 't');
      const after = snapshot();
      assert.equal(finish(unknown, 'sent', 'late-provider'), 't'); assert.equal(snapshot(), after);
      for (const [state, provider, token] of [['failed',null,unknown.token],['pending',null,unknown.token],['sent','different',unknown.token],['sent','late-provider',randomUUID()],['disabled',null,unknown.token]]) assert.equal(finish(unknown,state,provider,token), 'f');
      assert.equal(snapshot(), after);
      assert.equal(db.sql(`select count(*) from public.signup_requests where id='${unknown.id}'`), '0');
    });
    await t.test('multiple delayed handoffs finish through the API across committed item generations and epoch advances', () => {
      const r = claim('many@test.invalid'), hash = handoff(r), x = prepare(r, hash);
      assert.equal(dispose(x).outcome, 'disposed');
      const other = randomUUID();
      db.sql(`insert into private.launch_retention_delivery(item_id,signup_id,handoff_token,generation,fence_epoch,handoff_at,outcome)
        select item_id,'${r.id}','${other}',generation,fence_epoch,'2026-10-17','unknown' from private.launch_retention_items where item_id='${x.item}';
        update private.launch_retention_items set generation=generation+1,reason_code='held' where item_id='${x.item}';
        update private.launch_list_control set fence_epoch=fence_epoch+1`);
      const stale=snapshot();assert.equal(finish(r,'sent','multi-provider'),'f');assert.equal(snapshot(),stale);
      db.sql(`update private.launch_retention_items set generation=generation+1,fence_epoch=fence_epoch+1,reason_code='unavailable' where item_id='${x.item}'`);
      assert.equal(finish(r,'sent','multi-provider'), 't');
      assert.equal(finish(r,'failed',null,other), 't');
      assert.equal(db.sql(`select count(*) from private.launch_retention_delivery where item_id='${x.item}' and generation=5 and fence_epoch=1 and outcome in ('sent','failed')`), '2');
      const after=snapshot(); assert.equal(finish(r,'sent','multi-provider'),'t'); assert.equal(snapshot(),after);
    });
    await t.test('each old NO ACTION dependency is replaced before exact covered legacy/raw deletion', () => {
      const r=claim('legacy@test.invalid'), hash=handoff(r); assert.equal(finish(r,'sent','legacy-provider'),'t');
      // The trusted fixture seeds a historical row before canonical writer control.
      db.sql("update private.launch_list_control set mode='transition'");
      const x=prepare(r,hash,true); db.sql("update private.launch_list_control set mode='canonical'");
      // Mode is part of scope: refresh the synthetic exact authority, not a production setter.
      db.sql(`update private.launch_retention_items set generation=generation+1,scope_hash=private.launch_retention_scope_v1('${x.item}') where item_id='${x.item}';
        update private.launch_import_authorizations set expected_scope=(select scope_hash from private.launch_retention_items where item_id='${x.item}') where approval_ref='${x.approval}'`);
      x.generation='3'; x.scope=db.sql(`select scope_hash from private.launch_retention_items where item_id='${x.item}'`);
      assert.throws(()=>db.sql(`delete from public.signup_requests where id='${r.id}'`),/foreign key/);
      for(const dependency of ['launch_delivery_guard','launch_legacy_provenance','launch_retention_items']) {
        const removeOtherRefs=`${dependency==='launch_delivery_guard'?'':`delete from private.launch_delivery_guard where signup_id='${r.id}';`}
          ${dependency==='launch_legacy_provenance'?'':`update private.launch_legacy_provenance set signup_id=null,outcome='suppressed' where signup_id='${r.id}';`}
          ${dependency==='launch_retention_items'?'':`update private.launch_retention_items set source_signup_id=null,state='marker',generation=generation+1 where item_id='${x.item}';`}`;
        assert.throws(()=>db.sql(`begin;${removeOtherRefs}delete from public.signup_requests where id='${r.id}';rollback`),new RegExp(`${dependency}_${dependency==='launch_retention_items'?'source_signup_id':'signup_id'}_fkey`));
      }
      assert.equal(db.sql(`select private.launch_cutover_data_ready_v1('${key}')`),'t');
      assert.equal(dispose(x).outcome,'disposed');
      assert.equal(db.sql("select count(*) from public.waitlist where email='legacy@test.invalid'"),'0');
      assert.equal(db.sql(`select outcome||':'||(signup_id is null)::text||':'||(disposition_id='${x.item}')::text from private.launch_legacy_provenance where launch_match='${launchMatch('legacy@test.invalid',key)}'`),'disposed:true:true');
      assert.equal(db.sql(`select private.launch_cutover_data_ready_v1('${key}')`),'t');
      assert.equal(json(`select public.inventory_launch_legacy_v1('${key}')`).counts.conflicts,0);
      for(const mutation of ["legacy_created_at=legacy_created_at+interval '1 second'","legacy_id=gen_random_uuid()"]){
        const drift=JSON.parse(db.sql(`begin;update private.launch_legacy_provenance set ${mutation} where disposition_id='${x.item}';
          select jsonb_build_object('ready',private.launch_cutover_data_ready_v1('${key}'),'inventory',public.inventory_launch_legacy_v1('${key}'));rollback`));
        assert.equal(drift.ready,false,'same-count disposed source identity/version drift must refuse');
        assert.ok(drift.inventory.counts.conflicts>0);
      }
    });
    await t.test('unknown protected purposes, stale exact scope/generation/epoch and authority refuse without writes', () => {
      const r=claim('refuse@test.invalid'), x=prepare(r,handoff(r));
      const before=snapshot();
      for (const args of [['1',r.fenceEpoch,x.scope,x.approval],['2',99,x.scope,x.approval],['2',r.fenceEpoch,'f'.repeat(64),x.approval],['2',r.fenceEpoch,x.scope,'missing']]) assert.equal(dispose(x,...args).outcome,'refused');
      for (const edit of ["operation='retention_receipt'","revoked_at=clock_timestamp()",`source_commit='${'b'.repeat(40)}'`,`project_ref='${'b'.repeat(20)}'`,`schema_identity='${'e'.repeat(64)}'`,"retention_key_generation='2'","verified_at=clock_timestamp()-interval '2 hours',expires_at=clock_timestamp()-interval '1 hour'", "writer_ids=array['dup','dup']"]) {
        assert.equal(JSON.parse(db.sql(`set statement_timeout='5s'; begin; update private.launch_import_authorizations set ${edit} where approval_ref='${x.approval}'; select public.dispose_launch_raw_v1('${x.item}',2,${r.fenceEpoch},'${x.scope}','${x.approval}'); rollback`)).outcome,'refused');
      }
      for (const [edit,reason] of [["available=false",'unavailable'],["holds=array['legal_hold']",'held'],["refs=array['delivery_reference']",'live_reference'],["necessity=array['required_record']",'active_purpose']]) {
        const out=JSON.parse(db.sql(`set statement_timeout='5s'; begin; update synthetic_test.facts set ${edit} where item_id='${x.item}'; select public.dispose_launch_raw_v1('${x.item}',2,${r.fenceEpoch},'${x.scope}','${x.approval}'); rollback`));
        assert.equal(out.outcome,'review'); assert.equal(out.reason,reason);
      }
      assert.equal(snapshot(),before);
      db.sql(`update public.signup_requests set source='instagram' where id='${r.id}'`);
      assert.equal(dispose(x).outcome,'refused');
      assert.equal(finish(r,'failed'),'t');
    });
    await t.test('equal-count identity drift and missing active canonical source cannot be excused by a disposed item', () => {
      db.sql("update private.launch_list_control set mode='transition'; insert into public.waitlist(email) values('active@test.invalid');");
      db.sql(`insert into private.launch_legacy_provenance(legacy_id,legacy_created_at,signup_id,launch_match,outcome)
        select w.id,w.created_at,s.id,s.launch_match,'registered' from public.waitlist w join public.signup_requests s on s.email=w.email where s.id='${active.id}'; update private.launch_list_control set mode='canonical'`);
      assert.equal(db.sql(`select private.launch_cutover_data_ready_v1('${key}')`),'t');
      for (const mutation of ["update public.waitlist set created_at=created_at+interval '1 second' where email='active@test.invalid'", "update public.waitlist set email='other@test.invalid' where email='active@test.invalid'",`update private.launch_legacy_provenance set signup_id=null,outcome='suppressed' where signup_id='${active.id}'; delete from private.launch_delivery_guard where signup_id='${active.id}'; delete from public.signup_requests where id='${active.id}'`]) {
        assert.equal(db.sql(`begin; ${mutation}; select private.launch_cutover_data_ready_v1('${key}'); rollback`),'f');
      }
    });
    await t.test('malformed owning facts cannot bypass the policy through SQL NULL or unrecognized purposes',()=>{
      const r=claim('malformed@test.invalid'),x=prepare(r,handoff(r)),before=snapshot(),outcomes=[];
      for(const fault of ['missing_lane','missing_intent','missing_consent','unknown_link_purpose','duplicate_link_purpose']) {
        const out=JSON.parse(db.sql(`set statement_timeout='5s'; begin;update synthetic_test.facts set fault='${fault}' where item_id='${x.item}';
          select public.dispose_launch_raw_v1('${x.item}',2,${r.fenceEpoch},'${x.scope}','${x.approval}');rollback`));
        outcomes.push(out.outcome);
      }
      assert.deepEqual(outcomes,['review','review','review','review','review']);assert.equal(snapshot(),before);
    });
    for (const boundary of ['compact','provenance','legacy','guard','ledger','raw','completion']) await t.test(`failure at ${boundary} boundary rolls back the entire disposition`, () => {
      const email=`rollback-${boundary}@test.invalid`, r=claim(email), hash=handoff(r);
      db.sql("update private.launch_list_control set mode='transition'"); const x=prepare(r,hash,true);
      db.sql("update private.launch_list_control set mode='canonical'");
      db.sql(`update private.launch_retention_items set generation=generation+1,scope_hash=private.launch_retention_scope_v1('${x.item}') where item_id='${x.item}';
        update private.launch_import_authorizations set expected_scope=(select scope_hash from private.launch_retention_items where item_id='${x.item}') where approval_ref='${x.approval}'`);
      x.generation='3'; x.scope=db.sql(`select scope_hash from private.launch_retention_items where item_id='${x.item}'`);
      const [table,event,when]=({compact:['private.launch_retention_delivery','insert','true'],provenance:['private.launch_legacy_provenance','update','true'],legacy:['public.waitlist','delete','true'],guard:['private.launch_delivery_guard','delete','true'],ledger:['private.launch_retention_items','update',"new.state<>'raw'"],raw:['public.signup_requests','delete',"old.intent='launch'"],completion:['private.launch_import_authorizations','update','new.consumed_at is not null']})[boundary];
      // Test trigger is deliberately outside the installed contract; register its
      // schema identity in this isolated owner attestation before taking scope.
      db.sql(`create sequence synthetic_test.boundary_hits;
        create function synthetic_test.abort_boundary() returns trigger language plpgsql as $abort$ begin perform nextval('synthetic_test.boundary_hits'); raise exception 'synthetic boundary failure'; end $abort$;
        create trigger synthetic_abort after ${event} on ${table} for each row when (${when}) execute function synthetic_test.abort_boundary();
        update private.launch_import_authorizations set schema_identity=private.launch_import_schema_v1() where approval_ref='${x.approval}'`);
      const before=snapshot(), out=dispose(x);
      assert.equal(out.outcome,'refused'); assert.equal(out.reason,'unavailable'); assert.equal(snapshot(),before);
      assert.equal(db.sql('select is_called from synthetic_test.boundary_hits'),'t','the intended transactional boundary was actually reached');
      db.sql(`drop trigger synthetic_abort on ${table}; drop function synthetic_test.abort_boundary(); drop sequence synthetic_test.boundary_hits`);
    });
    await t.test('cancelled unsent lease is never fabricated as a settled handoff', () => {
      const r=claim('unsent@test.invalid');
      // Usable capability existed before cancellation; no provider handoff.
      const hash='9'.repeat(64); db.sql(`update public.signup_requests set launch_unsubscribe_hash='${hash}' where id='${r.id}'`);
      const x=prepare(r,hash); assert.equal(dispose(x).outcome,'disposed');
      assert.equal(db.sql(`select count(*) from private.launch_retention_delivery where signup_id='${r.id}'`),'0');
      assert.equal(finish(r,'sent','invented'),'f'); assert.equal(finish(r,'disabled'),'f');
    });
    for(const lease of ['cancelled','disabled']) await t.test(`prior failed handoff plus ${lease} newer lease retains only exact earlier handoff`, () => {
      const email=`failed-new-${lease}@test.invalid`,r=claim(email), hash=handoff(r); assert.equal(finish(r,'failed'),'t');
      db.sql(`update public.signup_requests set delivery_attempted_at=now()-interval '6 minutes' where id='${r.id}'`);
      const retry=claim(email); assert.notEqual(retry.token,r.token);
      if(lease==='disabled')assert.equal(finish(retry,'disabled'),'t');
      const x=prepare(retry,hash); assert.equal(dispose(x).outcome,'disposed');
      assert.equal(db.sql(`select outcome||':'||claim_outcome||':'||(claim_token='${retry.token}')::text from private.launch_retention_delivery where signup_id='${r.id}' and handoff_token='${r.token}'`),'failed:cancelled:true');
      assert.equal(finish(retry,'sent','invented'),'f'); assert.equal(finish(r,'sent','contradiction'),'f'); assert.equal(finish(r,'failed'),'t');
    });
    await t.test('duplicate/conflicting compact receipt refuses without partial minimization', () => {
      const r=claim('duplicate@test.invalid'), x=prepare(r,handoff(r));
      db.sql(`insert into private.launch_retention_delivery(item_id,signup_id,handoff_token,generation,fence_epoch,handoff_at,outcome)
        select item_id,'${r.id}','${r.token}',generation,fence_epoch,'2026-10-17','unknown' from private.launch_retention_items where item_id='${x.item}'`);
      const before=snapshot(); assert.equal(dispose(x).outcome,'review'); assert.equal(snapshot(),before);
    });
    await t.test('missing timed or pinned handoff evidence cannot certify a raw terminal completion', () => {
      const r=claim('missing-evidence@test.invalid');handoff(r);
      const results=[];
      for(const edit of ['handoff_at=null','payload_hash=null']) {
        results.push(db.sql(`begin; update private.launch_delivery_guard set ${edit} where signup_id='${r.id}';
          select public.finish_launch_delivery_v1('${r.id}','${r.token}','sent','must-not-certify');rollback`));
      }
      assert.deepEqual(results,['f','f']);
      assert.equal(db.sql(`select settled from private.launch_delivery_guard where signup_id='${r.id}'`),'f');
    });
    await t.test('contradictory raw terminal facts refuse disposal without manufacturing a compact rejection',()=>{
      const outcomes=[];
      for(const fault of ['raw-sent-without-provider','unsettled-terminal-guard']) {
        const r=claim(`${fault}@test.invalid`),hash=handoff(r);assert.equal(finish(r,'failed'),'t');
        db.sql(fault==='raw-sent-without-provider'?`update public.signup_requests set delivery_state='sent' where id='${r.id}'`:
          `update private.launch_delivery_guard set settled=false where signup_id='${r.id}'`);
        const x=prepare(r,hash),before=snapshot(),out=dispose(x);outcomes.push(out.outcome);
        if(out.outcome==='review')assert.equal(snapshot(),before);
      }
      assert.deepEqual(outcomes,['review','review']);
    });
    await t.test('forward safety definitions, ACLs and lifecycle provenance are owner fingerprint covered', () => {
      for (const edit of ["grant execute on function public.dispose_launch_raw_v1(uuid,bigint,bigint,text,text) to anon", "grant update on private.launch_retention_delivery to service_role", "alter table private.launch_legacy_provenance drop constraint launch_legacy_disposition_shape", "create or replace function private.launch_retention_scope_v1(p_item_id uuid) returns text language sql as 'select null::text'"]) assert.equal(db.sql(`begin; ${edit}; select private.launch_write_fence_ready_v1(); rollback`),'f');
      assert.equal(db.sql('select private.launch_write_fence_ready_v1()'),'t');
      assert.throws(()=>call('update private.launch_write_fence_contract set definition_hash=private.launch_write_fence_fingerprint_v1()'),/permission denied/);
    });
  } finally { db.cleanup(); }
});
