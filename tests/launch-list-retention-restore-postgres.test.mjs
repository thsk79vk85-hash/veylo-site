import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { randomUUID, createHash } from 'node:crypto';
import { launchPostgres } from './helpers/launch-postgres.mjs';
import { withOwnedCleanup } from './helpers/owned-cleanup.mjs';
import { launchMatch } from '../lib/launch-list.mjs';

const project='yohiumlrpfdhphsnnxxw',sourceCommit='a'.repeat(40),key='synthetic-restore-key';
const read=n=>readFileSync(new URL(`../supabase/${n}`,import.meta.url),'utf8');
const quote=v=>`'${String(v).replaceAll("'","''")}'`;
const digest=v=>createHash('sha256').update(v).digest('hex');

test('independent complete current restore coverage on a second owned restored clone',async t=>{
  const source=launchPostgres(),clone=launchPostgres();
  const call=(db,q)=>db.sql(`set role service_role;${q}`);
  const inventory=()=>JSON.parse(call(clone,`select public.inventory_launch_legacy_v1('${key}')`));
  const setup=async db=>{
    await db.start();db.sql('create role anon;create role authenticated;create role service_role bypassrls;grant usage on schema public to anon,authenticated,service_role');
    db.sql(read('waitlist.sql'));db.sql('grant all on public.waitlist to service_role');
    const migrations=['20261011050938_add_signup_intents.sql','20261013112838_launch_list_lifecycle.sql','20261013125523_launch_list_canonical_cutover.sql',
      '20261018141524_launch_list_retention_state.sql','20261018150520_launch_list_retention_disposition.sql',
      ...readdirSync(new URL('../supabase/migrations/',import.meta.url)).filter(n=>n.endsWith('_launch_list_retention_retirement.sql'))];
    for(const n of migrations)db.sql(read(`migrations/${n}`));
    t.diagnostic(`${db.name}: waitlist.sql + ${migrations.join(', ')}`);
    db.sql(`update private.launch_list_control set project_ref='${project}',source_commit='${sourceCommit}',mode='canonical'`);
  };
  const dump=db=>{
    const out=spawnSync('docker',['--host','unix:///Users/johntawadros/.docker/run/docker.sock','exec',db.name,'pg_dump','-h','/tmp','-U','postgres','-d','postgres',
      '--data-only','--schema=public','--schema=private','--no-owner','--no-privileges','--exclude-table=private.launch_list_control','--exclude-table=private.launch_write_fence_contract'],
    {encoding:'utf8',timeout:30000,maxBuffer:8*1024*1024});assert.equal(out.status,0,out.stderr);return out.stdout;
  };
  const approve=(ref,inv=inventory())=>{
    clone.sql(`insert into private.launch_import_authorizations(approval_ref,project_ref,source_commit,schema_identity,expected_scope,fence_epoch,
      writer_ids,control_evidence,test_evidence,settlement_evidence,verified_at,expires_at,operation,target_mode,restore_snapshot_ref,restore_replay_ref,restore_coverage_ref)
      values('${ref}','${project}','${sourceCommit}','${inv.schemaIdentity}','${inv.scopeHash}',${inv.fenceEpoch},array['synthetic-writer'],
      'synthetic-control','synthetic-test','synthetic-settlement',clock_timestamp()-interval '1 second',clock_timestamp()+interval '1 hour',
      'restore','canonical','synthetic-snapshot','synthetic-replay','synthetic-coverage')`);return inv;
  };
  const reopen=inv=>JSON.parse(call(clone,`select public.set_launch_mode_v1(${inv.fenceEpoch},'canonical','${inv.scopeHash}','${key}')`));
  let barrier;
  return withOwnedCleanup(async()=>{
    await setup(source);await setup(clone);
    const email='snapshot-only@test.invalid',match=launchMatch(email,key);
    source.sql(`insert into public.signup_requests(email,intent,platform,source,consent_version,launch_match) values('${email}','launch','unspecified','direct','synthetic','${match}')`);
    clone.sql(dump(source));
    // Advance the independent source AFTER the snapshot, including an identity
    // the snapshot never contained and a necessary unresolved exact handoff.
    source.sql(`update private.launch_list_control set fence_epoch=1;
      insert into private.launch_suppressions values('${match}','2026-10-18','unsubscribe');
      update public.signup_requests set withdrawn_at='2026-10-18' where email='${email}';
      delete from public.signup_requests where email='${email}';
      insert into private.launch_withdrawal_receipts values('${'d'.repeat(64)}','${match}','2026-10-18')`);
    clone.sql("update private.launch_list_control set mode='fenced',restore_required=true,fence_epoch=1");
    let inv=approve('synthetic-missing');
    const missing=reopen(inv);
    assert.equal(missing.outcome,'refused','opaque restore references and a locally coherent old snapshot must not reopen without independent current coverage');
    assert.equal(clone.sql('select restore_required from private.launch_list_control'),'t');
    assert.equal(clone.sql("select consumed_at is null from private.launch_import_authorizations where approval_ref='synthetic-missing'"),'t');
    clone.sql("delete from private.launch_import_authorizations where approval_ref='synthetic-missing'");
    const ids=[randomUUID(),randomUUID()],signups=[randomUUID(),randomUUID()],tokens=[randomUUID(),randomUUID()];
    for(let n=0;n<2;n++)source.sql(`insert into private.launch_suppressions values('${String(n+1).repeat(64)}','2026-10-18','unsubscribe');
      insert into private.launch_retention_items(item_id,launch_match,key_generation,generation,fence_epoch,state,policy_version,reason_code,evidence_ref,scope_hash,withdrawn_at,decided_at)
      values('${ids[n]}','${String(n+1).repeat(64)}','${n+1}',5,1,'receipt',1,'eligible','synthetic-evidence','${'c'.repeat(64)}','2026-10-18','2026-10-18');
      insert into private.launch_retention_delivery(item_id,signup_id,handoff_token,generation,fence_epoch,handoff_at,outcome,settled_at,provider_ref)
      values('${ids[n]}','${signups[n]}','${tokens[n]}',5,1,'2026-09-01','${n===0?'unknown':'sent'}',${n===0?'null':"'2026-09-02'"},${n===0?'null':"'synthetic-provider'"});
      insert into private.launch_import_authorizations(approval_ref,project_ref,source_commit,schema_identity,expected_scope,fence_epoch,writer_ids,control_evidence,test_evidence,settlement_evidence,
        verified_at,expires_at,operation,retention_key_generation,consumed_at,post_scope,result_receipt)
      values('synthetic-consumed-${n}','${project}','${sourceCommit}',private.launch_import_schema_v1(),'${'c'.repeat(64)}',1,array['synthetic-writer'],
        'synthetic-control','synthetic-test','synthetic-settlement','2026-01-01','2026-01-02','retention_raw','${n+1}','2026-01-01',private.launch_retention_legacy_scope_v1('${ids[n]}'),
        jsonb_build_object('workId','${ids[n]}','outcome','disposed','generation','5','writes',4))`);
    const sourceManifest=()=>JSON.parse(source.sql("select private.launch_retention_replay_manifest_v1(null)"));
    const sourceDigest=()=>source.sql("select private.launch_retention_replay_digest_v1(null)");
    const head=digest('synthetic-current-head-2');
    clone.sql(`create schema synthetic_test;revoke all on schema synthetic_test from public,anon,authenticated,service_role;
      create table synthetic_test.external_coverage(proof jsonb);
      create or replace function private.launch_retention_restore_coverage_v1(p_approval_ref text,p_scope text,p_epoch bigint)
      returns jsonb language sql stable security definer set search_path=pg_catalog as $proof$
        select coalesce((select proof from synthetic_test.external_coverage limit 1),'{"state":"unavailable"}'::jsonb)
      $proof$;
      update private.launch_write_fence_contract set definition_hash=private.launch_write_fence_fingerprint_v1()`);
    const proofFor=(ref,iv)=>({state:'verified',evidenceRef:'synthetic-independent-evidence',origin:'independent_current',stableBarrierRef:'synthetic-source-fence',
      approvalRef:ref,operation:'restore',namespace:`launch-retention-v1:${project}`,projectRef:project,sourceCommit,schemaIdentity:iv.schemaIdentity,
      fingerprint:clone.sql('select private.launch_write_fence_fingerprint_v1()'),scopeHash:iv.scopeHash,epoch:String(iv.fenceEpoch),snapshotRef:'synthetic-snapshot',replayRef:'synthetic-replay',coverageRef:'synthetic-coverage',
      externalHead:head,coveredHead:head,externalWatermark:'2',coveredWatermark:'2',liveKeyGenerations:['1','2'],coveredKeyGenerations:['1','2'],manifestDigest:sourceDigest()});
    const bind=p=>clone.sql(`delete from synthetic_test.external_coverage;insert into synthetic_test.external_coverage values(${quote(JSON.stringify(p))}::jsonb)`);
    inv=approve('synthetic-current');
    const baseProof=proofFor('synthetic-current',inv);
    await t.test('complete external manifest detects identities absent from the snapshot, not just existing-item loops',()=>{
      bind(baseProof);
      assert.equal(clone.sql(`select private.launch_retention_restore_ready_v1((select a from private.launch_import_authorizations a where approval_ref='synthetic-current'),'${inv.scopeHash}',${inv.fenceEpoch})`),'f');
      assert.equal(reopen(inv).outcome,'refused');
      assert.equal(clone.sql('select count(*) from private.launch_retention_items'),'0');
      assert.equal(clone.sql('select count(*) from private.launch_suppressions'),'0');
      assert.equal(sourceManifest().items.length,2);
    });
    // Test-owner transport only, while external activation remains fenced. This
    // is not a shipped replay importer or ordinary import-disposal authority.
    clone.sql("update private.launch_list_control set mode='canonical';delete from public.signup_requests where intent='launch'");
    clone.sql(dump(source));clone.sql("update private.launch_list_control set mode='fenced'");
    clone.sql("delete from private.launch_import_authorizations where approval_ref='synthetic-current'");
    inv=approve('synthetic-current');
    const p=proofFor('synthetic-current',inv);
    for(const [name,patch] of [
      ['stale head',{coveredHead:digest('old-head')}],['stale watermark',{coveredWatermark:'1'}],
      ['noncanonical bigint',{externalWatermark:'02',coveredWatermark:'02'}],['missing older live key',{coveredKeyGenerations:['2']}],
      ['duplicate key',{coveredKeyGenerations:['1','1','2']}],['unsorted key',{liveKeyGenerations:['2','1'],coveredKeyGenerations:['2','1']}],
      ['self-certified origin',{origin:'restored_snapshot'}],['wrong namespace',{namespace:'other'}],
      ['wrong approval',{approvalRef:'synthetic-other'}],['tampered manifest',{manifestDigest:'f'.repeat(64)}],
      ['wrong fingerprint',{fingerprint:'f'.repeat(64)}],['missing barrier',{stableBarrierRef:null}],
      ['non-string evidence',{evidenceRef:1}],['non-string watermark',{externalWatermark:2,coveredWatermark:2}],
    ]) await t.test(`${name} coverage quarantines without consuming authority`,()=>{
      bind({...p,...patch});
      assert.equal(call(clone,`select private.launch_retention_restore_ready_v1((select a from private.launch_import_authorizations a where approval_ref='synthetic-current'),'${inv.scopeHash}',${inv.fenceEpoch})`),'f');
      assert.equal(reopen(inv).outcome,'refused');
      assert.equal(clone.sql("select consumed_at is null from private.launch_import_authorizations where approval_ref='synthetic-current'"),'t');
      assert.equal(clone.sql('select restore_required from private.launch_list_control'),'t');
      assert.equal(JSON.parse(call(clone,`select public.claim_launch_signup_v2('${email}','direct','${'f'.repeat(64)}','2026-10-11-v1','recorded','${match}')`)).maintenance,true);
    });
    await t.test('nonempty CURRENT complete replay proof is necessary but unknown handoff still prevents reopen',async()=>{
      source.sql('create schema synthetic_test;create table synthetic_test.barrier(released boolean);insert into synthetic_test.barrier values(false)');
      barrier=source.asyncSql(`set statement_timeout='25s';set application_name='independent-source-barrier';begin;
        select pg_advisory_xact_lock(hashtextextended('launch-list-fence',0));
        do $barrier$ begin while not (select released from synthetic_test.barrier) loop perform pg_sleep(0.02);end loop;end $barrier$;commit`);
      for(let n=0;n<150;n++) {
        if(source.sql("select exists(select 1 from pg_stat_activity where application_name='independent-source-barrier' and wait_event='PgSleep')")==='t')break;
        await new Promise(r=>setTimeout(r,20));
      }
      assert.equal(source.sql("select pg_try_advisory_xact_lock(hashtextextended('launch-list-fence',0))"),'f');
      bind(proofFor('synthetic-current',inv));
      assert.equal(clone.sql("select private.launch_retention_replay_digest_v1('synthetic-current')"),sourceDigest());
      assert.equal(call(clone,`select private.launch_retention_restore_ready_v1((select a from private.launch_import_authorizations a where approval_ref='synthetic-current'),'${inv.scopeHash}',${inv.fenceEpoch})`),'t');
      assert.equal(reopen(inv).outcome,'refused','coverage cannot fabricate settlement of unresolved handoff');
      assert.equal(clone.sql(`select outcome from private.launch_retention_delivery where item_id='${ids[0]}'`),'unknown');
      source.sql('update synthetic_test.barrier set released=true');await barrier;barrier=undefined;
    });
    // Definitive late settlement uses the unchanged real API on the source;
    // then independently obtain a new CURRENT head and full coverage under fence.
    assert.equal(call(source,`select public.finish_launch_delivery_v1('${signups[0]}','${tokens[0]}','failed',null)`),'t');
    // Carry the OTHER owner's exact settled receipt, including its actual
    // observation time. Independently finishing twice invents two different
    // receipts and is not faithful replay transport.
    const settled=source.sql(`select to_jsonb(d) from private.launch_retention_delivery d where item_id='${ids[0]}'`);
    clone.sql(`delete from private.launch_retention_delivery where item_id='${ids[0]}';
      insert into private.launch_retention_delivery select (jsonb_populate_record(null::private.launch_retention_delivery,${quote(settled)}::jsonb)).*`);
    clone.sql("delete from private.launch_import_authorizations where approval_ref='synthetic-current'");inv=approve('synthetic-current');
    source.sql('update synthetic_test.barrier set released=false');
    barrier=source.asyncSql(`set statement_timeout='25s';set application_name='independent-source-barrier-final';begin;select pg_advisory_xact_lock(hashtextextended('launch-list-fence',0));
      do $barrier$ begin while not (select released from synthetic_test.barrier) loop perform pg_sleep(0.02);end loop;end $barrier$;commit`);
    for(let n=0;n<150;n++) {if(source.sql("select exists(select 1 from pg_stat_activity where application_name='independent-source-barrier-final' and wait_event='PgSleep')")==='t')break;await new Promise(r=>setTimeout(r,20));}
    await t.test('legitimate nonempty independently CURRENT complete coverage opens once; consumed authority cannot replay',()=>{
      assert.equal(source.sql("select pg_try_advisory_xact_lock(hashtextextended('launch-list-fence',0))"),'f');
      const current=proofFor('synthetic-current',inv);current.externalHead=digest('settled-head-3');current.coveredHead=current.externalHead;current.externalWatermark='3';current.coveredWatermark='3';
      bind(current);const out=reopen(inv);assert.equal(out.outcome,'mode_changed');assert.equal(out.operation,'restore');
      assert.equal(clone.sql('select restore_required from private.launch_list_control'),'f');
      assert.equal(reopen(inv).outcome,'refused');
      assert.equal(JSON.parse(call(clone,`select public.claim_launch_signup_v2('${email}','direct','${'e'.repeat(64)}','2026-10-11-v1','recorded','${match}')`)).suppressed,true);
      assert.equal(clone.sql('select count(*) from private.launch_suppressions'),'3');
    });
    await t.test('stop/rollback retains safety markers and compatible finish without raw replay; beta remains usable',()=>{
      clone.sql("update private.launch_list_control set mode='fenced',restore_required=true");
      assert.equal(JSON.parse(call(clone,`select public.claim_launch_signup_v2('${email}','direct','${'e'.repeat(64)}','2026-10-11-v1','recorded','${match}')`)).maintenance,true);
      assert.equal(call(clone,`select public.finish_launch_delivery_v1('${signups[0]}','${tokens[0]}','failed',null)`),'t');
      const beta=JSON.parse(call(clone,`select public.claim_signup_v1('${email}','beta','ios','direct','${'a'.repeat(64)}')`));
      assert.equal(beta.send,true);assert.equal(call(clone,`select public.finish_signup_delivery_v1('${beta.id}','${beta.token}','sent','synthetic-beta')`),'t');
      assert.equal(clone.sql('select count(*) from public.signup_requests where intent=\'launch\''),'0');
      assert.equal(clone.sql('select count(*) from private.launch_suppressions'),'3');
    });
  },[
    ()=>withOwnedCleanup(async()=>{if(barrier)source.sql('update synthetic_test.barrier set released=true');},[async()=>{if(barrier)await barrier;}]),
    ()=>clone.cleanup(),()=>source.cleanup(),
  ]);
});
