import test from 'node:test';
import assert from 'node:assert/strict';
import { assessLaunchRetention } from '../lib/launch-retention-policy.mjs';
import { verifiedWithdrawnFacts as facts } from './helpers/launch-retention-facts.mjs';

const change = (field, patch, overrides = {}) => {
  const f = facts(overrides);
  return { ...f, [field]: { ...f[field], ...patch } };
};
const expect = (input, action, reason) => assert.deepEqual(assessLaunchRetention(input), { action, reason });

// A permissive default, collapsed purposes or lossy Number conversion must fail.
test('verified withdrawn raw facts can minimize only raw data', () => expect(facts(), 'minimize_raw', 'eligible'));
test('beta purpose remains retained', () => expect(facts({ intent: 'beta' }), 'retain', 'active_purpose'));
test('active launch purpose remains retained', () => expect(change('necessity', { purposes: ['launch_notification'] }), 'retain', 'active_purpose'));
test('verified active withdrawal state retains launch', () => expect(change('withdrawal', { status: 'active', at: null }, { withdrawnAt: null }), 'retain', 'active_purpose'));
test('unknown consent stays review', () => expect(facts({ consent: 'unknown' }), 'review', 'unavailable'));
test('unknown consent after raw removal does not invent consent or prevent separately proven receipt minimization', () =>
  expect(facts({ lane: 'receipt', consent: 'unknown' }), 'minimize_receipt', 'eligible'));
test('receipt facts can minimize independently of a usable link', () => expect(facts({ lane: 'receipt' }), 'minimize_receipt', 'eligible'));
test('marker retires only after all independent purposes end', () => {
  const f = facts({ lane: 'marker' });
  f.link.purposes = []; f.suppression.purposes = [];
  expect(f, 'retire_marker', 'eligible');
});
test('completed work does not request disposal again', () => expect(facts({ completed: true }), 'retain', 'already_done'));
test('live hold refuses minimization', () => expect(change('hold', { purposes: ['complaint'] }), 'review', 'held'));
test('live reference refuses minimization', () => expect(change('references', { purposes: ['legacy_mapping'] }), 'review', 'live_reference'));
test('usable link blocks marker retirement', () => expect(facts({ lane: 'marker' }), 'retain', 'link_required'));
test('current signup suppression survives independently of link retirement', () => expect(change('link', { purposes: [] }, { lane: 'marker' }), 'retain', 'live_reference'));
test('raw link coverage cannot be fabricated from an empty list', () => expect(change('link', { covered: false }), 'review', 'link_required'));
test('raw suppression needs independent coverage', () => expect(change('suppression', { covered: false }), 'review', 'live_reference'));
test('restore necessity keeps a receipt', () => expect(change('restore', { purposes: ['replay'] }, { lane: 'receipt' }), 'retain', 'restore_required'));
for (const outcome of ['pending', 'unknown']) {
  test(`${outcome} handoff without compact coverage remains review`, () => expect(change('delivery', { outcome, compactCovered: false }), 'review', 'unknown_delivery'));
  test(`${outcome} handoff can outlive raw identity in an exact compact receipt`, () => expect(change('delivery', { outcome, compactCovered: true }), 'minimize_raw', 'eligible'));
  test(`${outcome} receipt never implies settlement`, () => expect(change('delivery', { outcome }, { lane: 'receipt' }), 'review', 'unknown_delivery'));
}
test('contradictory handoff is unresolved even with compact coverage', () => expect(change('delivery', { outcome: 'contradictory' }), 'review', 'unknown_delivery'));
test('delivery references keep receipt facts', () => expect(change('delivery', { purposes: ['late_result'] }, { lane: 'receipt' }), 'retain', 'live_reference'));
for (const value of ['9007199254740993', '9223372036854775807']) {
  test(`generation ${value} keeps exact decimal semantics`, () => expect(facts({ generation: value, epoch: value }), 'minimize_raw', 'eligible'));
}
for (const value of [null, 1, '', '-1', '01', '1.0', '1e3', '9223372036854775808']) {
  test(`invalid generation ${JSON.stringify(value)} fails closed`, () => expect(facts({ generation: value }), 'review', 'invalid_facts'));
}
for (const field of ['scope', 'withdrawal', 'necessity', 'references', 'hold', 'delivery', 'link', 'suppression', 'restore']) {
  test(`${field} unavailable cannot prove absence`, () => expect(facts({ [field]: { state: 'unavailable' } }), 'review', 'unavailable'));
  test(`${field} missing cannot prove absence`, () => {
    const f = facts(); delete f[field];
    expect(f, 'review', 'unavailable');
  });
}
for (const field of ['necessity', 'references', 'hold', 'delivery', 'link', 'suppression', 'restore']) {
  test(`${field} empty proof cannot authorize disposal`, () => expect(change(field, { evidenceRef: '' }), 'review', 'invalid_facts'));
}
for (const field of ['projectRef', 'sourceCommit', 'schemaIdentity', 'keyGeneration', 'scopeHash']) {
  test(`protected ${field} mismatch refuses`, () => {
    const f = facts();
    f.restore.scope[field] = field === 'keyGeneration' ? '2' : (field === 'projectRef' ? 'z'.repeat(20) : 'd'.repeat(field === 'sourceCommit' ? 40 : 64));
    expect(f, 'review', 'scope_mismatch');
  });
}
test('stale generation above Number precision refuses', () => expect(change('restore', { generation: '9007199254740992' }, { generation: '9007199254740993' }), 'review', 'scope_mismatch'));
test('stale epoch refuses', () => expect(change('hold', { epoch: '1' }), 'review', 'scope_mismatch'));
test('snapshot cannot certify its own restore coverage', () => expect(change('restore', { independent: false }), 'review', 'restore_required'));
test('old restore proof remains unavailable for cleanup', () => expect(change('restore', { current: false }), 'review', 'restore_required'));
for (const patch of [{ lane: 'other' }, { intent: 'other' }, { withdrawnAt: 'yesterday' }, { necessity: { state: 'verified', purposes: [] } }]) {
  test(`malformed facts ${JSON.stringify(patch)} refuse`, () => expect(facts(patch), 'review', 'invalid_facts'));
}
test('empty input is unavailable, never empty absence', () => expect({}, 'review', 'unavailable'));
test('assessment does not mutate facts or become authority', () => {
  const f = facts(), before = structuredClone(f);
  expect(f, 'minimize_raw', 'eligible'); assert.deepEqual(f, before);
  assert.deepEqual(Object.keys(assessLaunchRetention(f)).sort(), ['action', 'reason']);
});
