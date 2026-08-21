import assert from 'node:assert/strict';
import test from 'node:test';
import { registerWaitlistEmail } from '../lib/waitlist-service.mjs';

const config = {
  email: 'student@example.com',
  supabaseUrl: 'https://waitlist.supabase.co',
  serviceRoleKey: 'service-key',
  resendApiKey: 're_test_key',
  fromEmail: 'Veylo <hello@veylo.app>',
  siteUrl: 'https://veylo-site-preview.vercel.app',
  logger: { error() {} },
};

test('stores a new email and sends exactly one confirmation', async () => {
  const sent = [];
  const result = await registerWaitlistEmail({
    ...config,
    fetchImpl: async () => new Response(null, { status: 201 }),
    sendConfirmation: async options => {
      sent.push(options);
      return { ok: true, id: 'email_123' };
    },
  });
  assert.equal(result.status, 201);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, 'student@example.com');
});

test('does not send a confirmation for a duplicate email', async () => {
  const sent = [];
  const result = await registerWaitlistEmail({
    ...config,
    fetchImpl: async () => new Response(JSON.stringify({ code: '23505' }), {
      status: 409,
      headers: { 'content-type': 'application/json' },
    }),
    sendConfirmation: async options => {
      sent.push(options);
      return { ok: true };
    },
  });
  assert.equal(result.status, 200);
  assert.match(result.message, /already/i);
  assert.equal(sent.length, 0);
});

test('does not send when Supabase fails', async () => {
  const sent = [];
  const result = await registerWaitlistEmail({
    ...config,
    fetchImpl: async () => new Response(JSON.stringify({ code: 'XX000' }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    }),
    sendConfirmation: async options => {
      sent.push(options);
      return { ok: true };
    },
  });
  assert.equal(result.status, 500);
  assert.equal(sent.length, 0);
});

test('keeps signup successful when confirmation delivery fails', async () => {
  const result = await registerWaitlistEmail({
    ...config,
    fetchImpl: async () => new Response(null, { status: 201 }),
    sendConfirmation: async () => ({ ok: false }),
  });
  assert.equal(result.status, 201);
  assert.match(result.message, /on the list/i);
});

test('returns 201 within the configured deadline when the real Resend sender stalls', async () => {
  let resendSignal;
  const startedAt = Date.now();
  const result = await settlesWithin(
    registerWaitlistEmail({
      ...config,
      resendRequestTimeoutMs: 20,
      fetchImpl: async (url, options) => {
        if (url === 'https://waitlist.supabase.co/rest/v1/waitlist') {
          return new Response(null, { status: 201 });
        }
        if (url === 'https://api.resend.com/emails') {
          resendSignal = options.signal;
          return new Promise((_, reject) => {
            if (!resendSignal) return;
            resendSignal.addEventListener('abort', () => reject(resendSignal.reason), { once: true });
          });
        }
        throw new Error(`Unexpected URL: ${url}`);
      },
    }),
    250,
  );

  assert.equal(result.status, 201);
  assert.match(result.message, /on the list/i);
  assert.equal(resendSignal.aborted, true);
  assert.ok(Date.now() - startedAt < 250);
});

test('keeps signup successful when confirmation sender throws', async () => {
  const logged = [];
  const result = await registerWaitlistEmail({
    ...config,
    fetchImpl: async () => new Response(null, { status: 201 }),
    sendConfirmation: async () => {
      throw new Error('Resend unavailable');
    },
    logger: { error: (...args) => logged.push(args) },
  });
  assert.equal(result.status, 201);
  assert.match(result.message, /on the list/i);
  assert.equal(logged.length, 1);
});

test('does not log secrets when database insert throws', async () => {
  const logged = [];
  const result = await registerWaitlistEmail({
    ...config,
    fetchImpl: async () => {
      throw new Error('request failed for student@example.com using service-key');
    },
    logger: { error: (...args) => logged.push(args) },
  });
  assert.equal(result.status, 500);
  assert.equal(logged.length, 1);
  assert.doesNotMatch(JSON.stringify(logged), /student@example\.com/);
  assert.doesNotMatch(JSON.stringify(logged), /service-key/);
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
