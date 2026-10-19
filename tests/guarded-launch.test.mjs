import test from 'node:test';
import assert from 'node:assert/strict';
import { createSignupHandler } from '../api/signup.js';
import { createWaitlistHandler } from '../api/waitlist.js';
import { registerSignup } from '../lib/signup.mjs';
import { registerWaitlistEmail } from '../lib/waitlist-service.mjs';
import { launchEnv as env, launchSignup as signup, json, freshClaim } from './helpers/guarded-launch.mjs';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

for (const legacy of [false, true]) {
  async function run(fetchImpl, config = env) {
    const result = {};
    const res = { status(code) { result.status = code; return this; }, setHeader() { return this; }, end(body) { result.body = JSON.parse(body); } };
    const handler = legacy ? createWaitlistHandler({ env: config, logger: { error() {} }, register: args => registerWaitlistEmail({ ...args, fetchImpl }) }) : createSignupHandler({ env: config, register: args => registerSignup({ ...args, fetchImpl }) });
    await handler({ method: 'POST', headers: { 'content-type': 'application/json' }, body: signup }, res);
    return result;
  }
  test(`${legacy ? 'legacy' : 'modern'} launch route uses guarded canonical identity and deduplicates`, async () => {
    const calls = []; let claims = 0;
    const transport = async (url, opts) => {
      const body = JSON.parse(opts.body); calls.push({ url, body, headers: opts.headers });
      if (url.endsWith('/claim_launch_signup_v2')) {
        assert.equal(body.p_consent_status, legacy ? 'unknown' : 'recorded');
        assert.equal(body.p_consent_version, legacy ? null : '2026-10-11-v1');
        assert.equal(body.p_source, legacy ? 'legacy-api' : 'direct');
        return json(++claims === 1 ? freshClaim : { ...freshClaim, send: false, created: false, delivery: 'sent' });
      }
      if (url === 'https://api.resend.com/emails') return json({ id: 'synthetic-sent' });
      if (url.includes('/rest/v1/rpc/')) return json(true);
      return json({ error: 'unguarded endpoint' }, 500);
    };
    const first = await run(transport); const duplicate = await run(transport);
    assert.equal(first.status, legacy ? 201 : 200);
    assert.equal(duplicate.status, 200);
    const sends = calls.filter(call => call.url.includes('resend.com'));
    assert.equal(sends.length, 1);
    assert.equal(sends[0].headers['Idempotency-Key'], `veylo-signup/${freshClaim.id}`);
    for (const body of [sends[0].body.text, sends[0].body.html]) {
      assert.match(body, /support@joinveylo.com/); assert.match(body, /launch-unsubscribe.html#/);
    }
    assert.ok(calls.findIndex(c => c.url.endsWith('/authorize_launch_delivery_v1')) < calls.findIndex(c => c.url.includes('resend.com')));
  });
  for (const [name, claim, expected] of [['suppression', { suppressed: true }, 409], ['fence', { maintenance: true }, 503], ['rate', { limited: true }, 429], ['duplicate', { send: false, created: false, delivery: 'sent' }, 200], ['review', { send: false, created: false, delivery: 'review' }, 200]]) {
    test(`${legacy ? 'legacy' : 'modern'} ${name} makes zero email calls`, async () => {
      let sends = 0;
      const out = await run(async url => { if (url.includes('resend.com')) sends++; return json(claim); });
      assert.equal(out.status, expected); assert.equal(sends, 0);
      if (expected >= 400) assert.notEqual(out.body.saved, true);
      if (expected === 409) assert.match(out.body.message, /support@joinveylo.com/);
    });
  }
  for (const failAt of ['claim_launch_signup_v2', 'pin_launch_payload_v1', 'authorize_launch_delivery_v1']) {
    test(`${legacy ? 'legacy' : 'modern'} ${failAt} storage failure prevents email`, async () => {
      let sends = 0;
      const out = await run(async url => {
        if (url.includes('resend.com')) sends++;
        return url.endsWith(`/${failAt}`) ? json({}, 500) : json(url.endsWith('/claim_launch_signup_v2') ? freshClaim : true);
      });
      assert.equal(out.status, 503); assert.equal(sends, 0);
    });
  }
  test(`${legacy ? 'legacy' : 'modern'} rejected authorization and OFF activation fail closed`, async () => {
    let sends = 0;
    const out = await run(async url => { if (url.includes('resend.com')) sends++; return json(url.endsWith('/claim_launch_signup_v2') ? freshClaim : url.endsWith('/authorize_launch_delivery_v1') ? false : true); });
    assert.equal(out.status, 503); assert.equal(sends, 0);
    const disabled = await run(async () => { throw Error('must not call transport'); }, { ...env, SIGNUP_LAUNCH_ENABLED: 'false' });
    assert.equal(disabled.status, 503);
  });
}

test('shipped signup script keeps launch form visible on 409 and 503', async () => {
  for (const status of [409, 503]) {
    const nodes = new Map();
    const get = key => {
      if (!nodes.has(key)) nodes.set(key, { hidden: false, disabled: false, value: 'person@test.invalid', textContent: '', addEventListener() {}, setAttribute() {}, focus() {}, reportValidity: () => true, querySelector: child => get(`${key} ${child}`) });
      return nodes.get(key);
    };
    const context = { document: { querySelector: get, querySelectorAll: () => [] }, location: { search: '' }, URLSearchParams, AbortSignal, AbortController, setTimeout, clearTimeout,
      fetch: async () => json({ message: status === 409 ? 'Contact support@joinveylo.com' : 'Try again later.' }, status) };
    runInNewContext(readFileSync(new URL('../signup.js', import.meta.url), 'utf8'), context);
    get('#launch-result').hidden = true;
    await runInNewContext("submit(launchForm,'launch','unspecified',document.querySelector('#launch-email'))", context);
    assert.equal(get('#launch-preview-form').hidden, false);
    assert.equal(get('#launch-result').hidden, true);
    assert.equal(get('#launch-preview-form fieldset').disabled, false);
    assert.match(get('#launch-preview-form [role="alert"]').textContent, status === 409 ? /support@joinveylo.com/ : /Try again/);
  }
});

test('sender refuses key/config drift, malformed claims and nonboolean authorizations', async () => {
  for (const patch of [{ SIGNUP_LAUNCH_ENABLED: undefined }, { WAITLIST_SUPABASE_URL: 'https://wrong-project.invalid' }, { SIGNUP_LAUNCH_TOKEN_SECRET: '' }, { SIGNUP_LAUNCH_MATCH_SECRET: env.SIGNUP_RATE_SECRET }]) {
    let n = 0;
    const out = await registerSignup({ signup, env: { ...env, ...patch }, ip: 'x', fetchImpl: async () => { n++; } });
    assert.equal(out.status, 503); assert.equal(n, 0);
  }
  for (const claim of [{ ...freshClaim, templateVersion: 'future' }, { ...freshClaim, nonce: null }, { ...freshClaim, fenceEpoch: null }]) {
    let n = 0;
    const out = await registerSignup({ signup, env, ip: 'x', fetchImpl: async () => { n++; return json(claim); } });
    assert.equal(out.status, 503); assert.equal(n, 1);
  }
  for (const value of ['true', {}, null, false]) {
    let sends = 0;
    const out = await registerSignup({ signup, env, ip: 'x', fetchImpl: async url => {
      if (url.includes('resend.com')) sends++;
      return json(url.endsWith('/claim_launch_signup_v2') ? freshClaim : url.endsWith('/authorize_launch_delivery_v1') ? value : true);
    } });
    assert.equal(out.status, 503); assert.equal(sends, 0);
  }
});
