import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeEmail, validateWaitlistSubmission } from '../lib/waitlist.mjs';

test('normalizes email before storage', () => {
  assert.equal(normalizeEmail('  Tester@Example.COM  '), 'tester@example.com');
});

test('accepts a valid email and empty honeypot', () => {
  assert.deepEqual(validateWaitlistSubmission({ email: 'test@example.com', company: '' }), {
    ok: true,
    email: 'test@example.com',
  });
});

test('rejects invalid email addresses', () => {
  assert.deepEqual(validateWaitlistSubmission({ email: 'not-an-email', company: '' }), {
    ok: false,
    status: 400,
    message: 'Enter a valid email address.',
  });
});

test('silently accepts bot honeypot submissions without storing them', () => {
  assert.deepEqual(validateWaitlistSubmission({ email: 'bot@example.com', company: 'spam' }), {
    ok: false,
    status: 200,
    message: 'You’re on the list.',
    bot: true,
  });
});
