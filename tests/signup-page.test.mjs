import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

// Execute shipped code; supply only DOM, clock and external HTTP boundaries.
function page(intent, fetchImpl) {
  const timers = new Map(), requests = [], nodes = new Map(); let timer = 0;
  function node(selector) {
    if (!nodes.has(selector)) nodes.set(selector, { value: selector.includes('email') ? 'fixture@test.invalid' : selector.includes('platform') ? 'ios' : '',
      hidden: false, disabled: false, textContent: '', listeners: {}, focus() {}, reportValidity() { return true; },
      addEventListener(type, fn) { this.listeners[type] = fn; },
      querySelector(child) { return node(`${selector} ${child}`); }, replaceChildren() {}, append() {} });
    return nodes.get(selector);
  }
  const document = { querySelector: node, querySelectorAll(selector) {
    return selector === '.beta-fields' ? [node('#beta-form fieldset'), node('#launch-preview-form fieldset')] : [];
  }, createElement() { return { append() {} }; } };
  runInNewContext(readFileSync(new URL('../signup.js', import.meta.url), 'utf8'), {
    document, location: { search: '' }, URLSearchParams, AbortSignal: {}, AbortController,
    setTimeout(fn, ms) { assert.equal(ms, 22000); timers.set(++timer, fn); return timer; },
    clearTimeout(id) { timers.delete(id); },
    fetch: async (...args) => { requests.push(args); return fetchImpl(...args); },
  });
  const form = node(intent === 'beta' ? '#beta-form' : '#launch-preview-form');
  return { timers, requests, node, form, fields: form.querySelector('fieldset'), message: form.querySelector('[role="alert"]'),
    submit: () => form.listeners.submit({ preventDefault() {} }) };
}
const flush = async () => { for (let n = 0; n < 12; n++) await Promise.resolve(); };

for (const intent of ['beta', 'launch']) {
  test(`older browsers bound stalled ${intent} signup, prevent duplicates and retry with fresh state`, async () => {
    const p = page(intent, (_url, options) => p.requests.length === 1
      ? new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(options.signal.reason)))
      : Promise.resolve(new Response(JSON.stringify({ saved: true, delivery: 'disabled', platform: 'ios', links: { testflight: 'https://test.invalid' } }))));
    p.submit(); p.submit(); await flush();
    assert.equal(p.requests.length, 1, 'fetch occurs without static timeout and only once');
    assert.equal(JSON.parse(p.requests[0][1].body).intent, intent);
    assert.equal(p.fields.disabled, true);
    p.timers.values().next().value(); await flush();
    assert.match(p.message.textContent, /couldn.t confirm.*signup/i);
    assert.equal(p.form.hidden, false); assert.equal(p.fields.disabled, false); assert.equal(p.timers.size, 0);
    p.submit(); await flush();
    assert.notEqual(p.requests[0][1].signal, p.requests[1][1].signal);
    assert.equal(p.requests[1][1].signal.aborted, false);
    assert.equal(p.form.hidden, true); assert.equal(p.timers.size, 0);
  });
  test(`${intent} signup timeout also bounds a stalled response body`, async () => {
    const p = page(intent, async (_url, options) => ({ ok: true, json: () => new Promise((_resolve, reject) =>
      options.signal.addEventListener('abort', () => reject(options.signal.reason))) }));
    p.submit(); await flush();
    assert.equal(p.requests.length, 1);
    p.timers.values().next().value(); await flush();
    assert.match(p.message.textContent, /couldn.t confirm.*signup/i);
    assert.equal(p.fields.disabled, false); assert.equal(p.timers.size, 0);
  });
}
