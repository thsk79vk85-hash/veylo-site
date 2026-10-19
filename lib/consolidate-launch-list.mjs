// Server-only importer boundary. No signup claim, provider client or authority
// issuance path. The adapter owns transient credentials and the matching key.
const project = 'yohiumlrpfdhphsnnxxw';
const hash = /^[0-9a-f]{64}$/;
const commit = /^[0-9a-f]{40}$/;
const ref = /^[a-zA-Z0-9_-]{1,100}$/;
const unavailable = () => new Error('Launch reconciliation unavailable.');
const requireValue = value => { if (!value) throw unavailable(); };
const validRef = value => typeof value === 'string' && ref.test(value);
const uniqueWriters = value => Array.isArray(value) && value.every(validRef) && new Set(value).size === value.length;

// Allowlist and validate every emitted value. Never spread backend payloads or
// raw errors into receipts. Keep this contract aligned with the JSON schema.
export function consolidationReceipt(value) {
  requireValue(value?.schemaVersion === 1);
  requireValue(value.projectRef === null || (typeof value.projectRef === 'string' && /^[a-z]{20}$/.test(value.projectRef)));
  requireValue(value.sourceCommit === null || (typeof value.sourceCommit === 'string' && commit.test(value.sourceCommit)));
  requireValue(hash.test(value.schemaIdentity) && hash.test(value.scopeHash));
  requireValue(Number.isSafeInteger(value.fenceEpoch) && value.fenceEpoch >= 0);
  requireValue(['transition', 'fenced', 'canonical'].includes(value.mode));
  requireValue(typeof value.configured === 'boolean' && value.configured === Boolean(value.projectRef && value.sourceCommit));
  requireValue(['inventory', 'dry_run', 'refused', 'review', 'reconciled'].includes(value.outcome));
  requireValue(typeof value.equality === 'boolean' && value.disposalAllowed === false && value.emails === 0);
  requireValue(Number.isSafeInteger(value.writes) && value.writes >= 0);
  requireValue(value.approvalRef === null || validRef(value.approvalRef));
  requireValue(uniqueWriters(value.testedWriterIds));
  const counts = {};
  for (const name of ['legacy', 'launch', 'beta', 'invalid', 'conflicts']) {
    requireValue(Number.isSafeInteger(value.counts?.[name]) && value.counts[name] >= 0);
    counts[name] = value.counts[name];
  }
  if (value.outcome === 'reconciled') requireValue(value.equality && value.approvalRef && value.testedWriterIds.length);
  else requireValue(value.writes === 0 && !value.equality && value.approvalRef === null && value.testedWriterIds.length === 0);
  return { schemaVersion: 1, projectRef: value.projectRef, sourceCommit: value.sourceCommit,
    schemaIdentity: value.schemaIdentity, fenceEpoch: value.fenceEpoch, mode: value.mode,
    scopeHash: value.scopeHash, configured: value.configured, counts, outcome: value.outcome,
    equality: value.equality, disposalAllowed: false, writes: value.writes, emails: 0,
    testedWriterIds: [...value.testedWriterIds], approvalRef: value.approvalRef };
}

export async function buildConsolidationInventory({ client, projectRef, sourceCommit, writers } = {}) {
  try {
    const inventory = consolidationReceipt(await client.inventory());
    requireValue(inventory.outcome === 'inventory');
    if (projectRef !== undefined) requireValue(projectRef === inventory.projectRef);
    if (sourceCommit !== undefined) requireValue(sourceCommit === inventory.sourceCommit);
    // Caller-provided writer IDs are expectations, never attestations. Inventory
    // has no tested writers; only an applied, verified authority can supply them.
    if (writers !== undefined) requireValue(uniqueWriters(writers) && writers.length === 0);
    return inventory;
  } catch { throw unavailable(); }
}

export async function consolidateLaunchList({ client, expectedProjectRef, expectedScopeHash,
  approvedApply = false, approvalRef, expectedSourceCommit } = {}) {
  try {
    const inv = await buildConsolidationInventory({ client, projectRef: expectedProjectRef, sourceCommit: expectedSourceCommit });
    if (!approvedApply) {
      if (expectedScopeHash !== undefined) requireValue(expectedScopeHash === inv.scopeHash);
      return consolidationReceipt({ ...inv, outcome: 'dry_run' });
    }
    requireValue(approvedApply === true && expectedProjectRef === project && commit.test(expectedSourceCommit)
      && hash.test(expectedScopeHash) && validRef(approvalRef) && inv.configured && inv.mode === 'fenced');
    const a = await client.readAuthorization(approvalRef);
    const now = Date.now();
    requireValue(a && a.operation === 'import' && a.approvalRef === approvalRef && a.projectRef === inv.projectRef && a.sourceCommit === inv.sourceCommit
      && a.schemaIdentity === inv.schemaIdentity && a.fenceEpoch === inv.fenceEpoch && a.expectedScope === expectedScopeHash
      && uniqueWriters(a.writerIds) && a.writerIds.length > 0 && validRef(a.controlEvidence)
      && validRef(a.testEvidence) && validRef(a.settlementEvidence) && a.revokedAt === null
      && Number.isFinite(Date.parse(a.verifiedAt)) && Number.isFinite(Date.parse(a.expiresAt))
      && Date.parse(a.verifiedAt) <= now && Date.parse(a.expiresAt) > now);
    requireValue(a.consumedAt === null ? inv.scopeHash === expectedScopeHash : inv.scopeHash === a.postScope);
    const result = consolidationReceipt(await client.reconcile({ expectedScope: expectedScopeHash, apply: true }));
    requireValue(result.outcome === 'reconciled' && result.approvalRef === approvalRef
      && result.projectRef === inv.projectRef && result.sourceCommit === inv.sourceCommit
      && result.schemaIdentity === inv.schemaIdentity && result.fenceEpoch === inv.fenceEpoch
      && JSON.stringify([...result.testedWriterIds].sort()) === JSON.stringify([...a.writerIds].sort()));
    return result;
  } catch { throw unavailable(); }
}

export function createConsolidationClient({ env, fetchImpl = fetch }) {
  requireValue(env?.WAITLIST_SUPABASE_URL === `https://${project}.supabase.co`
    && typeof env.WAITLIST_SUPABASE_SERVICE_ROLE_KEY === 'string' && env.WAITLIST_SUPABASE_SERVICE_ROLE_KEY.trim()
    && typeof env.SIGNUP_LAUNCH_MATCH_SECRET === 'string' && env.SIGNUP_LAUNCH_MATCH_SECRET.trim());
  const url = env.WAITLIST_SUPABASE_URL, matchKey = env.SIGNUP_LAUNCH_MATCH_SECRET;
  const headers = { apikey: env.WAITLIST_SUPABASE_SERVICE_ROLE_KEY,
    authorization: `Bearer ${env.WAITLIST_SUPABASE_SERVICE_ROLE_KEY}`, 'content-type': 'application/json' };
  async function rpc(name, body) {
    try {
      const response = await fetchImpl(`${url}/rest/v1/rpc/${name}`, {
        method: 'POST', headers, body: JSON.stringify(body), redirect: 'error', signal: AbortSignal.timeout(30000),
      });
      requireValue(response.ok);
      return await response.json();
    } catch { throw unavailable(); }
  }
  return Object.freeze({
    inventory: () => rpc('inventory_launch_legacy_v1', { p_match_key: matchKey }),
    reconcile: ({ expectedScope, apply = false }) => rpc('reconcile_launch_legacy_v1', {
      p_expected_scope: expectedScope, p_match_key: matchKey, p_apply: apply === true,
    }),
    readAuthorization: approvalRef => rpc('read_launch_import_authorization_v1', { p_approval_ref: approvalRef }),
  });
}
