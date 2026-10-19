import assert from 'node:assert/strict';
import test from 'node:test';
import { registerWaitlistEmail } from '../lib/waitlist-service.mjs';
import { launchEnv as env, freshClaim, json } from './helpers/guarded-launch.mjs';

const config = { email: 'person@test.invalid', env, ip: 'synthetic-ip' };
test('new legacy signup uses unknown consent and shared provider guards', async () => {
  const calls = [];
  const result = await registerWaitlistEmail({ ...config, fetchImpl: async (url, opts) => {
    calls.push({ url, body: JSON.parse(opts.body) });
    if (url.endsWith('/claim_launch_signup_v2')) return json(freshClaim);
    return json(url.includes('resend.com') ? { id: 'synthetic-provider' } : true);
  } });
  assert.equal(result.status, 201); assert.match(result.message, /on the list/);
  assert.equal(calls[0].body.p_consent_status, 'unknown'); assert.equal(calls[0].body.p_consent_version, null);
  assert.equal(calls.at(-1).body.p_state, 'sent');
  assert.equal(calls.filter(c => c.url.includes('resend.com')).length, 1);
});
test('duplicate returns legacy 200 message with no confirmation', async () => {
  let n = 0;
  const result = await registerWaitlistEmail({ ...config, fetchImpl: async () => { n++; return json({ ...freshClaim, send: false, created: false, delivery: 'sent' }); } });
  assert.equal(result.status, 200); assert.match(result.message, /already/); assert.equal(n, 1);
});
for (const outcome of ['reject', 'timeout', 'malformed-success', 'server-error']) {
  test(`legacy ${outcome} preserves registration and honest provider state`, async () => {
    let final;
    const result = await registerWaitlistEmail({ ...config, fetchImpl: async (url, opts) => {
      if (url.endsWith('/claim_launch_signup_v2')) return json(freshClaim);
      if (url.includes('resend.com')) {
        assert.ok(opts.signal instanceof AbortSignal);
        if (outcome === 'timeout') throw new DOMException('synthetic timeout', 'TimeoutError');
        return json({}, outcome === 'reject' ? 403 : outcome === 'server-error' ? 503 : 200);
      }
      if (url.endsWith('/finish_launch_delivery_v1')) final = JSON.parse(opts.body);
      return json(true);
    } });
    assert.equal(result.status, 201);
    assert.equal(final.p_state, outcome === 'reject' ? 'failed' : 'pending');
    assert.equal(final.p_provider_id, null);
  });
}
test('storage exceptions sanitize details and return retryable failure', async () => {
  let calls = 0;
  const out = await registerWaitlistEmail({ ...config, fetchImpl: async () => { calls++; throw Error('person@test.invalid synthetic-secret'); } });
  assert.equal(out.status, 503); assert.equal(calls, 1); assert.doesNotMatch(JSON.stringify(out), /synthetic-secret|person@test/);
});
