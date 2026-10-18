/**
 * @typedef {'retain'|'review'|'minimize_raw'|'minimize_receipt'|'retire_marker'} RetentionAction
 * @typedef {'active_purpose'|'unavailable'|'invalid_facts'|'held'|'live_reference'|'unknown_delivery'|'link_required'|'restore_required'|'scope_mismatch'|'eligible'|'already_done'} RetentionReason
 * @typedef {{action: RetentionAction, reason: RetentionReason}} RetentionDecision
 * @typedef {{state:'verified', projectRef:string, sourceCommit:string,
 * schemaIdentity:string, keyGeneration:string, scopeHash:string}} RetentionScope
 * @typedef {{state:'unavailable'} | {state:'verified', evidenceRef:string,
 * generation:string, epoch:string, scope:RetentionScope, purposes:string[],
 * status?:'active'|'withdrawn', at?:string|null, outcome?:'none'|'cancelled'|'sent'|'failed'|'pending'|'unknown'|'contradictory',
 * compactCovered?:boolean, covered?:boolean, independent?:boolean, current?:boolean}} RetentionProof
 * @typedef {{lane:'raw'|'receipt'|'marker', intent:'launch'|'beta',
 * consent:'recorded'|'unknown', completed:boolean, withdrawnAt:string|null,
 * generation:string, epoch:string, scope:RetentionScope|{state:'unavailable'},
 * withdrawal:RetentionProof, necessity:RetentionProof, references:RetentionProof,
 * hold:RetentionProof, delivery:RetentionProof, link:RetentionProof,
 * suppression:RetentionProof, restore:RetentionProof}} RetentionFacts
 */

const decimal = value => typeof value === 'string' && /^(0|[1-9][0-9]*)$/.test(value)
  && (value.length < 19 || (value.length === 19 && value <= '9223372036854775807'));
const hex = (value, length) => typeof value === 'string' && new RegExp(`^[0-9a-f]{${length}}$`).test(value);
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const timestamp = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
  && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const scopeKeys = ['projectRef', 'sourceCommit', 'schemaIdentity', 'keyGeneration', 'scopeHash'];
const validScope = scope => record(scope) && scope.state === 'verified'
  && typeof scope.projectRef === 'string' && /^[a-z]{20}$/.test(scope.projectRef)
  && hex(scope.sourceCommit, 40) && hex(scope.schemaIdentity, 64)
  && decimal(scope.keyGeneration) && hex(scope.scopeHash, 64);
const purposes = {
  withdrawal: [], necessity: ['launch_notification', 'beta', 'account', 'required_record'],
  references: ['legacy_mapping', 'operation_replay', 'delivery_reference'],
  hold: ['complaint', 'legal_hold', 'required_record'],
  delivery: ['late_result', 'no_resend', 'reconciliation', 'restore'],
  link: ['usable_link', 'post_send_minimum', 'lookup'],
  suppression: ['current_intake', 'old_writer', 'import', 'campaign', 'replay', 'restore'],
  restore: ['replay', 'restore', 'late_result', 'suppression'],
};
const decision = (action, reason) => ({ action, reason });
const review = reason => decision('review', reason);

/**
 * Pure conservative assessment, NOT live authority or external verification.
 * Each verified proof must be nonempty, purpose-specific and bound to the exact
 * scope/generation/epoch. An adapter must obtain these facts from owning state;
 * caller booleans, empty lists and this function cannot establish their truth.
 * Generation/epoch/key generation stay canonical bigint decimal strings.
 * @param {RetentionFacts} facts
 * @returns {RetentionDecision}
 */
export function assessLaunchRetention(facts) {
  if (!record(facts) || !record(facts.scope) || facts.scope.state === 'unavailable') return review('unavailable');
  if (!['raw', 'receipt', 'marker'].includes(facts.lane) || !['launch', 'beta'].includes(facts.intent)
    || !['recorded', 'unknown'].includes(facts.consent) || typeof facts.completed !== 'boolean'
    || !decimal(facts.generation) || !decimal(facts.epoch) || !validScope(facts.scope)
    || (facts.withdrawnAt !== null && !timestamp(facts.withdrawnAt))) return review('invalid_facts');

  for (const [name, allowed] of Object.entries(purposes)) {
    const proof = facts[name];
    if (!record(proof) || proof.state === 'unavailable') return review('unavailable');
    if (proof.state !== 'verified' || typeof proof.evidenceRef !== 'string'
      || !/^[a-zA-Z0-9_-]{1,100}$/.test(proof.evidenceRef) || !validScope(proof.scope)
      || !decimal(proof.generation) || !decimal(proof.epoch) || !Array.isArray(proof.purposes)
      || new Set(proof.purposes).size !== proof.purposes.length
      || proof.purposes.some(p => !allowed.includes(p))) return review('invalid_facts');
    if (proof.generation !== facts.generation || proof.epoch !== facts.epoch
      || scopeKeys.some(key => proof.scope[key] !== facts.scope[key])) return review('scope_mismatch');
  }
  const { withdrawal, necessity, references, hold, delivery, link, suppression, restore } = facts;
  if (!['active', 'withdrawn'].includes(withdrawal.status)
    || (withdrawal.status === 'withdrawn' ? !timestamp(withdrawal.at) || withdrawal.at !== facts.withdrawnAt
      : withdrawal.at !== null || facts.withdrawnAt !== null)
    || !['none', 'cancelled', 'sent', 'failed', 'pending', 'unknown', 'contradictory'].includes(delivery.outcome)
    || typeof delivery.compactCovered !== 'boolean' || typeof link.covered !== 'boolean'
    || typeof suppression.covered !== 'boolean' || typeof restore.independent !== 'boolean'
    || typeof restore.current !== 'boolean') return review('invalid_facts');
  if (facts.completed) return decision('retain', 'already_done');
  if (facts.intent === 'beta' || withdrawal.status === 'active' || necessity.purposes.length) return decision('retain', 'active_purpose');
  if (facts.consent === 'unknown') return review('unavailable');
  if (hold.purposes.length) return review('held');
  if (references.purposes.length) return review('live_reference');
  if (!restore.independent || !restore.current) return review('restore_required');
  if (delivery.outcome === 'contradictory') return review('unknown_delivery');
  if (facts.lane === 'raw') {
    if (['pending', 'unknown'].includes(delivery.outcome) && !delivery.compactCovered) return review('unknown_delivery');
    if (delivery.purposes.length && !delivery.compactCovered) return review('unknown_delivery');
    if (link.purposes.length && !link.covered) return review('link_required');
    if (suppression.purposes.length && !suppression.covered) return review('live_reference');
    return decision('minimize_raw', 'eligible');
  }
  if (['pending', 'unknown'].includes(delivery.outcome)) return review('unknown_delivery');
  if (delivery.purposes.length) return decision('retain', 'live_reference');
  if (restore.purposes.length) return decision('retain', 'restore_required');
  if (facts.lane === 'receipt') return decision('minimize_receipt', 'eligible');
  if (link.purposes.length) return decision('retain', 'link_required');
  if (suppression.purposes.length) return decision('retain', 'live_reference');
  return decision('retire_marker', 'eligible');
}
