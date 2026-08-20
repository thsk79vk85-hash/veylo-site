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
