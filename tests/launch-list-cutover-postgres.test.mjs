import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { launchPostgres } from './helpers/launch-postgres.mjs';
import { launchMatch } from '../lib/launch-list.mjs';

const read = name => readFileSync(new URL(`../supabase/${name}`, import.meta.url), 'utf8');
const cutover = 'migrations/20261013125523_launch_list_canonical_cutover.sql';
const key = 'synthetic-cutover-key', project = 'yohiumlrpfdhphsnnxxw', source = 'a'.repeat(40);

// Catches unchecked scope/authority, premature old-writer removal, loss of newer
// withdrawal/provider facts, and restoration of unsafe launch writers.
test('cutover and closed data-only restore real PostgreSQL contract', async t => {
  const db = launchPostgres();
  const inv = () => JSON.parse(db.sql(`select public.inventory_launch_legacy_v1('${key}')`));
  const mode = (i, target, matchKey = key) => JSON.parse(db.sql(`set role service_role;
    select public.set_launch_mode_v1(${i.fenceEpoch},'${target}','${i.scopeHash}','${matchKey}')`));
  let sequence = 0;
  const approve = (i, operation, target = null, extra = '') => {
    const ref = `synthetic-${++sequence}`;
    db.sql(`insert into private.launch_import_authorizations
      (approval_ref,project_ref,source_commit,schema_identity,expected_scope,fence_epoch,writer_ids,
       control_evidence,test_evidence,settlement_evidence,verified_at,expires_at,operation,target_mode
       ${operation === 'restore' ? ',restore_snapshot_ref,restore_replay_ref,restore_coverage_ref' : ''})
      values('${ref}','${project}','${source}','${i.schemaIdentity}','${i.scopeHash}',${i.fenceEpoch},
       array['synthetic-dpl-current','synthetic-dpl-historical','synthetic-script'],
       'control-ref','tested-ref','settlement-ref',clock_timestamp()-interval '1 second',
       clock_timestamp()+interval '1 hour','${operation}',${target ? `'${target}'` : 'null'}
       ${operation === 'restore' ? ", 'snapshot-ref','replay-ref','coverage-ref'" : ''}); ${extra}`);
    return ref;
  };
  const v2 = (email, ip = 'a') => JSON.parse(db.sql(`set role service_role;
    select public.claim_launch_signup_v2('${email}','direct','${ip.repeat(64)}','2026-10-11-v1','recorded','${launchMatch(email, key)}')`));
  const handoff = (r, tokenHash) => {
    assert.equal(db.sql(`select public.pin_launch_payload_v1('${r.id}','${r.token}','${'d'.repeat(64)}')`), 't');
    assert.equal(db.sql(`select public.authorize_launch_delivery_v1('${r.id}','${r.token}',${r.fenceEpoch},'${tokenHash}')`), 't');
  };
  const beta = (platform, ip) => JSON.parse(db.sql(`set lock_timeout='700ms'; set role service_role;
    select public.claim_signup_v1('shared@test.invalid','beta','${platform}','direct','${ip.repeat(64)}')`));
  const betaRows = () => db.sql("select jsonb_agg(to_jsonb(s) order by id) from public.signup_requests s where intent='beta'");
  const admin = sql => db.sql(`set session_replication_role=replica; ${sql}`);
  try {
    await db.start();
    db.sql('create role anon; create role authenticated; create role service_role bypassrls; grant usage on schema public to anon,authenticated,service_role');
    db.sql(read('waitlist.sql')); db.sql('grant all on public.waitlist to service_role');
    db.sql(read('migrations/20261011050938_add_signup_intents.sql'));
    db.sql(read('migrations/20261013112838_launch_list_lifecycle.sql')); db.sql(read(cutover));
    await t.test('four required parameters exist without a three-argument overload or activation', () => {
      assert.equal(db.sql("select to_regprocedure('public.set_launch_mode_v1(bigint,text,text,text)') is not null"), 't');
      assert.equal(db.sql("select to_regprocedure('public.set_launch_mode_v1(bigint,text,text)') is null"), 't');
      assert.equal(db.sql('select mode from private.launch_list_control'), 'transition');
      assert.equal(db.sql('select count(*) from private.launch_import_authorizations'), '0');
    });
    if (db.sql("select to_regprocedure('public.set_launch_mode_v1(bigint,text,text,text)') is not null") !== 't') return;
    db.sql(`update private.launch_list_control set project_ref='${project}',source_commit='${source}'`);
    for (const [p, ip] of [['ios','b'],['android','c']]) {
      const r = beta(p, ip);
      assert.equal(db.sql(`select public.finish_signup_delivery_v1('${r.id}','${r.token}','sent','beta-${p}')`), 't');
    }
    const originalBeta = betaRows();
    db.sql("insert into public.waitlist(email) values('shared@test.invalid'),('old@test.invalid')");
    const r = v2('shared@test.invalid'); const tokenHash = 'b'.repeat(64); handoff(r, tokenHash);
    // Capture the old snapshot BEFORE the later provider result/withdrawal.
    db.sql(`create schema synthetic_preserved; revoke all on schema synthetic_preserved from public,anon,authenticated,service_role;
      create table synthetic_preserved.old_launch as select * from public.signup_requests where intent='launch'`);
    await t.test('known unsettled handoff blocks even attested fence entry; late result persists', () => {
      const i = inv(), ref = approve(i, 'mode', 'fenced');
      assert.equal(mode(i, 'fenced').outcome, 'refused');
      assert.equal(db.sql('select mode from private.launch_list_control'), 'transition');
      assert.equal(db.sql(`select public.finish_launch_delivery_v1('${r.id}','${r.token}','sent','synthetic-provider')`), 't');
      db.sql(`update private.launch_import_authorizations set revoked_at=clock_timestamp() where approval_ref='${ref}'`);
    });
    await t.test('purpose, target, revocation, expiry, source, schema, epoch and equal-count drift refuse without consumption', () => {
      let i = inv(), ref = approve(i, 'import');
      assert.equal(mode(i, 'fenced').outcome, 'refused');
      db.sql(`delete from private.launch_import_authorizations where approval_ref='${ref}'`);
      i = inv(); ref = approve(i, 'mode', 'fenced');
      for (const edit of ["target_mode='canonical'", 'revoked_at=clock_timestamp()',
        "verified_at=clock_timestamp()-interval '2 hours',expires_at=clock_timestamp()-interval '1 hour'",
        `source_commit='${'c'.repeat(40)}'`, `schema_identity='${'c'.repeat(64)}'`, 'fence_epoch=fence_epoch+1',
        "writer_ids=array['duplicate','duplicate']"]) {
        const result = JSON.parse(db.sql(`begin; update private.launch_import_authorizations set ${edit} where approval_ref='${ref}';
          select public.set_launch_mode_v1(${i.fenceEpoch},'fenced','${i.scopeHash}','${key}'); rollback`));
        assert.equal(result.outcome, 'refused');
      }
      assert.equal(mode(i, 'fenced', 'wrong-synthetic-key').outcome, 'refused');
      db.sql("update public.waitlist set created_at=created_at+interval '1 second' where email='old@test.invalid'");
      assert.equal(mode(i, 'fenced').outcome, 'refused');
      assert.equal(db.sql(`select consumed_at is null from private.launch_import_authorizations where approval_ref='${ref}'`), 't');
      db.sql(`update private.launch_import_authorizations set revoked_at=clock_timestamp() where approval_ref='${ref}'`);
    });
    await t.test('authorized fence is atomic, increments epoch, invalidates stale handoff and leaves beta exact', () => {
      const pending = v2('unhanded@test.invalid', 'e');
      const i = inv(), ref = approve(i, 'mode', 'fenced');
      assert.throws(() => db.sql(`begin; select public.set_launch_mode_v1(${i.fenceEpoch},'fenced','${i.scopeHash}','${key}'); select 1/0; commit`), /division by zero/);
      assert.equal(db.sql(`select consumed_at is null from private.launch_import_authorizations where approval_ref='${ref}'`), 't');
      const out = mode(i, 'fenced'); assert.equal(out.outcome, 'mode_changed'); assert.equal(out.fenceEpoch, i.fenceEpoch+1);
      assert.equal(db.sql(`select public.authorize_launch_delivery_v1('${pending.id}','${pending.token}',${pending.fenceEpoch},'${'e'.repeat(64)}')`), 'f');
      assert.equal(mode(i, 'fenced').outcome, 'refused'); assert.equal(betaRows(), originalBeta);
      assert.equal(v2('maintenance@test.invalid').maintenance, true);
    });
    await t.test('withdrawal and authorized late result preserve safety facts while intake is fenced', () => {
      const w = JSON.parse(db.sql(`select public.withdraw_launch_v1('${tokenHash}')`));
      assert.equal(w.outcome, 'withdrawn');
      assert.equal(JSON.parse(db.sql(`select public.withdraw_launch_v1('${tokenHash}')`)).outcome, 'already_withdrawn');
      assert.equal(db.sql(`select provider_id||':'||delivery_state||':'||(withdrawn_at is not null)::text from public.signup_requests where id='${r.id}'`), 'synthetic-provider:sent:true');
      assert.throws(() => db.sql("set role service_role; update public.signup_requests set withdrawn_at=null where intent='launch'"), /launch write fenced/);
      assert.equal(betaRows(), originalBeta);
    });
    await t.test('maintenance records an already handed-off late result without recall or repeat dispatch', () => {
      // Fault injection: a previously recorded handoff was discovered after
      // maintenance. Its matching result must survive even while intake is shut.
      const id = '00000000-0000-4000-8000-000000000055', token = '00000000-0000-4000-8000-000000000056';
      const lateHash = 'c'.repeat(64);
      admin(`insert into public.signup_requests(id,email,intent,platform,source,consent_version,delivery_state,
        delivery_token,launch_match,launch_unsubscribe_hash,delivery_template_version)
        values('${id}','late@test.invalid','launch','unspecified','direct','2026-10-11-v1','sending','${token}',
         '${launchMatch('late@test.invalid', key)}','${lateHash}','launch-v1');
        insert into private.launch_delivery_guard(signup_id,fence_epoch,payload_hash,handoff_token,handoff_at,settled)
         select '${id}',fence_epoch,'${'d'.repeat(64)}','${token}',clock_timestamp(),false from private.launch_list_control`);
      assert.equal(JSON.parse(db.sql(`select public.withdraw_launch_v1('${lateHash}')`)).outcome, 'withdrawn');
      assert.equal(db.sql(`select public.finish_launch_delivery_v1('${id}','${token}','sent','late-provider')`), 't');
      assert.equal(db.sql(`select public.finish_launch_delivery_v1('${id}','${token}','failed')`), 'f');
      assert.equal(db.sql(`select delivery_state||':'||provider_id||':'||(withdrawn_at is not null)::text from public.signup_requests where id='${id}'`), 'sent:late-provider:true');
    });
    await t.test('mode authority cannot import; exact normalization/provenance equality is required for canonical', () => {
      let i = inv(); const ref = approve(i, 'mode', 'canonical');
      assert.equal(JSON.parse(db.sql(`select public.reconcile_launch_legacy_v1('${i.scopeHash}','${key}',true)`)).outcome, 'refused');
      assert.equal(mode(i, 'canonical').outcome, 'refused');
      db.sql(`update private.launch_import_authorizations set revoked_at=clock_timestamp() where approval_ref='${ref}'`);
      i = inv(); approve(i, 'import');
      const result = JSON.parse(db.sql(`select public.reconcile_launch_legacy_v1('${i.scopeHash}','${key}',true)`));
      assert.equal(result.equality, true);
      assert.equal(db.sql("select string_agg(outcome,',' order by outcome) from private.launch_legacy_provenance"), 'review,suppressed');
      assert.equal(db.sql("select consent_status||':'||delivery_state from public.signup_requests where email='old@test.invalid'"), 'unknown:review');
    });
    await t.test('unguarded historical dispatch blocks import even with claimed external settlement', () => {
      admin("insert into public.signup_requests(email,intent,platform,source,consent_version,delivery_state,delivery_token,delivery_first_attempt_at) values('legacy-unsettled@test.invalid','launch','unspecified','direct','original','sending',gen_random_uuid(),now()-interval '2 days')");
      const i = inv(), ref = approve(i, 'import');
      try {
        const result = JSON.parse(db.sql(`select public.reconcile_launch_legacy_v1('${i.scopeHash}','${key}',true)`));
        assert.equal(result.outcome, 'refused');
      } finally {
        admin("delete from public.signup_requests where email='legacy-unsettled@test.invalid'");
        db.sql(`update private.launch_import_authorizations set revoked_at=clock_timestamp() where approval_ref='${ref}'`);
      }
    });
    await t.test('canonical blocks direct insert and obsolete v1 launch before side effects; beta v1 stays available', async () => {
      const i = inv(); approve(i, 'mode', 'canonical');
      const changing = db.asyncSql(`set statement_timeout='12s'; set application_name='cutover-paused'; begin;
        select public.set_launch_mode_v1(${i.fenceEpoch},'canonical','${i.scopeHash}','${key}'); select pg_sleep(2); commit`);
      try {
        let observed = false;
        for (let n = 0; n < 100; n++) {
          if (db.sql("select exists(select 1 from pg_stat_activity where application_name='cutover-paused' and wait_event='PgSleep')") === 't') { observed = true; break; }
          await new Promise(resolve => setTimeout(resolve, 20));
        }
        assert.equal(observed, true);
        assert.equal(beta('ios','f').delivery, 'sent'); assert.equal(beta('android','8').delivery, 'sent');
        assert.equal(betaRows(), originalBeta);
        assert.equal(JSON.parse((await changing).split('\n')[0]).outcome, 'mode_changed');
      } finally { await changing; }
      assert.throws(() => db.sql("set role service_role; insert into public.waitlist(email) values('unsafe@test.invalid')"), /obsolete launch writer/);
      const before = db.sql('select count(*) from public.signup_rate_events');
      const old = JSON.parse(db.sql(`select public.claim_signup_v1('unsafe@test.invalid','launch','unspecified','direct','${'9'.repeat(64)}')`));
      assert.equal(old.maintenance, true); assert.equal(old.send, undefined);
      assert.equal(db.sql(`select public.finish_signup_delivery_v1('${r.id}','${r.token}','sent','obsolete-overwrite')`), 'f');
      assert.equal(db.sql('select count(*) from public.signup_rate_events'), before);
      assert.equal(db.sql("select count(*) from public.signup_requests where email='unsafe@test.invalid'"), '0');
      assert.equal(beta('ios','f').delivery, 'sent'); assert.equal(beta('android','8').delivery, 'sent');
      const fresh = v2('canonical@test.invalid', '7'); assert.equal(fresh.send, true);
      assert.equal(db.sql("select count(*) from public.waitlist where email='canonical@test.invalid'"), '0');
      assert.equal(betaRows(), originalBeta);
    });
    await t.test('missing guard, ambiguous approval and unsafe rollback refuse; metadata is service-only', () => {
      const i = inv(), ref = approve(i, 'mode', 'fenced');
      approve(i, 'mode', 'fenced'); assert.equal(mode(i, 'fenced').outcome, 'refused');
      db.sql(`delete from private.launch_import_authorizations where approval_ref<>'${ref}' and consumed_at is null`);
      db.sql('alter table public.waitlist disable trigger launch_write_fence');
      assert.equal(mode(i, 'fenced').outcome, 'refused'); db.sql('alter table public.waitlist enable trigger launch_write_fence');
      assert.equal(mode(i, 'transition').outcome, 'refused');
      for (const role of ['anon','authenticated']) assert.throws(() => db.sql(`set role ${role}; select public.set_launch_mode_v1(0,'fenced','${i.scopeHash}','${key}')`), /permission denied/);
      assert.equal(db.sql("select bool_and(not prosecdef and pronargdefaults=0) from pg_proc where proname='set_launch_mode_v1'"), 't');
      assert.equal(mode(i, 'fenced').outcome, 'mode_changed');
    });
    await t.test('closed restore from pre-withdrawal snapshot needs complete fresh replay before authorized reopen', () => {
      // Separate owner-only namespace inside the owned network-isolated fixture.
      // The old snapshot intentionally predates withdrawal/provider facts.
      db.sql(`create table synthetic_preserved.latest_launch as select * from public.signup_requests where intent='launch';
        create table synthetic_preserved.suppressions as table private.launch_suppressions;
        create table synthetic_preserved.receipts as table private.launch_withdrawal_receipts;
        create table synthetic_preserved.guards as table private.launch_delivery_guard;
        create table synthetic_preserved.provenance as table private.launch_legacy_provenance;
        create table synthetic_preserved.control as table private.launch_list_control;
        create table synthetic_preserved.authority as table private.launch_import_authorizations;`);
      for (const role of ['anon','authenticated','service_role']) assert.throws(() => db.sql(`set role ${role}; select * from synthetic_preserved.old_launch`), /permission denied/);
      // Isolated data-only target remains externally closed in this drill. Only
      // owner restoration bypasses guards; no runtime bypass is introduced.
      admin(`update private.launch_list_control set restore_required=true,fence_epoch=fence_epoch+1;
        update public.signup_requests s set withdrawn_at=o.withdrawn_at,provider_id=o.provider_id,delivery_state=o.delivery_state
        from synthetic_preserved.old_launch o where s.id=o.id`);
      assert.equal(v2('closed-restore@test.invalid').maintenance, true);
      let i = inv(); let ref = approve(i, 'mode', 'canonical'); assert.equal(mode(i, 'canonical').outcome, 'refused');
      db.sql(`update private.launch_import_authorizations set revoked_at=clock_timestamp() where approval_ref='${ref}'`);
      i = inv(); ref = approve(i, 'restore', 'canonical');
      // Newest unresolved transport evidence cannot be erased by the old
      // snapshot or overruled by a purported coverage attestation.
      admin(`update private.launch_delivery_guard set settled=false where signup_id='${r.id}'`);
      const uncertain = inv(); const uncertainRef = approve(uncertain, 'restore', 'canonical');
      assert.equal(mode(uncertain, 'canonical').outcome, 'refused');
      admin(`update private.launch_delivery_guard set settled=true where signup_id='${r.id}'`);
      db.sql(`update private.launch_import_authorizations set revoked_at=clock_timestamp() where approval_ref in ('${ref}','${uncertainRef}')`);
      i = inv(); ref = approve(i, 'restore', 'canonical');
      assert.equal(mode(i, 'canonical').outcome, 'refused', 'attestation cannot overrule contradictory withdrawal/provider facts');
      // Replay ALL separately retained facts, never an older authority/control.
      admin(`update public.signup_requests s set withdrawn_at=n.withdrawn_at,provider_id=n.provider_id,delivery_state=n.delivery_state,
        delivery_token=n.delivery_token,launch_match=n.launch_match,launch_unsubscribe_hash=n.launch_unsubscribe_hash
        from synthetic_preserved.latest_launch n where s.id=n.id;
        insert into private.launch_suppressions select * from synthetic_preserved.suppressions on conflict do nothing;
        insert into private.launch_withdrawal_receipts select * from synthetic_preserved.receipts on conflict do nothing;
        insert into private.launch_delivery_guard select * from synthetic_preserved.guards on conflict do nothing;
        insert into private.launch_legacy_provenance select * from synthetic_preserved.provenance on conflict do nothing;`);
      assert.equal(mode(i, 'canonical').outcome, 'refused', 'pre-replay scope stale');
      db.sql(`update private.launch_import_authorizations set revoked_at=clock_timestamp() where approval_ref='${ref}'`);
      i = inv(); ref = approve(i, 'mode', 'canonical');
      assert.equal(mode(i, 'canonical').outcome, 'refused', 'complete replay still requires restore-purpose coverage authority');
      db.sql(`update private.launch_import_authorizations set revoked_at=clock_timestamp() where approval_ref='${ref}'`);
      i = inv(); ref = approve(i, 'restore', 'canonical');
      for (const column of ['restore_snapshot_ref','restore_replay_ref','restore_coverage_ref']) {
        assert.throws(() => db.sql(`update private.launch_import_authorizations set ${column}=null where approval_ref='${ref}'`), /check constraint/);
      }
      const result = mode(i, 'canonical'); assert.equal(result.outcome, 'mode_changed'); assert.equal(result.operation, 'restore');
      assert.equal(v2('shared@test.invalid').suppressed, true);
      assert.equal(JSON.parse(db.sql(`select public.withdraw_launch_v1('${tokenHash}')`)).outcome, 'already_withdrawn');
      assert.equal(db.sql(`select provider_id||':'||(withdrawn_at is not null)::text from public.signup_requests where id='${r.id}'`), 'synthetic-provider:true');
      assert.equal(db.sql('select fence_epoch>(select fence_epoch from synthetic_preserved.control) from private.launch_list_control'), 't');
      assert.equal(db.sql(`select bool_and(a.revoked_at is not distinct from n.revoked_at) from synthetic_preserved.authority n join private.launch_import_authorizations a using(approval_ref)`), 't');
      assert.equal(betaRows(), originalBeta);
      assert.throws(() => db.sql("insert into public.waitlist(email) values('restored-unsafe@test.invalid')"), /obsolete launch writer/);
      assert.doesNotMatch(JSON.stringify(result), /@|synthetic-cutover-key|synthetic-provider|handoff|nonce/);
    });
    await t.test('incomplete modern handoff restore requires its matching guard before fresh authority can proceed', async t => {
      const modern = v2('missing-guard@test.invalid', '4'); handoff(modern, 'f'.repeat(64));
      assert.equal(db.sql(`select public.finish_launch_delivery_v1('${modern.id}','${modern.token}','pending')`), 't');
      // Newest synthetic safety evidence is kept separately; the restored row
      // initially has older pending outcome and its guard has been omitted.
      db.sql(`create table synthetic_preserved.modern_guard as select * from private.launch_delivery_guard where signup_id='${modern.id}';
        create table synthetic_preserved.modern_result as select * from public.signup_requests where id='${modern.id}';
        update synthetic_preserved.modern_result set delivery_state='sent',provider_id='synthetic-replayed-provider';
        update synthetic_preserved.modern_guard set handoff_state='sent'`);
      admin(`update private.launch_list_control set mode='fenced',restore_required=true,fence_epoch=fence_epoch+1;
        delete from private.launch_delivery_guard where signup_id='${modern.id}'`);
      const importResult = i => JSON.parse(db.sql(`begin; set role service_role;
        select public.reconcile_launch_legacy_v1('${i.scopeHash}','${key}',true); rollback`));
      const modeResult = i => JSON.parse(db.sql(`begin; set role service_role;
        select public.set_launch_mode_v1(${i.fenceEpoch},'canonical','${i.scopeHash}','${key}'); rollback`));
      const freshCall = (operation, call) => {
        const i = inv(), ref = approve(i, operation, operation === 'restore' ? 'canonical' : null);
        try { return call(i); }
        finally { db.sql(`update private.launch_import_authorizations set revoked_at=clock_timestamp() where approval_ref='${ref}'`); }
      };
      await t.test('missing guard refuses import with fresh exact-scope authority', () => {
        assert.equal(freshCall('import', importResult).outcome, 'refused');
      });
      await t.test('missing guard refuses reopening with fresh restore authority', () => {
        assert.equal(freshCall('restore', modeResult).outcome, 'refused');
      });
      await t.test('missing guard makes canonical data readiness false', () => {
        assert.equal(db.sql(`select private.launch_cutover_data_ready_v1('${key}')`), 'f');
      });
      const replayGuard = () => admin(`delete from private.launch_delivery_guard where signup_id='${modern.id}';
        insert into private.launch_delivery_guard select * from synthetic_preserved.modern_guard`);
      replayGuard();
      const assertBlocked = () => {
        assert.equal(freshCall('import', importResult).outcome, 'refused');
        assert.equal(freshCall('restore', modeResult).outcome, 'refused');
        assert.equal(db.sql(`select private.launch_cutover_data_ready_v1('${key}')`), 'f');
        assert.equal(betaRows(), originalBeta);
      };
      await t.test('replaying the guard alone leaves unresolved pending outcome blocked', assertBlocked);
      admin(`update public.signup_requests s set delivery_state=n.delivery_state,provider_id=n.provider_id
        from synthetic_preserved.modern_result n where s.id=n.id`);
      for (const [name, edit] of [
        ['mismatched handoff token', 'handoff_token=gen_random_uuid()'],
        ['missing handoff time', 'handoff_at=null'],
        ['missing pinned payload', 'payload_hash=null'],
        ['unsettled outcome', 'settled=false'],
        ['conflicting handoff result', "handoff_state='pending'"],
      ]) {
        await t.test(`replayed ${name} refuses fresh authority`, () => {
          admin(`update private.launch_delivery_guard set ${edit} where signup_id='${modern.id}'`);
          try { assertBlocked(); } finally { replayGuard(); }
        });
      }
      await t.test('complete matching guard and terminal result replay permit fresh authorized reopen', () => {
        assert.equal(db.sql(`select private.launch_cutover_data_ready_v1('${key}')`), 't');
        const i = inv(); approve(i, 'import'); assert.equal(importResult(i).outcome, 'reconciled');
        approve(i, 'restore', 'canonical'); assert.equal(mode(i, 'canonical').outcome, 'mode_changed');
        assert.equal(betaRows(), originalBeta);
        assert.equal(db.sql('select private.launch_write_fence_ready_v1()'), 't');
      });
    });
  } finally { db.cleanup(); }
});
