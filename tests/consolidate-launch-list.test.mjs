import test from 'node:test';
import assert from 'node:assert/strict';

test('zero-send importer boundary', async t => {
  const mod = await import('../lib/consolidate-launch-list.mjs').catch(() => null);
  assert.equal(typeof mod?.consolidateLaunchList, 'function', 'reconciliation interface must exist');
  const projectRef = 'yohiumlrpfdhphsnnxxw', sourceCommit = 'a'.repeat(40), scopeHash = 'b'.repeat(64);
  const inventory = { schemaVersion: 1, projectRef, sourceCommit, schemaIdentity: 'c'.repeat(64),
    fenceEpoch: 2, mode: 'fenced', scopeHash, configured: true,
    counts: { legacy: 2, launch: 1, beta: 2, invalid: 0, conflicts: 0 },
    outcome: 'inventory', equality: false, disposalAllowed: false, writes: 0, emails: 0,
    testedWriterIds: [], approvalRef: null };
  const auth = { approvalRef: 'fixture-approval', operation: 'import', projectRef, sourceCommit, schemaIdentity: inventory.schemaIdentity,
    fenceEpoch: 2, expectedScope: scopeHash, writerIds: ['legacy-v1', 'website-v2'],
    controlEvidence: 'control-1', testEvidence: 'test-1', settlementEvidence: 'settled-1',
    verifiedAt: '2026-01-01T00:00:00Z', expiresAt: '2099-01-01T00:00:00Z', revokedAt: null, consumedAt: null };
  const makeClient = (overrides = {}) => {
    const calls = [];
    return { calls, inventory: async () => ({ ...inventory, ...overrides }),
      readAuthorization: async () => ({ ...auth }),
      reconcile: async opts => { calls.push(opts); return { ...inventory, outcome: opts.apply ? 'reconciled' : 'dry_run',
        writes: opts.apply ? 2 : 0, equality: opts.apply, approvalRef: opts.apply ? auth.approvalRef : null,
        testedWriterIds: opts.apply ? auth.writerIds : [] }; } };
  };
  await t.test('default is read-only with no reconciliation call and content-free receipt', async () => {
    const client = makeClient({ email: 'secret@test.invalid', token: 'secret-capability', key: 'secret-key' });
    const result = await mod.consolidateLaunchList({ client });
    assert.equal(result.outcome, 'dry_run'); assert.equal(result.writes, 0); assert.equal(result.emails, 0);
    assert.equal(client.calls.length, 0);
    assert.doesNotMatch(JSON.stringify(result), /secret|@|token|key/);
    assert.equal((await mod.buildConsolidationInventory({ client, projectRef, sourceCommit })).scopeHash, scopeHash);
  });
  await t.test('wrong project/source/scope, missing approval and uncontrolled writers refuse before apply', async () => {
    const opts = { expectedProjectRef: projectRef, expectedSourceCommit: sourceCommit,
      expectedScopeHash: scopeHash, approvalRef: auth.approvalRef, approvedApply: true };
    for (const override of [{ expectedProjectRef: 'wrong' }, { expectedSourceCommit: 'd'.repeat(40) },
      { expectedScopeHash: 'e'.repeat(64) }, { approvalRef: undefined }]) {
      const client = makeClient();
      await assert.rejects(mod.consolidateLaunchList({ client, ...opts, ...override }), /unavailable/i);
      assert.equal(client.calls.length, 0);
    }
    for (const override of [{ writerIds: [] }, { settlementEvidence: '' }, { revokedAt: '2026-01-01' },
      { expiresAt: '2020-01-01' }, { sourceCommit: 'd'.repeat(40) }, { operation: 'mode' }, { operation: 'restore' }]) {
      const client = makeClient(); client.readAuthorization = async () => ({ ...auth, ...override });
      await assert.rejects(mod.consolidateLaunchList({ client, ...opts }), /unavailable/i);
      assert.equal(client.calls.length, 0);
    }
    const client = makeClient();
    const result = await mod.consolidateLaunchList({ client, ...opts });
    assert.equal(result.outcome, 'reconciled');
    assert.deepEqual(client.calls, [{ expectedScope: scopeHash, apply: true }]);
  });
  await t.test('backend failures and untrusted receipt text never escape', async () => {
    await assert.rejects(mod.consolidateLaunchList({ client: { inventory: async () => { throw Error('person@test.invalid secret'); } } }),
      error => error.message === 'Launch reconciliation unavailable.' && !error.cause);
    const client = makeClient({ projectRef: 'person@test.invalid' });
    await assert.rejects(mod.consolidateLaunchList({ client }), /unavailable/i);
  });
  await t.test('CLI parses selectors, defaults read-only and refuses unknown/disposal options', async () => {
    const { runCli } = await import('../scripts/consolidate-launch-list.mjs');
    const client = makeClient(); let output = '';
    assert.equal(await runCli([], { client, stdout: s => { output += s; } }), 0);
    assert.equal(JSON.parse(output).writes, 0); assert.equal(client.calls.length, 0);
    for (const argv of [['--dispose'], ['--apply'], ['--project-ref', 'wrong'], ['--apply', '--apply']]) {
      output = '';
      assert.equal(await runCli(argv, { client, stdout: s => { output += s; } }), 1);
      assert.doesNotMatch(output, /secret|@/); assert.equal(client.calls.length, 0);
    }
  });
  await t.test('server adapter pins Sydney and uses only no-send RPCs with redirects refused', async () => {
    let requests = [];
    const env = { WAITLIST_SUPABASE_URL: `https://${projectRef}.supabase.co`,
      WAITLIST_SUPABASE_SERVICE_ROLE_KEY: 'synthetic-service', SIGNUP_LAUNCH_MATCH_SECRET: 'synthetic-match' };
    const fetchImpl = async (url, options) => { requests.push([url, options]); return { ok: true, json: async () => inventory }; };
    const client = mod.createConsolidationClient({ env, fetchImpl });
    await client.inventory(); await client.reconcile({ expectedScope: scopeHash, apply: false }); await client.readAuthorization('fixture-approval');
    assert.deepEqual(requests.map(([url]) => new URL(url).pathname.split('/').at(-1)),
      ['inventory_launch_legacy_v1', 'reconcile_launch_legacy_v1', 'read_launch_import_authorization_v1']);
    assert.ok(requests.every(([, opts]) => opts.redirect === 'error'));
    assert.equal(JSON.parse(requests[0][1].body).p_match_key, 'synthetic-match');
    requests = [];
    assert.throws(() => mod.createConsolidationClient({ env: { ...env, WAITLIST_SUPABASE_URL: 'https://other.supabase.co' }, fetchImpl }), /unavailable/i);
    assert.equal(requests.length, 0);
  });
});
