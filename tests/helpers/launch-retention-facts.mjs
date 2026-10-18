// Synthetic TEST DATA ONLY. Never import from a production adapter or route.
export function verifiedWithdrawnFacts(overrides = {}) {
  const generation = overrides.generation ?? '1', epoch = overrides.epoch ?? '0';
  const scope = {
    state: 'verified', projectRef: 'yohiumlrpfdhphsnnxxw',
    sourceCommit: 'a'.repeat(40), schemaIdentity: 'b'.repeat(64),
    keyGeneration: '1', scopeHash: 'c'.repeat(64),
  };
  const proof = (extra = {}) => ({
    state: 'verified', evidenceRef: 'synthetic-evidence', generation, epoch,
    scope: { ...scope }, purposes: [], ...extra,
  });
  return {
    lane: 'raw', intent: 'launch', consent: 'recorded', completed: false,
    withdrawnAt: '2026-10-18T00:00:00.000Z', generation, epoch, scope,
    withdrawal: proof({ status: 'withdrawn', at: '2026-10-18T00:00:00.000Z' }),
    necessity: proof(), references: proof(), hold: proof(),
    delivery: proof({ outcome: 'sent', compactCovered: true }),
    link: proof({ purposes: ['usable_link'], covered: true }),
    suppression: proof({ purposes: ['current_intake'], covered: true }),
    restore: proof({ independent: true, current: true }),
    ...overrides,
  };
}
