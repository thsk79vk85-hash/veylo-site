import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { launchPostgres } from './helpers/launch-postgres.mjs';
import { launchMatch } from '../lib/launch-list.mjs';

const read = name => readFileSync(new URL(`../supabase/${name}`, import.meta.url), 'utf8');
const lifecycle = 'migrations/20261013112838_launch_list_lifecycle.sql';
const cutover = 'migrations/20261013125523_launch_list_canonical_cutover.sql';
const key = 'synthetic-fence-match', project = 'yohiumlrpfdhphsnnxxw', source = 'a'.repeat(40);

test('launch-only fence preserves independent beta availability', async t => {
  const db = launchPostgres();
  const invSql = `select public.inventory_launch_legacy_v1('${key}')`;
  const inventory = () => JSON.parse(db.sql(invSql));
  const applySql = scope => `select public.reconcile_launch_legacy_v1('${scope}','${key}',true)`;
  const authorize = (inv, ref) => db.sql(`insert into private.launch_import_authorizations
    (approval_ref,project_ref,source_commit,schema_identity,expected_scope,fence_epoch,writer_ids,control_evidence,test_evidence,settlement_evidence,verified_at,expires_at)
    values('${ref}','${project}','${source}','${inv.schemaIdentity}','${inv.scopeHash}',1,array['v1','v2','direct'],
      'control','tested','settled',clock_timestamp()-interval '1 second',clock_timestamp()+interval '1 hour')`);
  const beta = (email, platform, ip) => `select public.claim_signup_v1('${email}','beta','${platform}','direct','${ip.repeat(64)}')`;
  const wait = async (name, sleep = true) => {
    for (let i = 0; i < 100; i++) {
      if (db.sql(`select exists(select 1 from pg_stat_activity where application_name='${name}' and ${sleep ? "wait_event='PgSleep'" : 'cardinality(pg_blocking_pids(pid))>0'})`) === 't') return;
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    assert.fail('Expected independent-session state was not observed');
  };
  try {
    await db.start();
    db.sql('create role anon; create role authenticated; create role service_role bypassrls; grant usage on schema public to anon,authenticated,service_role');
    db.sql(read('waitlist.sql')); db.sql('grant all on public.waitlist to service_role');
    db.sql(read('migrations/20261011050938_add_signup_intents.sql')); db.sql(read(lifecycle));
    db.sql(`insert into public.waitlist(email) values('shared@test.invalid');
      update private.launch_list_control set project_ref='${project}',source_commit='${source}',fence_epoch=1,mode='fenced'`);
    await t.test('inventory transaction does not hold beta writes and beta is outside approval scope', async () => {
      const before = inventory();
      const paused = db.asyncSql(`set statement_timeout='12s'; set application_name='inventory-paused'; begin; ${invSql}; select pg_sleep(3); commit`);
      try {
        await wait('inventory-paused');
        for (const [email, platform, ip] of [['shared@test.invalid','ios','a'],['other@test.invalid','android','b']]) {
          const claim = JSON.parse(db.sql(`set lock_timeout='700ms'; set role service_role; ${beta(email, platform, ip)}`));
          assert.equal(claim.send, true);
          assert.equal(db.sql(`set lock_timeout='700ms'; set role service_role; select public.finish_signup_delivery_v1('${claim.id}','${claim.token}','sent','beta-provider')`), 't');
        }
        assert.equal(inventory().scopeHash, before.scopeHash);
      } finally { await paused; }
    });
    await t.test('inventory runs inside an actual read-only transaction', () => {
      assert.equal(JSON.parse(db.sql(`begin read only; ${invSql}; commit`)).writes, 0);
    });
    await t.test('inventory uses one calling-statement snapshot despite concurrent source and beta commits', async () => {
      const before = inventory();
      const paused = db.asyncSql(`set statement_timeout='12s'; set application_name='snapshot-paused'; select public.inventory_launch_legacy_v1('${key}') from pg_sleep(2)`);
      try {
        await wait('snapshot-paused');
        db.sql("insert into public.waitlist(email) values('snapshot-new@test.invalid')");
        assert.equal(JSON.parse(db.sql(beta('snapshot-beta@test.invalid','android','9'))).send, true);
        assert.deepEqual(JSON.parse(await paused), before);
        assert.notEqual(inventory().scopeHash, before.scopeHash);
      } finally { await paused; db.sql("delete from public.waitlist where email='snapshot-new@test.invalid'"); }
    });
    await t.test('valid authority alone cannot apply without installed launch guard capability', () => {
      const inv = inventory(); authorize(inv, 'before-guard');
      assert.equal(JSON.parse(db.sql(applySql(inv.scopeHash))).outcome, 'refused');
      assert.equal(db.sql('select count(*) from private.launch_legacy_provenance'), '0');
    });
    db.sql("update private.launch_list_control set mode='transition'");
    db.sql(read(cutover));
    await t.test('cutover prerequisite exists without changing the operational mode', () => {
      assert.equal(db.sql("select to_regprocedure('private.launch_write_fence_ready_v1()') is not null"), 't');
      assert.equal(db.sql('select mode from private.launch_list_control'), 'transition');
      const control = db.sql('select to_jsonb(c) from private.launch_list_control c');
      db.sql(read(cutover));
      assert.equal(db.sql('select to_jsonb(c) from private.launch_list_control c'), control);
    });
    if (db.sql("select to_regprocedure('private.launch_write_fence_ready_v1()') is not null") !== 't') return;
    db.sql("update private.launch_list_control set mode='fenced'");
    await t.test('apply does not wait for an existing beta email lock or block same-address other-platform beta', async () => {
      const inv = inventory(); authorize(inv, 'beta-overlap');
      const betaHolder = db.asyncSql(`set statement_timeout='12s'; set application_name='beta-email-holder'; begin;
        select pg_advisory_xact_lock(hashtextextended('signup-email:shared@test.invalid',0)); select pg_sleep(3);
        ${beta('shared@test.invalid','android','c')}; commit`);
      try {
        await wait('beta-email-holder');
        const result = JSON.parse(db.sql(`set lock_timeout='700ms'; set role service_role; ${applySql(inv.scopeHash)}`));
        assert.equal(result.outcome, 'reconciled');
        assert.equal(JSON.parse((await betaHolder).trim().split('\n').at(-1)).send, true);
      } finally { await betaHolder; }
      const replay = JSON.parse(db.sql(applySql(inv.scopeHash)));
      assert.equal(replay.outcome, 'reconciled');
    });
    await t.test('beta claim and finish commit while apply transaction still owns launch fence', async () => {
      const inv = inventory(); authorize(inv, 'beta-during-apply');
      const paused = db.asyncSql(`set statement_timeout='12s'; set application_name='apply-paused'; begin; ${applySql(inv.scopeHash)}; select pg_sleep(3); commit`);
      try {
        await wait('apply-paused');
        const before = db.sql("select jsonb_agg(to_jsonb(s) order by id) from public.signup_requests s where intent='beta'");
        for (const [email, platform, ip] of [['shared@test.invalid','ios','d'],['another@test.invalid','android','e']]) {
          const claim = JSON.parse(db.sql(`set lock_timeout='700ms'; set role service_role; ${beta(email, platform, ip)}`));
          if (claim.send) assert.equal(db.sql(`set lock_timeout='700ms'; set role service_role; select public.finish_signup_delivery_v1('${claim.id}','${claim.token}','sent','during-import')`), 't');
          else assert.equal(claim.delivery, 'sent');
        }
        assert.ok(before.includes('beta-provider'));
        assert.equal(db.sql("select count(*) from public.signup_requests where email='shared@test.invalid' and intent='beta'"), '2');
        assert.equal(db.sql("select provider_id from public.signup_requests where email='shared@test.invalid' and intent='beta' and platform='ios'"), 'beta-provider');
        assert.equal(db.sql("select jsonb_agg(to_jsonb(s) order by id) from public.signup_requests s where intent='beta' and email<>'another@test.invalid'"), before);
      } finally { await paused; }
    });
    await t.test('fenced ordinary direct launch writes fail, beta stays writable, bypass is empty after success', () => {
      for (const sql of ["insert into public.waitlist(email) values('forbidden@test.invalid')",
        "update public.signup_requests set source='changed' where intent='launch'",
        "delete from public.signup_requests where intent='launch'",
        "update public.signup_requests set intent='launch' where intent='beta' and platform='ios'"]) {
        assert.throws(() => db.sql(`set role service_role; ${sql}`), /launch write fenced/);
      }
      assert.equal(db.sql('select count(*) from private.launch_import_context'), '0');
      assert.equal(JSON.parse(db.sql(`select public.claim_signup_v1('forbidden@test.invalid','launch','unspecified','direct','${'f'.repeat(64)}')`)).maintenance, true);
    });
    await t.test('legacy v1 launch waits on outer fence before IP/email while beta with same IP proceeds', async () => {
      const holder = db.asyncSql("set statement_timeout='12s'; set application_name='outer-holder'; begin; select pg_advisory_xact_lock(hashtextextended('launch-list-fence',0)); select pg_sleep(3); commit");
      let launch;
      try {
        await wait('outer-holder');
        launch = db.asyncSql(`set statement_timeout='12s'; set application_name='legacy-launch-waiter'; select public.claim_signup_v1('shared@test.invalid','launch','unspecified','direct','${'7'.repeat(64)}')`);
        await wait('legacy-launch-waiter', false);
        assert.equal(JSON.parse(db.sql(`set lock_timeout='700ms'; ${beta('free@test.invalid','android','7')}`)).send, true);
        assert.throws(() => db.sql("set lock_timeout='700ms'; set role service_role; insert into public.waitlist(email) values('direct@test.invalid')"), /launch write fenced/);
        // UPDATE has acquired a tuple lock before its BEFORE ROW trigger. A
        // blocking outer-lock call here would invert ordering; try-lock refuses.
        assert.throws(() => db.sql("set lock_timeout='700ms'; set role service_role; update public.signup_requests set source='direct-race' where intent='launch'"), /launch write fenced/);
        await holder; assert.equal(JSON.parse(await launch).maintenance, true);
      } finally { await Promise.allSettled([holder, launch].filter(Boolean)); }
    });
    await t.test('transition legacy behavior is retained and disabled/tampered capability refuses apply', () => {
      db.sql("update private.launch_list_control set mode='transition'");
      const claim = JSON.parse(db.sql(`select public.claim_signup_v1('transition@test.invalid','launch','unspecified','direct','${'8'.repeat(64)}')`));
      assert.equal(claim.send, true);
      assert.equal(db.sql(`select public.finish_signup_delivery_v1('${claim.id}','${claim.token}','sent','legacy-provider')`), 't');
      db.sql("update private.launch_list_control set mode='fenced'");
      const beforeDisable = inventory();
      db.sql('alter table public.waitlist disable trigger launch_write_fence');
      assert.equal(db.sql('select private.launch_write_fence_ready_v1()'), 'f');
      const inv = inventory();
      assert.notEqual(inv.schemaIdentity, beforeDisable.schemaIdentity);
      authorize(inv, 'guard-disabled'); assert.equal(JSON.parse(db.sql(applySql(inv.scopeHash))).outcome, 'refused');
      db.sql('alter table public.waitlist enable trigger launch_write_fence');
      assert.equal(db.sql('select private.launch_write_fence_ready_v1()'), 't');
      db.sql("update private.launch_import_authorizations set revoked_at=clock_timestamp() where approval_ref='guard-disabled'");
    });
    await t.test('same-transaction post-apply mutation cannot reuse bypass; actual abort removes context and consumption', () => {
      const inv = inventory(); authorize(inv, 'abort-bypass');
      assert.throws(() => db.sql(`begin; ${applySql(inv.scopeHash)}; insert into public.waitlist(email) values('leaked@test.invalid'); commit`), /launch write fenced/);
      assert.equal(db.sql('select count(*) from private.launch_import_context'), '0');
      assert.equal(db.sql("select consumed_at is null from private.launch_import_authorizations where approval_ref='abort-bypass'"), 't');
      assert.equal(JSON.parse(db.sql(applySql(inv.scopeHash))).outcome, 'reconciled');
      assert.equal(db.sql('select count(*) from private.launch_import_context'), '0');
    });
    await t.test('active importer context cannot turn an imported row into a send', () => {
      db.sql("update private.launch_list_control set mode='transition'; insert into public.waitlist(email) values('narrow@test.invalid'); update private.launch_list_control set mode='fenced'");
      db.sql(`create function public.launch_narrow_fixture() returns trigger language plpgsql as $$begin
        update public.signup_requests set delivery_state='sending' where id=new.id; return new; end$$;
        create trigger narrow_fixture after insert on public.signup_requests for each row execute function public.launch_narrow_fixture()`);
      const inv = inventory(); authorize(inv, 'narrow-context');
      assert.throws(() => db.sql(applySql(inv.scopeHash)), /launch reconciliation unavailable/);
      assert.equal(db.sql("select count(*) from public.signup_requests where email='narrow@test.invalid'"), '0');
      assert.equal(db.sql('select count(*) from private.launch_import_context'), '0');
      assert.equal(db.sql("select consumed_at is null from private.launch_import_authorizations where approval_ref='narrow-context'"), 't');
      db.sql('drop trigger narrow_fixture on public.signup_requests; drop function public.launch_narrow_fixture()');
    });
    await t.test('guard/context metadata is private and service cannot self-certify installed capability', () => {
      for (const role of ['anon','authenticated']) {
        for (const table of ['launch_import_context','launch_write_fence_contract']) {
          assert.throws(() => db.sql(`set role ${role}; select * from private.${table}`), /permission denied/);
        }
        assert.equal(db.sql(`select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and has_function_privilege('${role}',p.oid,'execute')`), '0');
      }
      assert.throws(() => db.sql("set role service_role; update private.launch_write_fence_contract set definition_hash=repeat('a',64)"), /permission denied/);
      assert.throws(() => db.sql('set role service_role; truncate public.waitlist'), /permission denied/);
    });
    await t.test('guarded v2 handoff/finish/withdrawal retain transition behavior and history', () => {
      db.sql("update private.launch_list_control set mode='transition'");
      const c = JSON.parse(db.sql(`set role service_role; select public.claim_launch_signup_v2('guarded-v2@test.invalid','direct','${'6'.repeat(64)}','2026-10-11-v1','recorded','${launchMatch('guarded-v2@test.invalid', key)}')`));
      assert.equal(c.send, true);
      assert.equal(db.sql(`set role service_role; select public.pin_launch_payload_v1('${c.id}','${c.token}','${'a'.repeat(64)}')`), 't');
      assert.equal(db.sql(`set role service_role; select public.authorize_launch_delivery_v1('${c.id}','${c.token}',${c.fenceEpoch},'${'b'.repeat(64)}')`), 't');
      assert.equal(db.sql(`set role service_role; select public.finish_launch_delivery_v1('${c.id}','${c.token}','sent','synthetic-guarded-provider')`), 't');
      assert.equal(JSON.parse(db.sql(`set role service_role; select public.withdraw_launch_v1('${'b'.repeat(64)}')`)).outcome, 'withdrawn');
      assert.equal(db.sql(`select (withdrawn_at is not null and provider_id='synthetic-guarded-provider' and delivery_state='sent')::text from public.signup_requests where id='${c.id}'`), 'true');
      db.sql("update private.launch_list_control set mode='fenced'");
    });
  } finally { db.cleanup(); }
});
