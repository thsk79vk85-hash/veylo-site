import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { launchPostgres } from './helpers/launch-postgres.mjs';
import { registerSignup } from '../lib/signup.mjs';
import { launchEnv, launchSignup, json } from './helpers/guarded-launch.mjs';
import { launchMatch } from '../lib/launch-list.mjs';

const root = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const hash = 'a'.repeat(64);
const claim = (email, intent = 'launch', platform = 'unspecified', ip = hash) =>
  `select public.claim_signup_v1('${email}','${intent}','${platform}','direct','${ip}');`;

test('zero-send consolidation real PostgreSQL contract', async t => {
  const db = launchPostgres(), key = 'synthetic-only-match-key', project = 'yohiumlrpfdhphsnnxxw', source = 'a'.repeat(40);
  // Fixture administrator only; runtime calls below always use origin guards.
  // Each sql invocation owns a separate connection, so this cannot leak.
  const seed = query => db.sql(`set session_replication_role=replica; ${query}`);
  const inventory = () => JSON.parse(db.sql(`set role service_role; select public.inventory_launch_legacy_v1('${key}')`));
  const apply = (scope, enabled = true) => JSON.parse(db.sql(`set role service_role; select public.reconcile_launch_legacy_v1('${scope}','${key}',${enabled})`));
  const snapshot = () => db.sql(`select jsonb_build_array(
    (select jsonb_agg(jsonb_build_array(to_jsonb(w),w.xmin::text) order by id) from public.waitlist w),
    (select jsonb_agg(jsonb_build_array(to_jsonb(s),s.xmin::text) order by id) from public.signup_requests s),
    (select jsonb_agg(jsonb_build_array(to_jsonb(p),p.xmin::text) order by legacy_id) from private.launch_legacy_provenance p),
    (select jsonb_agg(jsonb_build_array(to_jsonb(a),a.xmin::text) order by approval_ref) from private.launch_import_authorizations a),
    (select jsonb_agg(jsonb_build_array(to_jsonb(c),c.xmin::text)) from private.launch_list_control c),
    (select jsonb_agg(jsonb_build_array(to_jsonb(s),s.xmin::text) order by launch_match) from private.launch_suppressions s),
    (select jsonb_agg(jsonb_build_array(to_jsonb(w),w.xmin::text) order by token_hash) from private.launch_withdrawal_receipts w),
    (select jsonb_agg(jsonb_build_array(to_jsonb(g),g.xmin::text) order by signup_id) from private.launch_delivery_guard g),
    (select jsonb_agg(jsonb_build_array(to_jsonb(r),r.xmin::text) order by id) from public.signup_rate_events r))`);
  const authorize = (inv, ref = 'fixture-approval') => db.sql(`insert into private.launch_import_authorizations
    (approval_ref,project_ref,source_commit,schema_identity,expected_scope,fence_epoch,writer_ids,control_evidence,test_evidence,settlement_evidence,verified_at,expires_at)
    values('${ref}','${project}','${source}','${inv.schemaIdentity}','${inv.scopeHash}',${inv.fenceEpoch},
      array['legacy-v1','website-v2'],'control-1','test-1','settled-1',clock_timestamp()-interval '1 second',clock_timestamp()+interval '1 hour')`);
  try {
    await db.start();
    db.sql('create role anon; create role authenticated; create role service_role bypassrls; grant usage on schema public to anon,authenticated,service_role;');
    db.sql(read('supabase/waitlist.sql')); db.sql('grant all on public.waitlist to service_role');
    db.sql(read('supabase/migrations/20261011050938_add_signup_intents.sql'));
    db.sql(read('supabase/migrations/20261013112838_launch_list_lifecycle.sql'));
    await t.test('service-only reconciliation capability exists', () => {
      assert.equal(db.sql("select to_regprocedure('public.reconcile_launch_legacy_v1(text,text,boolean)') is not null"), 't', 'no-send reconciliation RPC implemented');
    });
    if (db.sql("select to_regprocedure('public.reconcile_launch_legacy_v1(text,text,boolean)') is not null") !== 't') return;
    await t.test('migration grants no authority; unconfigured inventory and dry-run make zero writes', () => {
      assert.equal(db.sql('select count(*) from private.launch_import_authorizations'), '0');
      const before = snapshot(), inv = inventory();
      assert.equal(inv.configured, false); assert.equal(inv.writes, 0); assert.equal(inv.emails, 0);
      assert.equal(apply(inv.scopeHash, false).outcome, 'dry_run');
      assert.equal(apply(inv.scopeHash).outcome, 'refused'); assert.equal(snapshot(), before);
    });
    db.sql(read('supabase/migrations/20261013125523_launch_list_canonical_cutover.sql'));
    seed(`update private.launch_list_control set mode='fenced',fence_epoch=1,project_ref='${project}',source_commit='${source}';
      insert into public.waitlist(email,created_at) values ('old@test.invalid','2026-01-01'),('overlap@test.invalid','2026-01-02'),('gone@test.invalid','2026-01-03');
      insert into public.signup_requests(email,intent,platform,source,consent_version,delivery_state,provider_id,launch_token_nonce,delivery_template_version,delivery_token)
      values('overlap@test.invalid','launch','unspecified','direct','original','sent','provider-original','00000000-0000-4000-8000-000000000001','launch-v1','00000000-0000-4000-8000-000000000071'),
      ('overlap@test.invalid','beta','ios','direct','original','sent','beta-original',null,null,null);
      insert into private.launch_delivery_guard(signup_id,fence_epoch,payload_hash,handoff_token,handoff_at,settled)
        select id,1,'${'d'.repeat(64)}',delivery_token,now()-interval '2 days',true from public.signup_requests where email='overlap@test.invalid' and intent='launch';
      insert into private.launch_suppressions values('${launchMatch('gone@test.invalid', key)}','2026-01-04','unsubscribe');`);
    await t.test('keyed scope changes for equal-count edits and key changes, never exposes subscriber content', () => {
      const inv = inventory();
      seed("update public.waitlist set created_at='2026-01-05' where email='old@test.invalid'");
      assert.notEqual(inventory().scopeHash, inv.scopeHash);
      const other = JSON.parse(db.sql("select public.inventory_launch_legacy_v1('other-synthetic-key')"));
      assert.notEqual(other.scopeHash, inventory().scopeHash);
      assert.doesNotMatch(JSON.stringify(inv), /@|synthetic-only|provider-original|00000000|old@test/);
    });
    await t.test('missing, expired, revoked, source/schema/epoch mismatch or uncontrolled evidence refuses without writes', () => {
      const inv = inventory(); assert.equal(apply(inv.scopeHash).outcome, 'refused'); authorize(inv);
      for (const edit of ["expires_at=clock_timestamp()-interval '1 millisecond',verified_at=clock_timestamp()-interval '1 hour'",
        'revoked_at=clock_timestamp()', `source_commit='${'d'.repeat(40)}'`, `schema_identity='${'d'.repeat(64)}'`, 'fence_epoch=0']) {
        const out = JSON.parse(db.sql(`begin; update private.launch_import_authorizations set ${edit}; select public.reconcile_launch_legacy_v1('${inv.scopeHash}','${key}',true); rollback;`));
        assert.equal(out.outcome, 'refused');
      }
      const before = snapshot(); assert.equal(apply('f'.repeat(64)).outcome, 'refused'); assert.equal(snapshot(), before);
      assert.throws(() => db.sql("update private.launch_import_authorizations set writer_ids='{}'"), /check constraint/);
      assert.throws(() => db.sql("update private.launch_import_authorizations set settlement_evidence=''"), /check constraint/);
      authorize(inv, 'ambiguous'); assert.equal(apply(inv.scopeHash).outcome, 'refused');
      db.sql("delete from private.launch_import_authorizations where approval_ref='ambiguous'");
    });
    await t.test('apply preserves canonical/beta bytes and attaches exact original IDs/times; retry is identical', () => {
      const canonical = () => db.sql("select jsonb_agg(to_jsonb(s) order by id) from public.signup_requests s where email='overlap@test.invalid'");
      const before = canonical(), inv = inventory(), result = apply(inv.scopeHash);
      assert.equal(result.outcome, 'reconciled'); assert.equal(result.equality, true); assert.equal(result.emails, 0);
      assert.equal(canonical(), before);
      assert.equal(db.sql("select delivery_state||':'||registration_origin||':'||consent_status||':'||(consent_version is null)::text from public.signup_requests where email='old@test.invalid'"), 'review:legacy_import:unknown:true');
      assert.equal(db.sql("select count(*) from public.signup_requests where email='gone@test.invalid'"), '0');
      assert.equal(db.sql(`select bool_and(p.legacy_created_at=w.created_at and p.launch_match=encode(public.hmac(w.email,'${key}','sha256'),'hex') and
        ((w.email='gone@test.invalid' and p.signup_id is null and p.outcome='suppressed') or (s.email=w.email and s.intent='launch')))
        from public.waitlist w join private.launch_legacy_provenance p on p.legacy_id=w.id left join public.signup_requests s on s.id=p.signup_id`), 't');
      const after = snapshot(); assert.deepEqual(apply(inv.scopeHash), result); assert.equal(snapshot(), after);
      seed("insert into public.waitlist(email) values('new-after-approval@test.invalid')");
      assert.equal(apply(inv.scopeHash).outcome, 'refused');
      assert.equal(db.sql("select count(*) from public.signup_requests where email='new-after-approval@test.invalid'"), '0');
    });
    await t.test('transaction abort rolls back mappings, import and consumed authority', () => {
      const inv = inventory(); authorize(inv, 'crash-approval'); const before = snapshot();
      const rolledBackId = db.sql(`begin; select public.reconcile_launch_legacy_v1('${inv.scopeHash}','${key}',true); select id from public.signup_requests where email='new-after-approval@test.invalid'; rollback;`).split('\n').at(-1);
      assert.match(rolledBackId, /^[0-9a-f-]{36}$/); assert.equal(snapshot(), before);
      assert.throws(() => db.sql(`begin; select public.reconcile_launch_legacy_v1('${inv.scopeHash}','${key}',true); select 1/0; commit;`), /division by zero/);
      assert.equal(snapshot(), before);
      assert.equal(apply(inv.scopeHash).outcome, 'reconciled');
      assert.equal(db.sql("select id from public.signup_requests where email='new-after-approval@test.invalid'"), rolledBackId);
    });
    await t.test('malformed and normalization-conflicting rows block all reconciliation and disposition', () => {
      seed("insert into public.waitlist(email) values('malformed')");
      let inv = inventory(); authorize(inv, 'malformed-approval'); let before = snapshot();
      assert.equal(inv.counts.invalid, 1); assert.equal(apply(inv.scopeHash).outcome, 'review'); assert.equal(snapshot(), before);
      seed("delete from public.waitlist where email='malformed'; alter table public.waitlist drop constraint waitlist_email_is_normalized; insert into public.waitlist(email) values(' OLD@test.invalid ')");
      inv = inventory(); authorize(inv, 'conflict-approval'); before = snapshot();
      assert.ok(inv.counts.conflicts > 0); assert.equal(apply(inv.scopeHash).disposalAllowed, false); assert.equal(snapshot(), before);
      seed("delete from public.waitlist where email=' OLD@test.invalid '");
    });
    await t.test('authorization and RPCs deny public clients; no security definer bypass', () => {
      for (const role of ['anon', 'authenticated']) {
        assert.throws(() => db.sql(`set role ${role}; select * from private.launch_import_authorizations`), /permission denied/);
        for (const call of [`inventory_launch_legacy_v1('${key}')`, `reconcile_launch_legacy_v1('x','${key}',true)`, "read_launch_import_authorization_v1('fixture-approval')"]) {
          assert.throws(() => db.sql(`set role ${role}; select public.${call}`), /permission denied/);
        }
      }
      assert.equal(db.sql("select bool_and(not prosecdef) from pg_proc where proname in ('inventory_launch_legacy_v1','reconcile_launch_legacy_v1','read_launch_import_authorization_v1')"), 't');
    });
    await t.test('observed unsettled handoff refuses even with a purported settlement attestation', () => {
      seed("update private.launch_delivery_guard set settled=false where signup_id=(select id from public.signup_requests where email='overlap@test.invalid' and intent='launch')");
      const inv = inventory(); authorize(inv, 'unsettled-approval'); const before = snapshot();
      assert.equal(apply(inv.scopeHash).outcome, 'refused'); assert.equal(snapshot(), before);
      seed("update private.launch_delivery_guard set settled=true");
    });
    await t.test('actual schema, control source and epoch changes invalidate authority before writes', () => {
      const inv = inventory(); authorize(inv, 'drift-approval');
      for (const change of ["alter table public.waitlist add column synthetic_version text",
        `update private.launch_list_control set source_commit='${'c'.repeat(40)}'`,
        'update private.launch_list_control set fence_epoch=fence_epoch+1',
        "update private.launch_list_control set mode='transition'"]) {
        const result = JSON.parse(db.sql(`begin; ${change}; select public.reconcile_launch_legacy_v1('${inv.scopeHash}','${key}',true); rollback;`));
        assert.equal(result.outcome, 'refused'); assert.equal(result.writes, 0);
      }
      db.sql("update private.launch_import_authorizations set revoked_at=clock_timestamp() where approval_ref='drift-approval'");
    });
    await t.test('control row version is included and duplicate tested-writer IDs cannot apply', () => {
      const old = inventory(); db.sql('update private.launch_list_control set source_commit=source_commit');
      const inv = inventory(); assert.notEqual(inv.scopeHash, old.scopeHash);
      authorize(inv, 'duplicate-writers'); db.sql("update private.launch_import_authorizations set writer_ids=array['same','same'] where approval_ref='duplicate-writers'");
      const before = snapshot(); assert.equal(apply(inv.scopeHash).outcome, 'refused'); assert.equal(snapshot(), before);
      db.sql("update private.launch_import_authorizations set revoked_at=clock_timestamp() where approval_ref='duplicate-writers'");
    });
    await t.test('SQL normalization/HMAC matches JS for supported whitespace and flags Unicode for review', () => {
      const actual = db.sql(`select private.normalize_launch_import_email_v1(U&'\\00A0\\0009Mixed@TEST.invalid\\FEFF')`);
      assert.equal(actual, 'mixed@test.invalid');
      assert.equal(db.sql(`select private.launch_import_mac_v1(private.normalize_launch_import_email_v1(U&'\\00A0Mixed@TEST.invalid\\FEFF'),'${key}')`), launchMatch('\u00a0Mixed@TEST.invalid\ufeff', key));
      seed("insert into public.waitlist(email) values('josé@test.invalid')");
      assert.equal(inventory().counts.invalid, 1);
      seed("delete from public.waitlist where email='josé@test.invalid'");
    });
    await t.test('adapter and CLI against PostgreSQL emit only receipts; default writes nothing, apply retries exactly', async () => {
      const { createConsolidationClient } = await import('../lib/consolidate-launch-list.mjs');
      const { runCli } = await import('../scripts/consolidate-launch-list.mjs');
      const invoked = [];
      const fetchImpl = async (url, options) => {
        const fn = new URL(url).pathname.split('/').at(-1); invoked.push(fn);
        assert.ok(['inventory_launch_legacy_v1','reconcile_launch_legacy_v1','read_launch_import_authorization_v1'].includes(fn));
        const params = Object.entries(JSON.parse(options.body)).map(([name, value]) =>
          `${name}=>${typeof value === 'boolean' ? value : value == null ? 'null' : `'${String(value).replaceAll("'", "''")}'`}`);
        return { ok: true, json: async () => JSON.parse(db.sql(`set role service_role; select public.${fn}(${params.join(',')})`)) };
      };
      const client = createConsolidationClient({ env: { WAITLIST_SUPABASE_URL: `https://${project}.supabase.co`,
        WAITLIST_SUPABASE_SERVICE_ROLE_KEY: 'synthetic-only-service', SIGNUP_LAUNCH_MATCH_SECRET: key }, fetchImpl });
      let output = ''; const stdout = text => { output += text; };
      const before = snapshot(); assert.equal(await runCli([], { client, stdout }), 0); assert.equal(snapshot(), before);
      const inv = inventory(); authorize(inv, 'adapter-approval');
      const argv = ['--apply','--project-ref',project,'--source-commit',source,'--expected-scope',inv.scopeHash,'--approval-ref','adapter-approval'];
      output = ''; assert.equal(await runCli(argv, { client, stdout }), 0);
      const first = output; const after = snapshot(); output = '';
      assert.equal(await runCli(argv, { client, stdout }), 0); assert.equal(output, first); assert.equal(snapshot(), after);
      assert.doesNotMatch(output, /@|synthetic-only|provider-original|00000000|payload|handoff|nonce/);
      assert.ok(invoked.length > 0);
    });
    await t.test('withdrawal holds outer fence; concurrent importer blocks then refuses stale authority', async () => {
      seed(`insert into public.waitlist(email) values('race-import@test.invalid');
        insert into public.signup_requests(email,intent,platform,source,consent_version,delivery_state,launch_match,launch_unsubscribe_hash)
        values('race-import@test.invalid','launch','unspecified','direct','original','review','${launchMatch('race-import@test.invalid', key)}','${'e'.repeat(64)}')`);
      const inv = inventory(); authorize(inv, 'race-approval');
      const first = db.asyncSql(`set statement_timeout='12s'; set application_name='import-withdraw-holder'; begin;
        update private.launch_list_control set mode='transition'; select public.withdraw_launch_v1('${'e'.repeat(64)}');
        update private.launch_list_control set mode='fenced'; select pg_sleep(3); commit;`);
      const wait = async query => { for (let i = 0; i < 100; i++) { if (db.sql(query) === 't') return; await new Promise(r => setTimeout(r, 20)); } assert.fail('independent session did not block'); };
      let second;
      try {
        await wait("select exists(select 1 from pg_stat_activity where application_name='import-withdraw-holder' and wait_event='PgSleep')");
        second = db.asyncSql(`set statement_timeout='12s'; set application_name='import-contender'; select public.reconcile_launch_legacy_v1('${inv.scopeHash}','${key}',true)`);
        await wait("select exists(select 1 from pg_stat_activity where application_name='import-contender' and cardinality(pg_blocking_pids(pid))>0)");
        await first; assert.equal(JSON.parse(await second).outcome, 'refused');
      } finally { await Promise.allSettled([first, second].filter(Boolean)); }
      const fresh = inventory(); authorize(fresh, 'race-fresh'); assert.equal(apply(fresh.scopeHash).outcome, 'reconciled');
      assert.equal(db.sql("select outcome from private.launch_legacy_provenance where legacy_id=(select id from public.waitlist where email='race-import@test.invalid')"), 'suppressed');
      assert.equal(db.sql("select withdrawn_at is not null from public.signup_requests where email='race-import@test.invalid'"), 't');
    });
    await t.test('RPC errors redact subscriber/trigger details and roll back partial import', () => {
      seed(`insert into public.waitlist(email) values('failure@test.invalid');
        create function public.launch_import_fixture_failure() returns trigger language plpgsql as $$begin raise exception 'private-subscriber@test.invalid secret-value'; end$$;
        create trigger synthetic_import_failure before insert on public.signup_requests for each row execute function public.launch_import_fixture_failure();`);
      const inv = inventory(); authorize(inv, 'failure-approval'); const before = snapshot();
      assert.throws(() => apply(inv.scopeHash), error => /launch reconciliation unavailable/.test(error.message)
        && !/@|secret-value/.test(error.message));
      assert.equal(snapshot(), before);
      assert.equal(db.sql('select count(*) from private.launch_import_context'), '0');
      db.sql('drop trigger synthetic_import_failure on public.signup_requests; drop function public.launch_import_fixture_failure()');
    });
  } finally { db.cleanup(); }
});

test('launch lifecycle real PostgreSQL contract', async t => {
  const db = launchPostgres();
  try {
    await db.start();
    db.sql(`create role anon; create role authenticated; create role service_role bypassrls;
      grant usage on schema public to anon,authenticated,service_role;`);
    db.sql(read('supabase/waitlist.sql'));
    // Supabase's service role can operate on the legacy waitlist too.
    db.sql('grant all on public.waitlist to service_role;');
    db.sql(read('supabase/migrations/20261011050938_add_signup_intents.sql'));
    db.sql(`insert into public.signup_requests(email,intent,platform,source,consent_version,created_at,delivery_state,provider_id,delivery_token,delivery_first_attempt_at,delivery_attempted_at)
      values ('overlap@test.invalid','beta','ios','direct','historical-ios','2026-09-01','sent','synthetic-ios','00000000-0000-4000-8000-000000000001','2026-09-01','2026-09-01'),
      ('overlap@test.invalid','beta','android','campus-poster','historical-android','2026-09-02','sent','synthetic-android','00000000-0000-4000-8000-000000000002','2026-09-02','2026-09-02'),
      ('overlap@test.invalid','launch','unspecified','instagram','historical-launch','2026-10-11','review','synthetic-launch',null,'2026-10-11','2026-10-11');`);
    const columns = db.sql("select string_agg(quote_ident(column_name),',' order by ordinal_position) from information_schema.columns where table_schema='public' and table_name='signup_requests'");
    const original = () => db.sql(`select row_to_json(r)::text from (select ${columns} from public.signup_requests where email='overlap@test.invalid' order by intent,platform) r`);
    const before = original();
    const migrations = readdirSync(new URL('supabase/migrations/', root)).filter(f => f.endsWith('_launch_list_lifecycle.sql'));
    if (process.env.LAUNCH_DB_BASELINE !== '1') {
      for (const file of migrations) db.sql(read(`supabase/migrations/${file}`));
    }
    await t.test('additive metadata is available on the real migrated table', () => {
      assert.equal(db.sql("select count(*) from information_schema.columns where table_schema='public' and table_name='signup_requests' and column_name='registration_origin'"), '1');
    });
    if (process.env.LAUNCH_DB_BASELINE === '1' || migrations.length === 0) return;

    await t.test('historical columns remain byte-for-byte unchanged; reapply creates no duplicates', () => {
      assert.equal(original(), before);
      assert.equal(db.sql("select bool_and(registration_origin='current_form' and consent_status='recorded' and delivery_template_version is null) from public.signup_requests"), 't');
      const catalog = () => db.sql(`select jsonb_build_object('constraints',(select jsonb_agg(row(conrelid,conname,pg_get_constraintdef(oid)) order by conrelid,conname) from pg_constraint where connamespace in ('public'::regnamespace,'private'::regnamespace)), 'indexes',(select jsonb_agg(row(schemaname,indexname,indexdef) order by schemaname,indexname) from pg_indexes where schemaname in ('public','private')), 'triggers',(select jsonb_agg(row(tgrelid,tgname) order by tgrelid,tgname) from pg_trigger where not tgisinternal))::text`);
      const initial = catalog();
      db.sql(read(`supabase/migrations/${migrations[0]}`));
      assert.equal(catalog(), initial);
      assert.equal(original(), before);
      assert.equal(db.sql('select count(*) from private.launch_list_control'), '1');
    });
    await t.test('unknown legacy consent requires launch intent and explicit legacy provenance', () => {
      for (const origin of ['legacy_api', 'legacy_import']) {
        db.sql(`insert into public.signup_requests(email,intent,platform,source,registration_origin,consent_status,consent_version) values('${origin}@test.invalid','launch','unspecified','legacy','${origin}','unknown',null)`);
      }
      for (const [intent, platform, origin, status, version] of [
        ['launch','unspecified','current_form','recorded','null'],
        ['launch','unspecified','current_form','unknown','null'],
        ['beta','ios','legacy_import','unknown','null'],
        ['launch','unspecified','legacy_import','recorded','null'],
        ['launch','unspecified','legacy_api','unknown',"'invented'"],
      ]) {
        assert.throws(() => db.sql(`insert into public.signup_requests(email,intent,platform,source,registration_origin,consent_status,consent_version) values('invalid@test.invalid','${intent}','${platform}','direct','${origin}','${status}',${version})`), /check constraint/);
      }
      assert.throws(() => db.sql("insert into public.signup_requests(email,intent,platform,source) values('no-default@test.invalid','launch','unspecified','direct')"), /check constraint/);
    });
    await t.test('provenance attaches to overlapping launch without rewriting either beta or launch facts', () => {
      db.sql(`set role service_role; insert into private.launch_legacy_provenance(legacy_id,legacy_created_at,signup_id,launch_match,outcome)
        select '00000000-0000-4000-8000-000000000010','2026-01-01',id,'${hash}','registered' from public.signup_requests where email='overlap@test.invalid' and intent='launch';`);
      assert.equal(original(), before);
      assert.equal(db.sql("select legacy_created_at::date from private.launch_legacy_provenance"), '2026-01-01');
      assert.equal(db.sql("select count(*) from public.signup_requests where email='overlap@test.invalid' and intent='beta'"), '2');
      assert.throws(() => db.sql(`insert into private.launch_legacy_provenance values(gen_random_uuid(),now(),null,'${hash}','registered')`), /check constraint/);
      assert.throws(() => db.sql(`insert into private.launch_legacy_provenance values(gen_random_uuid(),now(),null,'${hash}','review')`), /check constraint/);
      db.sql(`insert into private.launch_legacy_provenance values(gen_random_uuid(),now(),null,'${hash}','suppressed')`);
    });
    await t.test('private metadata validates hashes, launch-only fields and monotonic singleton fence', () => {
      assert.equal(db.sql('select mode||\':\'||fence_epoch from private.launch_list_control'), 'transition:0');
      db.sql("set role service_role; update private.launch_list_control set mode='fenced',fence_epoch=1");
      assert.throws(() => db.sql('set role service_role; update private.launch_list_control set fence_epoch=0'), /fence epoch/);
      assert.throws(() => db.sql("insert into private.launch_list_control(singleton,mode,fence_epoch) values(false,'transition',0)"), /check constraint/);
      assert.throws(() => db.sql('set role service_role; delete from private.launch_list_control'), /permission denied/);
      for (const field of ['launch_match','launch_unsubscribe_hash']) {
        assert.throws(() => db.sql(`update public.signup_requests set ${field}='raw-token' where intent='launch'`), /check constraint/);
        assert.throws(() => db.sql(`update public.signup_requests set ${field}='${hash}' where intent='beta'`), /check constraint/);
      }
      assert.throws(() => db.sql("update public.signup_requests set delivery_template_version='launch-v1' where intent='beta'"), /check constraint/);
      assert.throws(() => db.sql("update public.signup_requests set launch_token_nonce=gen_random_uuid() where intent='beta'"), /check constraint/);
      assert.throws(() => db.sql("update public.signup_requests set withdrawn_at=now() where intent='beta'"), /check constraint/);
      db.sql(`set role service_role; insert into private.launch_suppressions values('${hash}',now(),'unsubscribe');
        insert into private.launch_withdrawal_receipts values('${'b'.repeat(64)}','${hash}',now());`);
      assert.throws(() => db.sql("insert into private.launch_suppressions values('address@test.invalid',now(),'unsubscribe')"), /check constraint/);
      assert.throws(() => db.sql(`insert into private.launch_withdrawal_receipts values('raw-token','${hash}',now())`), /check constraint/);
    });
    await t.test('anon and authenticated cannot read/write tables or execute private/existing RPCs', () => {
      for (const role of ['anon','authenticated']) {
        for (const table of ['public.signup_requests','public.signup_rate_events','private.launch_legacy_provenance','private.launch_suppressions','private.launch_list_control','private.launch_withdrawal_receipts']) {
          for (const query of [`select * from ${table}`, `delete from ${table}`, `insert into ${table} default values`]) {
            assert.throws(() => db.sql(`set role ${role}; ${query}`), /permission denied/);
          }
        }
        assert.throws(() => db.sql(`set role ${role}; ${claim('denied@test.invalid')}`), /permission denied/);
        assert.throws(() => db.sql(`set role ${role}; select public.finish_signup_delivery_v1(gen_random_uuid(),gen_random_uuid(),'sent',null)`), /permission denied/);
        assert.equal(db.sql(`select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and has_function_privilege('${role}',p.oid,'execute')`), '0');
      }
    });
    await t.test('fresh v1 beta and launch retain consent, delivery tokens, retry and IP rate limits', () => {
      for (const [intent, platform] of [['beta','ios'],['beta','android'],['launch','unspecified']]) {
        const email = `fresh-${platform}@test.invalid`;
        const first = JSON.parse(db.sql(`set role service_role; ${claim(email,intent,platform)}`));
        assert.equal(first.send, true);
        assert.equal(db.sql(`select consent_version from public.signup_requests where id='${first.id}'`), '2026-10-11-v1');
        assert.equal(JSON.parse(db.sql(`set role service_role; ${claim(email,intent,platform)}`)).send, false);
        assert.equal(db.sql(`set role service_role; select public.finish_signup_delivery_v1('${first.id}','${first.token}','sent','synthetic-provider')`), 't');
        assert.equal(db.sql(`set role service_role; select public.finish_signup_delivery_v1('${first.id}','${first.token}','sent','changed')`), 'f');
        assert.equal(JSON.parse(db.sql(`set role service_role; ${claim(email,intent,platform)}`)).delivery, 'sent');
      }
      db.sql(`set role service_role; ${claim('rate-tenth@test.invalid')}`);
      assert.deepEqual(JSON.parse(db.sql(`set role service_role; ${claim('rate-eleventh@test.invalid')}`)), { limited: true });
      assert.equal(db.sql("select count(*) from public.signup_requests where email='rate-eleventh@test.invalid'"), '0');
    });
    await t.test('independent concurrent v1 sessions serialize one beta claim', async () => {
      const pending = db.asyncSql(`set application_name='launch-race-holder'; set role service_role; begin; ${claim('race@test.invalid','beta','ios','c'.repeat(64))} select pg_sleep(3); commit;`);
      const waitFor = async query => {
        for (let i=0; i<60; i++) {
          if (db.sql(query) === 't') return;
          await new Promise(r => setTimeout(r, 25));
        }
        assert.fail('Expected real concurrent database blocking was not observed');
      };
      let second;
      try {
        await waitFor("select exists(select 1 from pg_stat_activity where application_name='launch-race-holder' and wait_event='PgSleep')");
        second = db.asyncSql(`set application_name='launch-race-contender'; set role service_role; ${claim('race@test.invalid','beta','ios','d'.repeat(64))}`);
        await waitFor("select exists(select 1 from pg_stat_activity where application_name='launch-race-contender' and cardinality(pg_blocking_pids(pid))>0)");
        const firstResult = JSON.parse((await pending).split('\n')[0]);
        const secondResult = JSON.parse(await second);
        assert.equal(firstResult.send, true);
        assert.equal(secondResult.send, false);
        assert.equal(firstResult.id, secondResult.id);
        assert.equal(db.sql("select count(*) from public.signup_requests where email='race@test.invalid'"), '1');
      } finally { await Promise.allSettled([pending, second].filter(Boolean)); }
    });
    await t.test('withdrawal capability exists before exercising launch-only lifecycle', () => {
      assert.equal(db.sql("select to_regprocedure('public.withdraw_launch_v1(text)') is not null"), 't', 'service-only withdrawal RPC is implemented');
    });
    if (db.sql("select to_regprocedure('public.withdraw_launch_v1(text)') is not null") !== 't') return;

    const withdraw = tokenHash => `select public.withdraw_launch_v1('${tokenHash}');`;
    const betaSnapshot = () => db.sql("select jsonb_agg(to_jsonb(s) order by platform)::text from public.signup_requests s where intent='beta' and email='overlap@test.invalid'");
    await t.test('withdrawal revokes unsent launch claims only; repeated links survive row minimization', () => {
      const beforeBeta = betaSnapshot();
      const tokenHash = '1'.repeat(64), match = '2'.repeat(64);
      db.sql(`update public.signup_requests set launch_match='${match}',launch_unsubscribe_hash='${tokenHash}',delivery_state='sending',delivery_token='00000000-0000-4000-8000-000000000031' where email='overlap@test.invalid' and intent='launch';`);
      assert.deepEqual(JSON.parse(db.sql(`set role service_role; ${withdraw(tokenHash)}`)), { outcome: 'withdrawn' });
      assert.equal(db.sql(`select withdrawn_at is not null and delivery_token is null and provider_id='synthetic-launch' from public.signup_requests where email='overlap@test.invalid' and intent='launch'`), 't');
      assert.equal(db.sql(`select count(*) from private.launch_suppressions where launch_match='${match}'`), '1');
      assert.equal(db.sql(`set role service_role; select public.finish_signup_delivery_v1((select id from public.signup_requests where email='overlap@test.invalid' and intent='launch'),'00000000-0000-4000-8000-000000000031','sent','must-not-write')`), 'f');
      assert.deepEqual(JSON.parse(db.sql(`set role service_role; ${withdraw(tokenHash)}`)), { outcome: 'already_withdrawn' });
      assert.equal(betaSnapshot(), beforeBeta);
      // Synthetic minimization fixture only; production retention decisions remain gated.
      db.sql("update private.launch_legacy_provenance set signup_id=null,outcome='suppressed' where signup_id=(select id from public.signup_requests where email='overlap@test.invalid' and intent='launch'); delete from public.signup_requests where email='overlap@test.invalid' and intent='launch';");
      assert.deepEqual(JSON.parse(db.sql(`set role service_role; ${withdraw(tokenHash)}`)), { outcome: 'already_withdrawn' });
      assert.equal(betaSnapshot(), beforeBeta);
      assert.equal(db.sql(`select count(*) from private.launch_withdrawal_receipts where token_hash='${tokenHash}' and launch_match='${match}'`), '1');
    });
    await t.test('unknown, malformed, beta delivery tokens and launch rows without private identity cannot withdraw', () => {
      const before = db.sql('select count(*) from private.launch_suppressions');
      for (const value of ['forged', 'f'.repeat(64), '00000000-0000-4000-8000-000000000001']) {
        assert.deepEqual(JSON.parse(db.sql(`set role service_role; ${withdraw(value)}`)), { outcome: 'invalid' });
      }
      assert.deepEqual(JSON.parse(db.sql('set role service_role; select public.withdraw_launch_v1(null)')), { outcome: 'invalid' });
      db.sql(`insert into public.signup_requests(email,intent,platform,source,consent_version,launch_unsubscribe_hash) values('missing-match@test.invalid','launch','unspecified','direct','2026-10-11-v1','${'3'.repeat(64)}')`);
      assert.deepEqual(JSON.parse(db.sql(`set role service_role; ${withdraw('3'.repeat(64))}`)), { outcome: 'invalid' });
      assert.equal(db.sql('select count(*) from private.launch_suppressions'), before);
    });
    await t.test('withdrawal preserves sent-provider evidence and refuses duplicate token identities', () => {
      db.sql(`insert into public.signup_requests(email,intent,platform,source,consent_version,launch_match,launch_unsubscribe_hash,delivery_state,provider_id,delivery_token) values('sent-withdraw@test.invalid','launch','unspecified','direct','2026-10-11-v1','${'4'.repeat(64)}','${'5'.repeat(64)}','sent','accepted-provider','00000000-0000-4000-8000-000000000041')`);
      assert.deepEqual(JSON.parse(db.sql(`set role service_role; ${withdraw('5'.repeat(64))}`)), { outcome: 'withdrawn' });
      assert.equal(db.sql("select delivery_state||':'||provider_id||':'||(delivery_token is not null)::text from public.signup_requests where email='sent-withdraw@test.invalid'"), 'sent:accepted-provider:true');
      assert.throws(() => db.sql(`update public.signup_requests set launch_unsubscribe_hash='${'5'.repeat(64)}' where email='missing-match@test.invalid'`), /unique constraint/);
    });
    await t.test('withdrawal RPCs deny public/anon/authenticated and run as the service invoker', () => {
      for (const schema of ['public', 'private']) {
        assert.equal(db.sql(`select not prosecdef from pg_proc where oid='${schema}.withdraw_launch_v1(text)'::regprocedure`), 't');
        for (const role of ['anon', 'authenticated']) {
          assert.throws(() => db.sql(`set role ${role}; select ${schema}.withdraw_launch_v1('${'1'.repeat(64)}')`), /permission denied/);
        }
      }
      db.sql('create role launch_unprivileged; grant usage on schema public to launch_unprivileged');
      assert.throws(() => db.sql(`set role launch_unprivileged; ${withdraw('1'.repeat(64))}`), /permission denied/);
    });
    await t.test('real paused claim commits before withdrawal; withdrawal blocks then revokes its unsent token', async () => {
      const email = 'withdraw-race@test.invalid';
      const tokenHash = '6'.repeat(64), match = '7'.repeat(64);
      db.sql(`insert into public.signup_requests(email,intent,platform,source,consent_version,launch_match,launch_unsubscribe_hash,delivery_state) values('${email}','launch','unspecified','direct','2026-10-11-v1','${match}','${tokenHash}','disabled')`);
      const waitFor = async query => {
        for (let i = 0; i < 100; i++) {
          if (db.sql(query) === 't') return;
          await new Promise(resolve => setTimeout(resolve, 25));
        }
        assert.fail('Expected concurrent withdrawal blocking was not observed');
      };
      // Existing claim is intentionally still v1 (Task3 is separate). Hold the
      // future shared outer fence in this actual transaction, then claim by email.
      const first = db.asyncSql(`set statement_timeout='12s'; set application_name='withdraw-claim-holder'; set role service_role; begin; select pg_advisory_xact_lock(hashtextextended('launch-list-fence',0)); ${claim(email, 'launch', 'unspecified', '8'.repeat(64))} select pg_sleep(4); commit;`);
      let second;
      try {
        await waitFor("select exists(select 1 from pg_stat_activity where application_name='withdraw-claim-holder' and wait_event='PgSleep')");
        second = db.asyncSql(`set statement_timeout='12s'; set application_name='withdraw-contender'; set role service_role; ${withdraw(tokenHash)}`);
        await waitFor("select exists(select 1 from pg_stat_activity where application_name='withdraw-contender' and cardinality(pg_blocking_pids(pid))>0)");
        const claimed = JSON.parse((await first).split('\n').find(line => line.startsWith('{')));
        assert.equal(claimed.send, true);
        assert.deepEqual(JSON.parse(await second), { outcome: 'withdrawn' });
        assert.equal(db.sql(`select withdrawn_at is not null and delivery_token is null from public.signup_requests where id='${claimed.id}'`), 't');
        assert.equal(db.sql(`set role service_role; select public.finish_signup_delivery_v1('${claimed.id}','${claimed.token}','sent','stale-claim')`), 'f');
      } finally { await Promise.allSettled([first, second].filter(Boolean)); }
    });
    await t.test('concurrent repeated withdrawal serializes to one suppression and one receipt', async () => {
      db.sql(`insert into public.signup_requests(email,intent,platform,source,consent_version,launch_match,launch_unsubscribe_hash) values('double-withdraw@test.invalid','launch','unspecified','direct','2026-10-11-v1','${'9'.repeat(64)}','${'0'.repeat(64)}')`);
      const results = await Promise.all([db.asyncSql(`set statement_timeout='12s'; set role service_role; ${withdraw('0'.repeat(64))}`), db.asyncSql(`set statement_timeout='12s'; set role service_role; ${withdraw('0'.repeat(64))}`)]);
      assert.deepEqual(results.map(value => JSON.parse(value).outcome).sort(), ['already_withdrawn', 'withdrawn']);
      assert.equal(db.sql(`select count(*) from private.launch_suppressions where launch_match='${'9'.repeat(64)}'`), '1');
      assert.equal(db.sql(`select count(*) from private.launch_withdrawal_receipts where token_hash='${'0'.repeat(64)}'`), '1');
    });
    await t.test('guarded launch RPC contract exists', () => {
      assert.equal(db.sql("select to_regprocedure('public.claim_launch_signup_v2(text,text,text,text,text,text)') is not null"), 't');
    });
    if (db.sql("select to_regprocedure('public.claim_launch_signup_v2(text,text,text,text,text,text)') is not null") !== 't') return;
    db.sql("update private.launch_list_control set mode='canonical'; delete from public.signup_rate_events");
    const v2 = (email, extra = {}) => {
      const args = { p_email: email, p_source: 'direct', p_ip_hash: hash, p_consent_version: '2026-10-11-v1', p_consent_status: 'recorded', p_launch_match: 'b'.repeat(64), ...extra };
      return JSON.parse(db.sql(`set role service_role; select public.claim_launch_signup_v2(${Object.values(args).map(v => v === null ? 'null' : `'${v}'`).join(',')})`));
    };
    const authorize = (r, h = 'c'.repeat(64)) => db.sql(`set role service_role; select public.authorize_launch_delivery_v1('${r.id}','${r.token}',${r.fenceEpoch},'${h}')`);
    const pin = (r, h = 'd'.repeat(64)) => db.sql(`set role service_role; select public.pin_launch_payload_v1('${r.id}','${r.token}','${h}')`);
    await t.test('canonical retries pin nonce, template, body hash and five-minute lease', () => {
      const first = v2('guarded@test.invalid'); assert.equal(first.send, true); assert.equal(first.created, true);
      assert.equal(v2('guarded@test.invalid').send, false);
      assert.equal(pin(first), 't'); assert.equal(pin(first, 'e'.repeat(64)), 'f');
      db.sql(`update public.signup_requests set delivery_attempted_at=now()-interval '6 minutes' where id='${first.id}'`);
      const retry = v2('guarded@test.invalid');
      assert.equal(retry.id, first.id); assert.equal(retry.nonce, first.nonce); assert.equal(retry.templateVersion, 'launch-v1');
      assert.notEqual(retry.token, first.token); assert.equal(authorize(first), 'f');
      assert.equal(authorize(retry), 't'); assert.equal(authorize(retry), 'f');
      db.sql(`update public.signup_requests set delivery_attempted_at=now()-interval '6 minutes' where id='${first.id}'`);
      assert.equal(v2('guarded@test.invalid').send, false, 'unsettled handoff cannot retry');
      assert.equal(db.sql(`select public.finish_launch_delivery_v1('${retry.id}','${retry.token}','failed')`), 't');
      db.sql(`update public.signup_requests set delivery_attempted_at=now()-interval '6 minutes' where id='${first.id}'`);
      const rejectedRetry = v2('guarded@test.invalid'); assert.equal(rejectedRetry.send, true);
      assert.equal(authorize(rejectedRetry, 'e'.repeat(64)), 'f', 'token-key rotation rejected');
      assert.equal(authorize(rejectedRetry), 't');
      assert.equal(db.sql(`select public.finish_launch_delivery_v1('${rejectedRetry.id}','${rejectedRetry.token}','pending')`), 't');
      db.sql(`update public.signup_requests set delivery_attempted_at=now()-interval '24 hours',delivery_first_attempt_at=now()-interval '24 hours' where id='${first.id}'`);
      assert.equal(v2('guarded@test.invalid').delivery, 'review');
    });
    await t.test('old attempted bodies and imported unknown consent stay in review', () => {
      for (const evidence of ["delivery_attempted_at=now()", "delivery_first_attempt_at=now()", "delivery_token=gen_random_uuid()", "delivery_state='failed'"]) {
        db.sql('delete from public.signup_rate_events');
        const email = `old-${Math.random().toString(16).slice(2)}@test.invalid`;
        db.sql(`insert into public.signup_requests(email,intent,platform,source,consent_version) values('${email}','launch','unspecified','direct','2026-10-11-v1'); update public.signup_requests set ${evidence} where email='${email}'`);
        const r = v2(email); assert.equal(r.send, false); assert.equal(r.delivery, 'review');
      }
      db.sql("insert into public.signup_requests(email,intent,platform,source,registration_origin,consent_status,consent_version) values('imported@test.invalid','launch','unspecified','legacy','legacy_import','unknown',null)");
      const imported = v2('imported@test.invalid'); assert.equal(imported.send, false); assert.equal(imported.delivery, 'review');
      assert.equal(db.sql("select consent_status||':'||(consent_version is null)::text from public.signup_requests where email='imported@test.invalid'"), 'unknown:true');
      const legacy = v2('legacy-new@test.invalid', { p_source: 'legacy-api', p_consent_status: 'unknown', p_consent_version: null });
      assert.equal(legacy.send, true);
      assert.equal(db.sql(`select consent_status||':'||registration_origin from public.signup_requests where id='${legacy.id}'`), 'unknown:legacy_api');
    });
    await t.test('fence epoch, suppression and service privileges guard launch only', () => {
      db.sql('delete from public.signup_rate_events');
      const r = v2('fenced@test.invalid', { p_launch_match: 'f'.repeat(64) }); pin(r);
      db.sql("update private.launch_list_control set mode='fenced',fence_epoch=fence_epoch+1");
      assert.equal(authorize(r), 'f'); assert.equal(v2('fenced@test.invalid').maintenance, true);
      db.sql("update private.launch_list_control set mode='canonical'");
      assert.equal(authorize(r), 'f', 'old epoch cannot authorize after fence lifted');
      db.sql(`insert into private.launch_suppressions values('${'f'.repeat(64)}',now(),'synthetic')`);
      assert.equal(v2('fenced@test.invalid', { p_launch_match: 'f'.repeat(64) }).suppressed, true);
      for (const role of ['anon', 'authenticated', 'launch_unprivileged']) {
        for (const fn of ['claim_launch_signup_v2','authorize_launch_delivery_v1','pin_launch_payload_v1','finish_launch_delivery_v1']) {
          assert.equal(db.sql(`select bool_and(not has_function_privilege('${role}',oid,'execute')) from pg_proc where proname='${fn}'`), 't');
        }
      }
    });
    await t.test('v2 same-address launch leaves both beta platforms byte-identical and old sent facts unchanged', () => {
      db.sql('delete from public.signup_rate_events');
      const before = betaSnapshot();
      const r = v2('overlap@test.invalid', { p_launch_match: 'a1'.repeat(32) });
      assert.equal(r.send, true); assert.equal(betaSnapshot(), before);
      const sentBefore = db.sql("select row_to_json(s) from public.signup_requests s where email='sent-withdraw@test.invalid'");
      assert.equal(v2('sent-withdraw@test.invalid', { p_launch_match: '4'.repeat(64) }).suppressed, true);
      assert.equal(db.sql("select row_to_json(s) from public.signup_requests s where email='sent-withdraw@test.invalid'"), sentBefore);
    });
    await t.test('withdrawal before authorization revokes a retry; pending handoff after withdrawal remains durable', () => {
      db.sql('delete from public.signup_rate_events');
      const r = v2('before-authorization@test.invalid', { p_launch_match: 'a2'.repeat(32) });
      pin(r); assert.equal(authorize(r, 'a3'.repeat(32)), 't');
      assert.equal(db.sql(`select public.finish_launch_delivery_v1('${r.id}','${r.token}','failed')`), 't');
      db.sql(`update public.signup_requests set delivery_attempted_at=now()-interval '6 minutes' where id='${r.id}'`);
      const retry = v2('before-authorization@test.invalid', { p_launch_match: 'a2'.repeat(32) });
      assert.equal(retry.send, true);
      assert.equal(JSON.parse(db.sql(`select public.withdraw_launch_v1('${'a3'.repeat(32)}')`)).outcome, 'withdrawn');
      assert.equal(authorize(retry, 'a3'.repeat(32)), 'f');
      assert.equal(db.sql(`select public.finish_launch_delivery_v1('${retry.id}','${retry.token}','sent','must-not-record')`), 'f');
      const pending = v2('pending-withdrawal@test.invalid', { p_launch_match: 'a4'.repeat(32) });
      pin(pending); assert.equal(authorize(pending, 'a5'.repeat(32)), 't');
      db.sql(`select public.withdraw_launch_v1('${'a5'.repeat(32)}')`);
      assert.equal(db.sql(`select public.finish_launch_delivery_v1('${pending.id}','${pending.token}','pending')`), 't');
      assert.equal(v2('pending-withdrawal@test.invalid', { p_launch_match: 'a4'.repeat(32) }).suppressed, true);
      assert.equal(db.sql(`select (withdrawn_at is not null and delivery_state='pending' and provider_id is null)::text from public.signup_requests where id='${pending.id}'`), 'true');
    });
    await t.test('real DB handoff paused before provider permits withdrawal but retains outcome and forbids retries', async () => {
      db.sql('delete from public.signup_rate_events');
      let sends = 0; let emailBody;
      const transport = async (url, opts) => {
        const args = JSON.parse(opts.body);
        if (url.includes('resend.com')) {
          sends++; emailBody = args;
          // Provider boundary: authorization has committed, request not yet accepted.
          const tokenHash = db.sql("select launch_unsubscribe_hash from public.signup_requests where email='handoff@test.invalid'");
          assert.equal(JSON.parse(db.sql(`select public.withdraw_launch_v1('${tokenHash}')`)).outcome, 'withdrawn');
          return json({ id: 'accepted-after-withdrawal' });
        }
        const fn = new URL(url).pathname.split('/').at(-1);
        assert.match(fn, /^(claim_launch_signup_v2|pin_launch_payload_v1|authorize_launch_delivery_v1|finish_launch_delivery_v1)$/);
        const values = Object.entries(args).map(([key,value]) => `${key} => ${value === null ? 'null' : typeof value === 'number' ? value : `'${String(value).replaceAll("'", "''")}'`}`);
        const value = db.sql(`set role service_role; select public.${fn}(${values.join(',')})`);
        return json(value === 't' ? true : value === 'f' ? false : JSON.parse(value));
      };
      const input = { signup: { ...launchSignup, email: 'handoff@test.invalid' }, env: launchEnv, ip: 'synthetic-ip', fetchImpl: transport };
      const first = await registerSignup(input); assert.equal(first.body.delivery, 'sent');
      assert.equal((await registerSignup(input)).status, 409); assert.equal(sends, 1);
      assert.match(emailBody.text, /launch-unsubscribe.html#/);
      assert.equal(db.sql("select (withdrawn_at is not null)::text||':'||delivery_state||':'||provider_id from public.signup_requests where email='handoff@test.invalid'"), 'true:sent:accepted-after-withdrawal');
    });
  } finally { db.cleanup(); }
});
