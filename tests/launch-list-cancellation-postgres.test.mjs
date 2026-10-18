import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { launchPostgres } from './helpers/launch-postgres.mjs';
import { launchMatch } from '../lib/launch-list.mjs';

const key = 'synthetic-cancellation-key', project = 'yohiumlrpfdhphsnnxxw', source = 'a'.repeat(40);
const read = name => readFileSync(new URL(`../supabase/${name}`, import.meta.url), 'utf8');

for (const outcome of ['cancelled', 'disabled']) {
  test(`settled rejection followed by ${outcome} retry preserves cutover and restore readiness`, async t => {
    const db = launchPostgres(); let sequence = 0;
    const inv = () => JSON.parse(db.sql(`select public.inventory_launch_legacy_v1('${key}')`));
    const admin = query => db.sql(`set session_replication_role=replica; ${query}`);
    const approve = (i, operation, target = null) => {
      const ref = `cancellation-${++sequence}`;
      db.sql(`insert into private.launch_import_authorizations
       (approval_ref,project_ref,source_commit,schema_identity,expected_scope,fence_epoch,writer_ids,
        control_evidence,test_evidence,settlement_evidence,verified_at,expires_at,operation,target_mode,
        restore_snapshot_ref,restore_replay_ref,restore_coverage_ref)
       values('${ref}','${project}','${source}','${i.schemaIdentity}','${i.scopeHash}',${i.fenceEpoch},
        array['synthetic-current','synthetic-historical'],'control-ref','test-ref','settlement-ref',
        clock_timestamp()-interval '1 second',clock_timestamp()+interval '1 hour','${operation}',
        ${target ? `'${target}'` : 'null'},${operation === 'restore' ? "'snapshot-ref','replay-ref','coverage-ref'" : 'null,null,null'})`);
      return ref;
    };
    const freshCall = (operation, target, rollback = true) => {
      const i = inv(), ref = approve(i, operation, target);
      const query = operation === 'import'
        ? `select public.reconcile_launch_legacy_v1('${i.scopeHash}','${key}',true)`
        : `select public.set_launch_mode_v1(${i.fenceEpoch},'${target}','${i.scopeHash}','${key}')`;
      try { return JSON.parse(db.sql(`set role service_role; ${rollback ? 'begin;' : ''} ${query}; ${rollback ? 'rollback;' : ''}`)); }
      finally { db.sql(`update private.launch_import_authorizations set revoked_at=clock_timestamp() where approval_ref='${ref}'`); }
    };
    const claim = () => JSON.parse(db.sql(`set role service_role;
     select public.claim_launch_signup_v2('shared@test.invalid','direct','${'a'.repeat(64)}',
      '2026-10-11-v1','recorded','${launchMatch('shared@test.invalid', key)}')`));
    try {
      await db.start();
      db.sql('create role anon; create role authenticated; create role service_role bypassrls; grant usage on schema public to anon,authenticated,service_role');
      db.sql(read('waitlist.sql')); db.sql('grant all on public.waitlist to service_role');
      for (const name of ['20261011050938_add_signup_intents.sql','20261013112838_launch_list_lifecycle.sql','20261013125523_launch_list_canonical_cutover.sql']) db.sql(read(`migrations/${name}`));
      db.sql(`update private.launch_list_control set project_ref='${project}',source_commit='${source}';
       insert into public.waitlist(email) values('shared@test.invalid')`);
      for (const [platform, ip] of [['ios','b'],['android','c']]) {
        const r = JSON.parse(db.sql(`select public.claim_signup_v1('shared@test.invalid','beta','${platform}','direct','${ip.repeat(64)}')`));
        assert.equal(db.sql(`select public.finish_signup_delivery_v1('${r.id}','${r.token}','sent','beta-${platform}')`), 't');
      }
      const betaRows = () => db.sql("select jsonb_agg(to_jsonb(s) order by id) from public.signup_requests s where intent='beta'");
      const beta = betaRows(), first = claim(), tokenHash = 'd'.repeat(64), payload = 'e'.repeat(64);
      assert.equal(db.sql(`select public.pin_launch_payload_v1('${first.id}','${first.token}','${payload}')`), 't');
      assert.equal(db.sql(`select public.authorize_launch_delivery_v1('${first.id}','${first.token}',${first.fenceEpoch},'${tokenHash}')`), 't');
      assert.equal(db.sql(`select public.finish_launch_delivery_v1('${first.id}','${first.token}','failed')`), 't');
      const historical = db.sql(`select jsonb_build_array(delivery_first_attempt_at,launch_token_nonce,launch_unsubscribe_hash,delivery_template_version) from public.signup_requests where id='${first.id}'`);
      if (outcome === 'disabled') await t.test('nullable pre-addition terminal proof remains compatible', () => {
        admin('update private.launch_delivery_guard set claim_token=null,handoff_state=null');
        assert.equal(db.sql('select private.launch_delivery_data_ready_v1()'), 't');
      });
      db.sql(`update public.signup_requests set delivery_attempted_at=now()-interval '6 minutes' where id='${first.id}'`);
      const retry = claim(); assert.equal(retry.send, true); assert.equal(retry.id, first.id); assert.equal(retry.nonce, first.nonce);
      assert.notEqual(retry.token, first.token);
      await t.test('an unsent retry without explicit completion still refuses maintenance entry', () => {
        assert.equal(freshCall('mode', 'fenced').outcome, 'refused');
      });
      if (outcome === 'cancelled') {
        // Withdrawal must also be writable during maintenance. Only the fixture
        // owner simulates a previously closed operational target here.
        admin("update private.launch_list_control set mode='fenced'");
        assert.equal(JSON.parse(db.sql(`set role service_role; select public.withdraw_launch_v1('${tokenHash}')`)).outcome, 'withdrawn');
        admin("update private.launch_list_control set mode='transition'");
        assert.equal(db.sql(`select public.authorize_launch_delivery_v1('${retry.id}','${retry.token}',${retry.fenceEpoch},'${tokenHash}')`), 'f');
        assert.equal(db.sql(`select public.finish_launch_delivery_v1('${retry.id}','${retry.token}','sent','must-not-record')`), 'f');
        assert.equal(claim().suppressed, true);
      } else {
        assert.equal(db.sql(`select public.finish_launch_delivery_v1('${retry.id}','${retry.token}','disabled')`), 't');
      }
      assert.equal(db.sql(`select jsonb_build_array(delivery_first_attempt_at,launch_token_nonce,launch_unsubscribe_hash,delivery_template_version) from public.signup_requests where id='${first.id}'`), historical);
      // Original defect: fresh exact-scope authority still returned refused.
      assert.equal(freshCall('mode', 'fenced', false).outcome, 'mode_changed');
      assert.equal(freshCall('import', null, false).outcome, 'reconciled');
      assert.equal(db.sql(`select private.launch_cutover_data_ready_v1('${key}')`), 't');
      assert.equal(db.sql(`select handoff_token::text from private.launch_delivery_guard where signup_id='${first.id}'`), first.token);
      assert.equal(db.sql(`select payload_hash from private.launch_delivery_guard where signup_id='${first.id}'`), payload);
      assert.equal(db.sql(`select handoff_state||':'||claim_outcome||':'||claim_token::text from private.launch_delivery_guard where signup_id='${first.id}'`), `failed:${outcome}:${retry.token}`);
      admin('update private.launch_list_control set restore_required=true');
      db.sql(`create schema synthetic_preserved; create table synthetic_preserved.guard as select * from private.launch_delivery_guard`);
      const restoreGuard = () => admin('delete from private.launch_delivery_guard; insert into private.launch_delivery_guard select * from synthetic_preserved.guard');
      const assertBlocked = () => {
        assert.equal(freshCall('import').outcome, 'refused');
        assert.equal(freshCall('restore', 'canonical').outcome, 'refused');
        assert.equal(db.sql(`select private.launch_cutover_data_ready_v1('${key}')`), 'f');
        assert.equal(betaRows(), beta);
      };
      for (const [name, edit] of [
        ['missing guard', 'delete from private.launch_delivery_guard'],
        ['missing last handoff', 'update private.launch_delivery_guard set handoff_token=null,handoff_at=null,handoff_state=null'],
        ['uncertain last handoff', "update private.launch_delivery_guard set handoff_state='pending'"],
        ['unsettled last handoff', 'update private.launch_delivery_guard set settled=false'],
        ['missing last handoff time', 'update private.launch_delivery_guard set handoff_at=null'],
        ['missing pinned body', 'update private.launch_delivery_guard set payload_hash=null'],
        ['missing cancellation/disabled proof', 'update private.launch_delivery_guard set claim_outcome=null,claim_finished_at=null'],
        ['wrong lease identity', 'update private.launch_delivery_guard set claim_token=handoff_token'],
        ['unbounded completion time', "update private.launch_delivery_guard set claim_finished_at='infinity'"],
      ]) {
        await t.test(`${name} cannot be repaired by fresh import or restore authority`, () => {
          admin(edit); try { assertBlocked(); } finally { restoreGuard(); }
        });
      }
      if (outcome === 'disabled') await t.test('later withdrawal retires the disabled lease without losing the rejection', () => {
        assert.equal(JSON.parse(db.sql(`set role service_role; select public.withdraw_launch_v1('${tokenHash}')`)).outcome, 'withdrawn');
        assert.equal(db.sql(`select public.finish_launch_delivery_v1('${retry.id}','${retry.token}','sent','must-not-record')`), 'f');
        assert.equal(freshCall('import', null, false).outcome, 'reconciled');
        assert.equal(db.sql(`select private.launch_cutover_data_ready_v1('${key}')`), 't');
      });
      await t.test('complete safety facts permit fresh restore-purpose reopen without changing beta or suppression', () => {
        assert.equal(freshCall('restore', 'canonical', false).outcome, 'mode_changed');
        assert.equal(db.sql('select private.launch_write_fence_ready_v1()'), 't');
        assert.equal(betaRows(), beta);
        assert.equal(claim().suppressed, true);
      });
    } finally { db.cleanup(); }
  });
}
