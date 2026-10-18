import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { launchPostgres } from './helpers/launch-postgres.mjs';
import { assessLaunchRetention } from '../lib/launch-retention-policy.mjs';

const root = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const id = '00000000-0000-4000-8000-000000000081';
const signup = '00000000-0000-4000-8000-000000000082';
const token = '00000000-0000-4000-8000-000000000083';
const hex = 'a'.repeat(64), project = 'yohiumlrpfdhphsnnxxw', source = 'a'.repeat(40);

// Catches private-state exposure, nullable CHECK escapes, stale generation writes,
// self-certification, import authority reuse and optimistic external absence.
test('private generation-fenced retention state real PostgreSQL contract', async t => {
  const db = launchPostgres();
  const context = (generation = '9007199254740993') => JSON.parse(db.sql(`set role service_role;
    select private.launch_retention_context_v1('${id}',${generation})`));
  const api = () => db.sql(`select jsonb_agg(row(p.proname,pg_get_function_identity_arguments(p.oid),pg_get_functiondef(p.oid),p.proacl)
    order by p.proname,pg_get_function_identity_arguments(p.oid)) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and (p.proname like '%launch%' or p.proname like '%signup%')`);
  const insertItem = (extra = '') => db.sql(`insert into private.launch_retention_items
    (item_id,source_signup_id,launch_match,key_generation,generation,fence_epoch,state,policy_version,
     reason_code,evidence_ref,scope_hash,withdrawn_at,decided_at)
    values('${id}','${signup}','${hex}','1',9007199254740993,0,'raw',1,
     'eligible','synthetic-evidence','${hex}','2026-10-18',clock_timestamp()) ${extra}`);
  const insertReceipt = (outcome = 'unknown', extra = '') => db.sql(`insert into private.launch_retention_delivery
    (item_id,signup_id,handoff_token,generation,fence_epoch,handoff_at,outcome)
    values('${id}','${signup}','${token}',9007199254740993,0,'2026-10-17','${outcome}') ${extra}`);
  try {
    await db.start();
    db.sql('create role anon; create role authenticated; create role service_role bypassrls; grant usage on schema public to anon,authenticated,service_role');
    db.sql(read('supabase/waitlist.sql')); db.sql('grant all on public.waitlist to service_role');
    for (const path of ['20261011050938_add_signup_intents.sql', '20261013112838_launch_list_lifecycle.sql', '20261013125523_launch_list_canonical_cutover.sql']) db.sql(read(`supabase/migrations/${path}`));
    const originalApi = api(), control = db.sql('select to_jsonb(c) from private.launch_list_control c');
    const migrations = readdirSync(new URL('supabase/migrations/', root)).filter(p => p.endsWith('_launch_list_retention_state.sql'));
    assert.equal(migrations.length, 1, 'one required forward-only retention-state migration');
    db.sql(read(`supabase/migrations/${migrations[0]}`));
    assert.equal(db.sql("select to_regclass('private.launch_retention_items') is not null"), 't', 'private generation-fenced lifecycle ledger must be installed');
    assert.equal(db.sql("select to_regclass('private.launch_retention_delivery') is not null"), 't', 'independent exact handoff receipt must be installed');

    await t.test('installation preserves original APIs, bindings, modes and zero authority/schedules', () => {
      assert.equal(api(), originalApi); assert.equal(db.sql('select to_jsonb(c) from private.launch_list_control c'), control);
      assert.equal(db.sql('select count(*) from private.launch_import_authorizations'), '0');
      assert.equal(db.sql("select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like '%retention%'"), '0');
      assert.equal(db.sql("select exists(select 1 from pg_extension where extname='pg_cron')"), 'f');
      assert.deepEqual(context(), { state: 'unavailable' });
      assert.equal(db.sql('select private.launch_write_fence_ready_v1()'), 't');
    });
    await t.test('original migration and independent pins remain byte-exact', () => {
      const pins = JSON.parse(read('tests/fixtures/launch-retention-source-pins.json'));
      for (const p of [...pins.preservedFiles, ...pins.reviewedD2Files]) {
        assert.equal(createHash('sha256').update(readFileSync(new URL(p.file, root))).digest('hex'), p.sha256, p.file);
      }
    });
    await t.test('private tables have RLS and minimum explicit service SELECT only', () => {
      assert.equal(db.sql("select bool_and(relrowsecurity) from pg_class where oid in ('private.launch_retention_items'::regclass,'private.launch_retention_delivery'::regclass)"), 't');
      for (const role of ['anon', 'authenticated']) {
        for (const table of ['launch_retention_items', 'launch_retention_delivery']) {
          assert.throws(() => db.sql(`set role ${role}; select * from private.${table}`), /permission denied/);
          assert.throws(() => db.sql(`set role ${role}; delete from private.${table}`), /permission denied/);
        }
        assert.throws(() => db.sql(`set role ${role}; select private.launch_retention_context_v1('${id}',1)`), /permission denied/);
      }
      for (const table of ['launch_retention_items', 'launch_retention_delivery']) {
        assert.equal(db.sql(`set role service_role; select count(*) from private.${table}`), '0');
        for (const command of [`insert into private.${table} default values`, `delete from private.${table}`, `update private.${table} set generation=1`, `truncate private.${table}`]) assert.throws(() => db.sql(`set role service_role; ${command}`), /permission denied/);
      }
      assert.equal(db.sql("select bool_and(not prosecdef and proconfig=array['search_path=pg_catalog']) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname like '%retention%'"), 't');
    });
    await t.test('existing import and mode operations still succeed with both beta platforms unchanged', () => {
      assert.equal(db.sql(`begin;
        update private.launch_list_control set project_ref='${project}',source_commit='${source}';
        insert into public.waitlist(email) values('synthetic-legacy@test.invalid');
        set local role service_role;
        do $compat$ declare i jsonb; r jsonb; b jsonb; claim jsonb; n integer; op text; target text; platform text;
        begin
          foreach platform in array array['ios','android'] loop
            claim:=public.claim_signup_v1('synthetic-beta@test.invalid','beta',platform,'direct','${hex}');
            if public.finish_signup_delivery_v1((claim->>'id')::uuid,(claim->>'token')::uuid,'sent','synthetic-provider') is not true then
              raise exception 'compatible beta finish failed';
            end if;
          end loop;
          select jsonb_agg(to_jsonb(s) order by id) into b from public.signup_requests s where intent='beta';
          for n in 1..3 loop
            op:=case when n=2 then 'import' else 'mode' end;
            target:=case when n=1 then 'fenced' when n=3 then 'canonical' end;
            i:=public.inventory_launch_legacy_v1('synthetic-key');
            insert into private.launch_import_authorizations
              (approval_ref,project_ref,source_commit,schema_identity,expected_scope,fence_epoch,writer_ids,
               control_evidence,test_evidence,settlement_evidence,verified_at,expires_at,operation,target_mode)
              values('compat-'||n,'${project}','${source}',i->>'schemaIdentity',i->>'scopeHash',(i->>'fenceEpoch')::bigint,
               array['synthetic-writer'],'synthetic-control','synthetic-test','synthetic-settlement',
               clock_timestamp()-interval '1 second',clock_timestamp()+interval '1 hour',op,target);
            if n=2 then
              r:=public.reconcile_launch_legacy_v1(i->>'scopeHash','synthetic-key',true);
              if r->>'outcome' is distinct from 'reconciled' or r->>'disposalAllowed' is distinct from 'false' then raise exception 'compatible import failed'; end if;
            else
              r:=public.set_launch_mode_v1((i->>'fenceEpoch')::bigint,target,i->>'scopeHash','synthetic-key');
              if r->>'outcome' is distinct from 'mode_changed' then raise exception 'compatible mode failed'; end if;
            end if;
          end loop;
          if b is distinct from (select jsonb_agg(to_jsonb(s) order by id) from public.signup_requests s where intent='beta') then
            raise exception 'beta state changed';
          end if;
          if not exists(select 1 from public.signup_requests where intent='launch' and consent_status='unknown' and delivery_state='review') then
            raise exception 'legacy consent changed';
          end if;
        end $compat$;
        select private.launch_write_fence_ready_v1(); rollback`), 't');
      assert.equal(db.sql('select to_jsonb(c) from private.launch_list_control c'), control);
    });
    db.sql(`update private.launch_list_control set project_ref='${project}',source_commit='${source}';
      insert into public.signup_requests(id,email,intent,platform,source,consent_version,withdrawn_at,launch_match)
      values('${signup}','synthetic@test.invalid','launch','unspecified','direct','original','2026-10-18','${hex}')`);
    insertItem();
    await t.test('state writes defer on outer-fence contention while beta continues', async () => {
      const holder = db.asyncSql("set statement_timeout='8s'; set application_name='retention-state-outer'; begin; select pg_advisory_xact_lock(hashtextextended('launch-list-fence',0)); select pg_sleep(2); commit");
      try {
        let observed = false;
        for (let i = 0; i < 100; i++) {
          if (db.sql("select exists(select 1 from pg_stat_activity where application_name='retention-state-outer' and wait_event='PgSleep')") === 't') { observed = true; break; }
          await new Promise(resolve => setTimeout(resolve, 20));
        }
        assert.equal(observed, true);
        assert.throws(() => db.sql(`set lock_timeout='500ms'; update private.launch_retention_items set generation=generation+1 where item_id='${id}'`), /retention fenced/);
        assert.equal(JSON.parse(db.sql(`set lock_timeout='500ms'; set role service_role; select public.claim_signup_v1('synthetic@test.invalid','beta','android','direct','${hex}')`)).send, true);
      } finally { await holder; }
      assert.equal(db.sql(`select generation from private.launch_retention_items where item_id='${id}'`), '9007199254740993');
    });
    await t.test('RLS still hides a populated ledger after accidental read grants', () => {
      assert.equal(db.sql('select count(*) from private.launch_retention_items'), '1');
      for (const role of ['anon', 'authenticated']) assert.equal(db.sql(`begin; grant usage on schema private to ${role};
        grant select on private.launch_retention_items to ${role}; set local role ${role};
        select count(*) from private.launch_retention_items; rollback`), '0');
    });
    await t.test('owned context is read-only, exact bigint, and external facts stay unavailable', () => {
      const f = context();
      assert.equal(f.generation, '9007199254740993'); assert.equal(f.epoch, '0');
      assert.equal(f.scope.projectRef, project); assert.equal(f.scope.sourceCommit, source);
      assert.equal(f.scope.schemaIdentity, db.sql('select private.launch_import_schema_v1()'));
      for (const name of ['necessity', 'references', 'hold', 'delivery', 'link', 'suppression', 'restore']) assert.deepEqual(f[name], { state: 'unavailable' });
      assert.deepEqual(assessLaunchRetention(f), { action: 'review', reason: 'unavailable' });
      assert.deepEqual(context('9007199254740992'), { state: 'unavailable' });
      assert.deepEqual(context('-1'), { state: 'unavailable' });
      assert.deepEqual(JSON.parse(db.sql(`begin read only; set local role service_role; select private.launch_retention_context_v1('${id}',9007199254740993); commit`)), f);
      assert.deepEqual(JSON.parse(db.sql(`begin; update private.launch_list_control set fence_epoch=1;
        select private.launch_retention_context_v1('${id}',9007199254740993); rollback`)), { state: 'unavailable' });
    });
    await t.test('row shapes, finite times, uniqueness, beta separation and NULL escapes refuse', () => {
      assert.throws(() => insertItem(), /duplicate key/);
      for (const edit of ["generation=-1", "generation=9007199254740992", "generation=generation+2", "generation=generation+1,source_signup_id=null",
        "generation=generation+1,key_generation=''", "generation=generation+1,evidence_ref=''", "generation=generation+1,withdrawn_at='infinity'",
        "generation=generation+1,state='receipt'", "generation=generation+1,policy_version=0", "generation=generation+1,reason_code='free text'"]) {
        assert.throws(() => db.sql(`update private.launch_retention_items set ${edit} where item_id='${id}'`), /check constraint|retention/);
      }
      assert.throws(() => db.sql(`delete from public.signup_requests where id='${signup}'`), /foreign key constraint/);
      db.sql("insert into public.signup_requests(email,intent,platform,source,consent_version) values('synthetic@test.invalid','beta','ios','direct','original')");
      assert.throws(() => db.sql(`update private.launch_retention_items set generation=generation+1,source_signup_id=(select id from public.signup_requests where intent='beta' and platform='ios') where item_id='${id}'`), /retention/);
    });
    insertReceipt();
    await t.test('compact receipt is independent, exact, unique and never confuses cancelled lease with handoff', () => {
      assert.throws(() => insertReceipt(), /duplicate key/);
      for (const edit of ["outcome='cancelled'", "outcome='sent'", "outcome='failed'", "handoff_token=null", "provider_ref='invented'", "claim_outcome='cancelled'"]) {
        assert.throws(() => db.sql(`begin; update private.launch_retention_items set generation=generation+1 where item_id='${id}';
          update private.launch_retention_delivery set generation=generation+1,${edit} where signup_id='${signup}'; rollback`), /check constraint|not-null/);
      }
      assert.throws(() => db.sql(`begin; update private.launch_retention_items set generation=generation+1 where item_id='${id}';
        update private.launch_retention_delivery set generation=generation+1,handoff_at='infinity' where signup_id='${signup}'; rollback`), /retention receipt conflict/);
      assert.throws(() => db.sql(`update private.launch_retention_delivery set generation=9007199254740992 where signup_id='${signup}'`), /retention generation mismatch/);
      assert.equal(db.sql("select count(*) from pg_constraint where conrelid='private.launch_retention_delivery'::regclass and confrelid='public.signup_requests'::regclass"), '0');
      db.sql(`update private.launch_retention_items set source_signup_id=null,state='receipt',generation=generation+1 where item_id='${id}';
        delete from public.signup_requests where id='${signup}'`);
      assert.equal(db.sql('select count(*) from private.launch_retention_delivery'), '1');
      assert.throws(() => db.sql(`update private.launch_retention_items set source_signup_id='${signup}',state='raw',generation=generation+1 where item_id='${id}'`), /retention/);
      db.sql(`update private.launch_retention_delivery set generation=generation+1,outcome='sent',provider_ref='synthetic-provider',settled_at=clock_timestamp() where signup_id='${signup}'`);
      for (const edit of ["outcome='pending',provider_ref=null,settled_at=null", "outcome='failed',provider_ref=null"]) {
        assert.throws(() => db.sql(`begin; update private.launch_retention_items set generation=generation+1 where item_id='${id}';
          update private.launch_retention_delivery set generation=generation+1,${edit} where signup_id='${signup}'; rollback`), /retention receipt conflict/);
      }
    });
    await t.test('receipt references block marker/retired states instead of hiding unsettled work', () => {
      assert.throws(() => db.sql(`begin; update private.launch_retention_items set generation=generation+1,state='marker' where item_id='${id}'; rollback`), /retention receipt remains/);
    });
    await t.test('unused terminal fields must be NULL, with no marker resurrection', () => {
      assert.throws(() => db.sql(`begin; delete from private.launch_retention_delivery where item_id='${id}';
        update private.launch_retention_items set generation=generation+1,state='retired' where item_id='${id}'; rollback`), /launch_retention_item_shape/);
      const retired = `delete from private.launch_retention_delivery where item_id='${id}';
        update private.launch_retention_items set generation=generation+1,state='retired',source_signup_id=null,launch_match=null,
        key_generation=null,evidence_ref=null,scope_hash=null,withdrawn_at=null where item_id='${id}'`;
      assert.equal(db.sql(`begin; ${retired}; select launch_match is null and source_signup_id is null and evidence_ref is null
        from private.launch_retention_items where item_id='${id}'; rollback`), 't');
      assert.throws(() => db.sql(`begin; ${retired}; update private.launch_retention_items set generation=generation+1,state='marker'
        where item_id='${id}'; rollback`), /retention state mismatch/);
    });
    await t.test('new operations cannot serve as import authority or contain old mode fields', () => {
      const inv = JSON.parse(db.sql("select public.inventory_launch_legacy_v1('synthetic-key')"));
      for (const operation of ['retention_raw', 'retention_receipt', 'retention_marker']) {
        db.sql(`insert into private.launch_import_authorizations
          (approval_ref,project_ref,source_commit,schema_identity,expected_scope,fence_epoch,writer_ids,control_evidence,test_evidence,settlement_evidence,verified_at,expires_at,operation,retention_key_generation)
          values('${operation}','${project}','${source}','${inv.schemaIdentity}','${inv.scopeHash}',0,array['synthetic-writer'],
          'synthetic-control','synthetic-test','synthetic-settlement',clock_timestamp()-interval '1 second',clock_timestamp()+interval '1 hour','${operation}','1')`);
        assert.throws(() => db.sql(`update private.launch_import_authorizations set target_mode='canonical' where approval_ref='${operation}'`), /check constraint/);
        assert.throws(() => db.sql(`update private.launch_import_authorizations set retention_key_generation=null where approval_ref='${operation}'`), /check constraint/);
      }
      assert.equal(JSON.parse(db.sql(`select public.reconcile_launch_legacy_v1('${inv.scopeHash}','synthetic-key',true)`)).outcome, 'refused');
      assert.equal(db.sql('select count(*) from private.launch_import_authorizations where consumed_at is not null'), '0');
    });
    await t.test('state, ACL, definition and trigger drift invalidate owner fingerprint without service recertification', () => {
      for (const sql of ['alter table private.launch_retention_items disable trigger launch_retention_state_guard',
        'grant insert on private.launch_retention_items to service_role', 'alter table private.launch_retention_delivery disable row level security',
        "alter table private.launch_retention_items drop constraint launch_retention_item_shape",
        "create or replace function private.launch_retention_context_v1(p_item_id uuid,p_generation bigint) returns jsonb language sql set search_path=pg_catalog as 'select ''{}''::jsonb'"]) {
        assert.equal(db.sql(`begin; ${sql}; select private.launch_write_fence_ready_v1(); rollback`), 'f');
      }
      assert.throws(() => db.sql('set role service_role; update private.launch_write_fence_contract set definition_hash=private.launch_write_fence_fingerprint_v1()'), /permission denied/);
      assert.equal(db.sql('select private.launch_write_fence_ready_v1()'), 't');
    });
  } finally { db.cleanup(); }
});
