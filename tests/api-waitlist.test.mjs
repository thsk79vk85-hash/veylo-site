import assert from 'node:assert/strict';
import test from 'node:test';
import { createWaitlistHandler } from '../api/waitlist.js';

function createResponseRecorder() {
  return {
    statusCode: null,
    headers: {},
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
      return this;
    },
    end(body) {
      this.body = body;
    },
  };
}

function request(body, method = 'POST') {
  return { method, body };
}

const env = {
  WAITLIST_SUPABASE_URL: 'https://waitlist.supabase.co',
  WAITLIST_SUPABASE_SERVICE_ROLE_KEY: 'service-key',
  RESEND_API_KEY: 're_test_key',
  WAITLIST_FROM_EMAIL: 'Veylo <hello@veylo.app>',
};

test('GET returns 405 and never calls register', async () => {
  let calls = 0;
  const handler = createWaitlistHandler({ register: async () => { calls += 1; } });
  const response = createResponseRecorder();

  await handler(request({}, 'GET'), response);

  assert.equal(response.statusCode, 405);
  assert.equal(calls, 0);
  assert.equal(JSON.parse(response.body).message, 'Method not allowed.');
});

test('invalid email returns 400 and never calls register', async () => {
  let calls = 0;
  const handler = createWaitlistHandler({ register: async () => { calls += 1; }, env });
  const response = createResponseRecorder();

  await handler(request({ email: 'not-an-email', company: '' }), response);

  assert.equal(response.statusCode, 400);
  assert.equal(calls, 0);
  assert.equal(JSON.parse(response.body).message, 'Enter a valid email address.');
});

test('honeypot returns 200 and never calls register', async () => {
  let calls = 0;
  const handler = createWaitlistHandler({ register: async () => { calls += 1; }, env });
  const response = createResponseRecorder();

  await handler(request({ email: 'bot@example.com', company: 'spam' }), response);

  assert.equal(response.statusCode, 200);
  assert.equal(calls, 0);
  assert.equal(JSON.parse(response.body).message, 'You’re on the list.');
});

test('missing Supabase variables returns 503 and never calls register', async () => {
  let calls = 0;
  const errors = [];
  const handler = createWaitlistHandler({
    register: async () => { calls += 1; },
    env: { RESEND_API_KEY: env.RESEND_API_KEY, WAITLIST_FROM_EMAIL: env.WAITLIST_FROM_EMAIL },
    logger: { error: (...args) => errors.push(args) },
  });
  const response = createResponseRecorder();

  await handler(request({ email: 'student@example.com', company: '' }), response);

  assert.equal(response.statusCode, 503);
  assert.equal(calls, 0);
  assert.equal(errors.length, 1);
  assert.match(JSON.parse(response.body).message, /not ready/i);
});

test('valid input passes normalized email and all server configuration to register', async () => {
  const calls = [];
  const logger = { error() {} };
  const handler = createWaitlistHandler({
    register: async options => {
      calls.push(options);
      return { status: 202, message: 'Accepted.' };
    },
    env,
    logger,
  });
  const response = createResponseRecorder();

  await handler(request({ email: '  Student@Example.COM  ', company: '' }), response);

  assert.equal(response.statusCode, 202);
  assert.deepEqual(calls, [{
    email: 'student@example.com',
    supabaseUrl: env.WAITLIST_SUPABASE_URL,
    serviceRoleKey: env.WAITLIST_SUPABASE_SERVICE_ROLE_KEY,
    resendApiKey: env.RESEND_API_KEY,
    fromEmail: env.WAITLIST_FROM_EMAIL,
    siteUrl: 'https://veylo-site-preview.vercel.app',
    logger,
  }]);
  assert.equal(JSON.parse(response.body).message, 'Accepted.');
});

test('handler emits status and message returned by register', async () => {
  const handler = createWaitlistHandler({
    register: async () => ({ status: 500, message: 'Something went wrong. Try again.' }),
    env,
  });
  const response = createResponseRecorder();

  await handler(request({ email: 'student@example.com', company: '' }), response);

  assert.equal(response.statusCode, 500);
  assert.deepEqual(JSON.parse(response.body), { message: 'Something went wrong. Try again.' });
});
