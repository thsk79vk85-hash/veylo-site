import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const route = await import('../api/launch-unsubscribe.js').catch(error => {
  if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
  return {};
});
const token = Buffer.alloc(32, 7).toString('base64url');
const env = { SIGNUP_LAUNCH_UNSUBSCRIBE_ENABLED: 'true', WAITLIST_SUPABASE_URL: 'https://database.invalid', WAITLIST_SUPABASE_SERVICE_ROLE_KEY: 'fixture-service-key' };
async function request(overrides = {}, withdraw = async () => ({ outcome: 'withdrawn' }), config = env) {
  assert.equal(typeof route.createLaunchUnsubscribeHandler, 'function', 'explicit withdrawal route is implemented');
  const result = { headers: {} };
  const res = { status(n) { result.status = n; return this; }, setHeader(k, v) { result.headers[k.toLowerCase()] = v; return this; }, end(body) { result.body = JSON.parse(body); } };
  await route.createLaunchUnsubscribeHandler({ env: config, withdraw })({ method: 'POST', headers: { 'content-type': 'application/json' }, body: { token }, ...overrides }, res);
  return result;
}

test('GET and scanner methods never withdraw; activation defaults closed', async () => {
  let calls = 0;
  const withdraw = async () => { calls++; return { outcome: 'withdrawn' }; };
  for (const method of ['GET', 'HEAD', 'OPTIONS']) {
    const result = await request({ method }, withdraw);
    assert.equal(result.status, 405);
    assert.equal(result.headers.allow, 'POST');
  }
  assert.equal((await request({}, withdraw, { ...env, SIGNUP_LAUNCH_UNSUBSCRIBE_ENABLED: undefined })).status, 503);
  assert.equal(calls, 0);
});

test('bounded JSON accepts only a canonical token and no cross-purpose fields', async () => {
  let calls = 0;
  const withdraw = async () => { calls++; return { outcome: 'withdrawn' }; };
  for (const body of [null, [], {}, { token: 3 }, { token: 'bad' }, { token, intent: 'beta' }, { token, email: 'fixture@test.invalid' }]) {
    assert.equal((await request({ body }, withdraw)).status, 400);
  }
  assert.equal((await request({ headers: { 'content-type': 'text/plain' } }, withdraw)).status, 415);
  assert.equal((await request({ body: { token: 'x'.repeat(4097) } }, withdraw)).status, 413);
  assert.equal((await request({ headers: { 'content-type': 'application/json', 'content-length': '4097' } }, withdraw)).status, 413);
  assert.equal(calls, 0);
});

test('repeated valid POST succeeds, invalid token is generic, storage failure never claims success or logs input', async () => {
  const logs = [];
  const original = { log: console.log, warn: console.warn, error: console.error };
  for (const key of Object.keys(original)) console[key] = (...args) => logs.push(args.join(' '));
  try {
    for (const outcome of ['withdrawn', 'already_withdrawn', 'invalid', 'unexpected']) {
      const result = await request({}, async () => ({ outcome }));
      assert.equal(result.status, ['withdrawn', 'already_withdrawn'].includes(outcome) ? 200 : outcome === 'invalid' ? 400 : 503);
      assert.equal(result.headers['cache-control'], 'no-store');
      assert.equal(result.headers['referrer-policy'], 'no-referrer');
      assert.match(result.headers['x-robots-tag'], /noindex/);
      if (result.status !== 200) {
        assert.equal(result.body.outcome, undefined);
        assert.match(result.body.message, /support@joinveylo.com/);
      }
    }
    const result = await request({}, async () => { throw Error(`${token} fixture@test.invalid fixture-service-key`); });
    assert.equal(result.status, 503);
    for (const value of [token, 'fixture@test.invalid', 'fixture-service-key']) {
      assert.ok(!JSON.stringify(result).includes(value));
      assert.ok(!logs.join('\n').includes(value));
    }
  } finally { Object.assign(console, original); }
});

// Execute the shipped browser script, with only DOM and HTTP boundaries supplied.
// This is interaction coverage, not a claim of browser layout/device QA.
function page(fetchImpl, hash = `#${token}`, runtime = {}) {
  const file = new URL('../launch-unsubscribe.js', import.meta.url);
  assert.ok(existsSync(file), 'confirmation page behavior is implemented');
  const listeners = {};
  const button = { disabled: true, textContent: '', addEventListener(type, fn) { listeners[type] = fn; } };
  const status = { textContent: '' };
  for (const node of [button, status]) Object.defineProperty(node, 'innerHTML', { set() { assert.fail('Unsafe HTML rendering'); } });
  const history = [];
  const requests = [];
  const location = { hash, pathname: '/launch-unsubscribe.html', search: '?untrusted=1' };
  runInNewContext(readFileSync(file, 'utf8'), {
    document: { getElementById(id) { return id === 'unsubscribe-button' ? button : id === 'unsubscribe-status' ? status : null; } },
    window: { location, history: { replaceState(...args) { history.push(args); location.hash = ''; } } },
    fetch: async (...args) => { requests.push(args); return fetchImpl(...args); },
    AbortSignal, AbortController, setTimeout, clearTimeout, ...runtime,
    console: { log() { assert.fail('Page must not log'); }, error() { assert.fail('Page must not log'); } },
  });
  return { button, status, history, requests, click: () => listeners.click() };
}

test('older browsers bound stalled withdrawal, ignore duplicate clicks and retry with a fresh signal', async () => {
  const timers = new Map(); let next = 0;
  const p = page((_url, options) => p.requests.length === 1
    ? new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(options.signal.reason)))
    : Promise.resolve(new Response('{"outcome":"withdrawn"}')), `#${token}`, {
    AbortSignal: {}, setTimeout(fn, ms) { assert.equal(ms, 12000); timers.set(++next, fn); return next; },
    clearTimeout(id) { timers.delete(id); },
  });
  const pending = p.click(); await p.click();
  assert.equal(p.requests.length, 1, 'request reaches fetch without AbortSignal.timeout');
  assert.equal(p.button.disabled, true);
  timers.values().next().value(); await pending;
  assert.equal(p.requests[0][1].signal.aborted, true);
  assert.match(p.status.textContent, /couldn.t confirm removal/i);
  assert.equal(p.button.disabled, false); assert.equal(timers.size, 0);
  await p.click();
  assert.notEqual(p.requests[1][1].signal, p.requests[0][1].signal);
  assert.equal(p.requests[1][1].signal.aborted, false);
  assert.match(p.status.textContent, /removed from the launch list/i);
  assert.equal(timers.size, 0, 'success clears its timeout');
});

test('page erases fragment before interaction, scanner load is inert, explicit click posts once and confirms', async () => {
  let resolve;
  const p = page(() => new Promise(r => { resolve = r; }));
  assert.equal(p.history.length, 1);
  assert.equal(p.history[0][2], '/launch-unsubscribe.html');
  assert.equal(p.requests.length, 0);
  assert.equal(p.button.disabled, false);
  const pending = p.click();
  assert.equal(p.button.disabled, true);
  assert.match(p.status.textContent, /removing/i);
  await p.click();
  assert.equal(p.requests.length, 1);
  assert.equal(p.requests[0][0], '/api/launch-unsubscribe');
  assert.equal(p.requests[0][1].method, 'POST');
  assert.equal(p.requests[0][1].referrerPolicy, 'no-referrer');
  assert.deepEqual(JSON.parse(p.requests[0][1].body), { token });
  resolve(new Response(JSON.stringify({ outcome: 'withdrawn' }), { status: 200 }));
  await pending;
  assert.match(p.status.textContent, /removed.*launch/i);
  assert.equal(p.button.disabled, true);
  assert.ok(!p.status.textContent.includes(token));
});

test('page keeps error states honest and retries a failed POST; invalid/missing links stay disabled', async () => {
  let calls = 0;
  const p = page(async () => {
    calls++;
    if (calls === 1) throw Error(token);
    return new Response(JSON.stringify({ outcome: 'already_withdrawn' }), { status: 200 });
  });
  await p.click();
  assert.match(p.status.textContent, /couldn.t confirm/i);
  assert.match(p.status.textContent, /support@joinveylo.com/);
  assert.equal(p.button.disabled, false);
  await p.click();
  assert.match(p.status.textContent, /removed.*launch/i);
  for (const response of [new Response('{}', { status: 503 }), new Response('{"outcome":"surprise"}', { status: 200 }), new Response('not-json', { status: 200 })]) {
    const failed = page(async () => response);
    await failed.click();
    assert.match(failed.status.textContent, /couldn.t confirm/i);
    assert.equal(failed.button.disabled, false);
  }
  const invalid = page(async () => new Response('{}', { status: 400 }));
  await invalid.click();
  assert.match(invalid.status.textContent, /invalid|expired/i);
  assert.equal(invalid.button.disabled, true);
  for (const hash of ['', '#bad', '#<img src=x onerror=alert(1)>']) {
    const missing = page(() => { assert.fail('Invalid page must not post'); }, hash);
    assert.equal(missing.button.disabled, true);
    assert.match(missing.status.textContent, /support@joinveylo.com/);
    await missing.click();
    assert.equal(missing.requests.length, 0);
  }
});

test('page resources and deployment headers prevent token referrers, caching and indexing', () => {
  const file = new URL('../launch-unsubscribe.html', import.meta.url);
  assert.ok(existsSync(file), 'private page is implemented');
  const html = readFileSync(file, 'utf8');
  assert.match(html, /name="referrer" content="no-referrer"/);
  assert.match(html, /name="robots" content="noindex, nofollow"/);
  assert.match(html, /id="unsubscribe-button"[^>]*disabled/);
  assert.match(html, /id="unsubscribe-status"[^>]*aria-live="polite"/);
  const resources = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map(m => m[1]);
  assert.ok(resources.every(url => url.startsWith('/') || url.startsWith('mailto:')));
  const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
  for (const path of ['/launch-unsubscribe.html', '/api/launch-unsubscribe']) {
    const headers = Object.fromEntries((config.headers?.find(h => h.source === path)?.headers ?? []).map(h => [h.key.toLowerCase(), h.value]));
    assert.equal(headers['cache-control'], 'no-store');
    assert.equal(headers['referrer-policy'], 'no-referrer');
    assert.match(headers['x-robots-tag'], /noindex/);
  }
});
