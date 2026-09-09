import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildWaitlistConfirmation,
  sendWaitlistConfirmation,
} from '../lib/waitlist-confirmation.mjs';

test('builds the approved branded confirmation email', () => {
  const email = buildWaitlistConfirmation({
    to: 'student@example.com',
    from: 'Veylo <hello@veylo.app>',
    siteUrl: 'https://veylo-site-preview.vercel.app',
  });

  assert.equal(email.to, 'student@example.com');
  assert.equal(email.from, 'Veylo <hello@veylo.app>');
  assert.equal(email.subject, 'You’re on the Veylo waitlist');
  assert.match(email.text, /Thanks for joining us/i);
  assert.match(email.text, /friends are on campus/i);
  assert.match(email.text, /when Veylo launches/i);
  assert.match(email.text, /iPhone and Android/i);
  assert.match(email.text, /https:\/\/veylo-site-preview\.vercel\.app/);
  assert.match(email.html, /#146C63/i);
  assert.match(email.html, /#D8643C/i);
  assert.doesNotMatch(email.text, /exact live location/i);
  assert.doesNotMatch(email.html, /exact live location/i);
  assert.doesNotMatch(email.text, /guaranteed/i);
  assert.doesNotMatch(email.html, /guaranteed/i);
  assert.doesNotMatch(email.text, /immediate access/i);
  assert.doesNotMatch(email.html, /immediate access/i);
});

test('sends the email through the Resend Email API', async () => {
  const calls = [];
  const result = await sendWaitlistConfirmation({
    apiKey: 're_test_key',
    to: 'student@example.com',
    from: 'Veylo <hello@veylo.app>',
    siteUrl: 'https://veylo-site-preview.vercel.app',
    fetchImpl: async (...args) => {
      calls.push(args);
      return new Response(JSON.stringify({ id: 'email_123' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
    logger: { error() {} },
  });

  assert.deepEqual(result, { ok: true, id: 'email_123' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 'https://api.resend.com/emails');
  assert.equal(calls[0][1].method, 'POST');
  assert.equal(calls[0][1].headers.authorization, 'Bearer re_test_key');
  assert.equal(calls[0][1].headers['content-type'], 'application/json');
  const body = JSON.parse(calls[0][1].body);
  assert.equal(body.to, 'student@example.com');
  assert.equal(body.from, 'Veylo <hello@veylo.app>');
  assert.equal(body.subject, 'You’re on the Veylo waitlist');
  assert.ok(body.html);
  assert.ok(body.text);
});

test('returns a safe failure when Resend configuration is missing', async () => {
  const logged = [];
  let calls = 0;
  const result = await sendWaitlistConfirmation({
    to: 'student@example.com',
    fetchImpl: async () => {
      calls += 1;
      throw new Error('fetch should not be called');
    },
    logger: { error: (...args) => logged.push(args) },
  });

  assert.deepEqual(result, { ok: false });
  assert.equal(calls, 0);
  assert.deepEqual(logged, [
    ['[waitlist-email] Resend configuration is missing.'],
  ]);
});

test('returns a safe failure when Resend rejects the request', async () => {
  const logged = [];
  const result = await sendWaitlistConfirmation({
    apiKey: 're_test_key',
    to: 'student@example.com',
    from: 'Veylo <hello@veylo.app>',
    fetchImpl: async () => new Response(
      JSON.stringify({ name: 'validation_error', message: 'Rejected' }),
      { status: 422, headers: { 'content-type': 'application/json' } },
    ),
    logger: { error: (...args) => logged.push(args) },
  });

  assert.deepEqual(result, { ok: false });
  assert.equal(logged.length, 1);
  assert.doesNotMatch(JSON.stringify(logged), /student@example\.com/);
  assert.doesNotMatch(JSON.stringify(logged), /re_test_key/);
});

test('does not log sensitive details when the Resend request throws', async () => {
  const logged = [];
  const result = await sendWaitlistConfirmation({
    apiKey: 're_test_key',
    to: 'student@example.com',
    from: 'Veylo <hello@veylo.app>',
    fetchImpl: async () => {
      throw new Error('request failed for student@example.com using re_test_key');
    },
    logger: { error: (...args) => logged.push(args) },
  });

  assert.deepEqual(result, { ok: false });
  assert.equal(logged.length, 1);
  assert.doesNotMatch(JSON.stringify(logged), /student@example\.com/);
  assert.doesNotMatch(JSON.stringify(logged), /re_test_key/);
});

test('returns a safe failure within the configured deadline when Resend stalls', async () => {
  const logged = [];
  let resendSignal;
  const result = await settlesWithin(
    sendWaitlistConfirmation({
      apiKey: 're_test_key',
      to: 'student@example.com',
      from: 'Veylo <hello@veylo.app>',
      resendRequestTimeoutMs: 20,
      fetchImpl: async (_url, options) => new Promise((_, reject) => {
        resendSignal = options.signal;
        if (!resendSignal) return;
        resendSignal.addEventListener('abort', () => reject(resendSignal.reason), { once: true });
      }),
      logger: { error: (...args) => logged.push(args) },
    }),
    250,
  );

  assert.deepEqual(result, { ok: false });
  assert.equal(resendSignal.aborted, true);
  assert.deepEqual(logged, [
    ['[waitlist-email] Resend request timed out.', { category: 'request_timeout' }],
  ]);
  assert.doesNotMatch(JSON.stringify(logged), /student@example\.com/);
  assert.doesNotMatch(JSON.stringify(logged), /re_test_key/);
});

async function settlesWithin(promise, timeoutMs) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`operation did not settle within ${timeoutMs}ms`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
