import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';

// Optional loading keeps RED about absent behavior, not an import error.
const launch = await import('../lib/launch-list.mjs').catch(error => {
  if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
  return {};
});
const env = {
  SIGNUP_RATE_SECRET: 'fixture-rate-key',
  SIGNUP_LAUNCH_MATCH_SECRET: 'fixture-match-key',
  SIGNUP_LAUNCH_TOKEN_SECRET: 'fixture-token-key',
  WAITLIST_SUPABASE_URL: 'https://database.invalid',
  WAITLIST_SUPABASE_SERVICE_ROLE_KEY: 'fixture-service-key',
};

test('private matching normalizes email and uses a keyed digest', () => {
  assert.equal(typeof launch.launchMatch, 'function', 'private matching is implemented');
  const actual = launch.launchMatch(' PERSON@Test.Invalid ', env.SIGNUP_LAUNCH_MATCH_SECRET);
  assert.equal(actual, createHmac('sha256', 'fixture-match-key').update('person@test.invalid').digest('hex'));
  assert.notEqual(actual, createHash('sha256').update('person@test.invalid').digest('hex'));
  assert.notEqual(actual, launch.launchMatch('person@test.invalid', 'other-fixture-key'));
});

test('canonical ID and nonce produce byte-stable opaque launch links on retries', () => {
  assert.equal(typeof launch.deriveLaunchToken, 'function', 'token derivation is implemented');
  const id = '00000000-0000-4000-8000-000000000021';
  const nonce = '00000000-0000-4000-8000-000000000022';
  const token = launch.deriveLaunchToken(id, nonce, env.SIGNUP_LAUNCH_TOKEN_SECRET);
  assert.equal(Buffer.from(token, 'base64url').length, 32);
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(token, launch.deriveLaunchToken(id, nonce, env.SIGNUP_LAUNCH_TOKEN_SECRET));
  assert.notEqual(token, launch.deriveLaunchToken(nonce, id, env.SIGNUP_LAUNCH_TOKEN_SECRET));
  assert.notEqual(token, launch.deriveLaunchToken(id, nonce, env.SIGNUP_LAUNCH_MATCH_SECRET));
  assert.notEqual(token, createHmac('sha256', env.SIGNUP_LAUNCH_TOKEN_SECRET).update(id + nonce).digest('base64url'));
  const url = launch.buildLaunchUnsubscribeUrl(token);
  assert.equal(url, `https://joinveylo.com/launch-unsubscribe.html#${token}`);
  assert.equal(url, launch.buildLaunchUnsubscribeUrl(launch.deriveLaunchToken(id, nonce, env.SIGNUP_LAUNCH_TOKEN_SECRET)));
  assert.equal(new URL(url).search, '');
  assert.ok(!url.includes(id) && !url.includes(nonce) && !url.includes('@'));
  assert.equal(launch.hashLaunchToken(token), createHash('sha256').update(token).digest('hex'));
});

test('secret configuration rejects missing or reused keys without disclosing values', () => {
  assert.equal(typeof launch.validateLaunchSecrets, 'function', 'separate keys are validated');
  assert.doesNotThrow(() => launch.validateLaunchSecrets(env));
  for (const patch of [
    { SIGNUP_LAUNCH_TOKEN_SECRET: '' }, { SIGNUP_LAUNCH_MATCH_SECRET: undefined },
    { SIGNUP_RATE_SECRET: '' },
    { SIGNUP_LAUNCH_MATCH_SECRET: env.SIGNUP_RATE_SECRET },
    { SIGNUP_LAUNCH_TOKEN_SECRET: env.SIGNUP_RATE_SECRET },
    { SIGNUP_LAUNCH_TOKEN_SECRET: env.SIGNUP_LAUNCH_MATCH_SECRET },
  ]) assert.throws(() => launch.validateLaunchSecrets({ ...env, ...patch }), error => !error.message.includes('fixture-'));
});

test('launch email retry bodies are identical and carry an address-free withdrawal link in text and HTML', () => {
  assert.equal(typeof launch.buildLaunchEmail, 'function', 'stable launch email body is implemented');
  const input = { email: 'person@test.invalid', id: 'signup-fixture-id', nonce: 'signup-fixture-nonce', env: { ...env, WAITLIST_FROM_EMAIL: 'Veylo <sender@test.invalid>' } };
  const first = launch.buildLaunchEmail(input);
  const retry = launch.buildLaunchEmail(input);
  assert.equal(JSON.stringify(first), JSON.stringify(retry));
  assert.equal(first.to, input.email);
  const urls = first.text.match(/https:\/\/joinveylo.com\/launch-unsubscribe\.html#[A-Za-z0-9_-]{43}/g);
  assert.equal(urls.length, 1);
  assert.ok(first.html.includes(`href="${urls[0]}"`));
  for (const body of [first.text, first.html]) {
    assert.ok(body.includes('support@joinveylo.com'));
    assert.ok(!body.includes(input.email));
    assert.ok(!body.includes('testflight.apple.com'));
  }
  assert.throws(() => launch.buildLaunchEmail({ ...input, env: { ...input.env, SIGNUP_LAUNCH_TOKEN_SECRET: env.SIGNUP_RATE_SECRET } }));
});

test('withdrawal transport sends only a hash to service-only RPC and sanitizes failures', async () => {
  assert.equal(typeof launch.withdrawLaunch, 'function', 'withdrawal transport is implemented');
  const token = Buffer.alloc(32, 7).toString('base64url');
  const calls = [];
  const outcome = await launch.withdrawLaunch({ token, env, fetchImpl: async (url, options) => {
    calls.push({ url, options });
    return new Response(JSON.stringify({ outcome: 'withdrawn' }), { status: 200 });
  } });
  assert.deepEqual(outcome, { outcome: 'withdrawn' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://database.invalid/rest/v1/rpc/withdraw_launch_v1');
  assert.deepEqual(JSON.parse(calls[0].options.body), { p_token_hash: createHash('sha256').update(token).digest('hex') });
  assert.ok(!JSON.stringify(calls).includes(token));
  for (const fetchImpl of [
    async () => { throw Error(token + env.SIGNUP_LAUNCH_TOKEN_SECRET); },
    async () => new Response(token, { status: 500 }),
    async () => new Response(JSON.stringify({ outcome: token }), { status: 200 }),
  ]) await assert.rejects(launch.withdrawLaunch({ token, env, fetchImpl }), error =>
    !error.message.includes(token) && !error.message.includes('fixture-'));
});
