# Veylo Waitlist Confirmation Email Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Send one branded Resend confirmation email after a new student is successfully stored in the isolated Veylo waitlist database.

**Architecture:** Keep the browser form and isolated Supabase table unchanged. Add a focused Resend email module and a waitlist registration service, then make the existing Vercel function delegate to that service. Database storage remains authoritative: email-delivery failure is logged safely but never reverses or misreports a completed signup.

**Tech Stack:** Node.js ESM, Node built-in test runner, Vercel Functions, Supabase REST API, Resend Email HTTP API.

## Global Constraints

- Change only the separate `veylo-site` repository and `veylo-site-preview` Vercel project.
- Do not modify the Veylo mobile app repository, app Supabase project, or app authentication email flow.
- Reuse the same verified Veylo sender address and domain already used for app verification emails.
- Keep `RESEND_API_KEY`, `WAITLIST_FROM_EMAIL`, `WAITLIST_SUPABASE_URL`, and `WAITLIST_SUPABASE_SERVICE_ROLE_KEY` server-side.
- Never send confirmation email for duplicates, invalid submissions, or honeypot submissions.
- A Resend failure must not change a completed database signup into a failed signup response.
- Do not add recipients to a Resend Audience or broadcast list.
- Do not promise guaranteed beta acceptance, immediate access, or a launch date.
- The confirmation email must not include the removed exact-location privacy reminder.

## File Structure

- Create `lib/waitlist-confirmation.mjs`: build the HTML/text message and call the Resend Email API.
- Create `lib/waitlist-service.mjs`: own Supabase insertion, duplicate detection, and one-time confirmation dispatch.
- Modify `api/waitlist.js`: validate HTTP input and delegate registration to the service.
- Create `tests/waitlist-confirmation.test.mjs`: verify message copy and Resend request behavior.
- Create `tests/waitlist-service.test.mjs`: verify new, duplicate, database-error, and email-error flows.
- Create `tests/api-waitlist.test.mjs`: verify the HTTP boundary, validation, and dependency wiring.
- Modify `.env.example`: document the two server-only Resend values.
- Modify `README.md`: document configuration and production verification.

---

### Task 1: Confirmation email content and Resend transport

**Files:**
- Create: `lib/waitlist-confirmation.mjs`
- Create: `tests/waitlist-confirmation.test.mjs`

**Interfaces:**
- Produces: `buildWaitlistConfirmation({ to, from, siteUrl }) => { from, to, subject, html, text }`
- Produces: `sendWaitlistConfirmation({ apiKey, to, from, siteUrl, fetchImpl, logger }) => Promise<{ ok: boolean, id?: string }>`

- [ ] **Step 1: Write failing tests for the email payload**

Create `tests/waitlist-confirmation.test.mjs` with assertions that the payload:

```js
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
  assert.match(email.text, /successfully added/i);
  assert.match(email.text, /campus social app/i);
  assert.match(email.text, /active development/i);
  assert.match(email.text, /early beta access/i);
  assert.match(email.text, /https:\/\/veylo-site-preview\.vercel\.app/);
  assert.match(email.html, /#146C63/i);
  assert.doesNotMatch(email.text, /exact live location/i);
  assert.doesNotMatch(email.html, /exact live location/i);
  assert.doesNotMatch(email.text, /guaranteed/i);
});
```

- [ ] **Step 2: Run the focused test and confirm it fails**

Run: `node --test tests/waitlist-confirmation.test.mjs`

Expected: FAIL because `lib/waitlist-confirmation.mjs` does not exist.

- [ ] **Step 3: Implement the message builder**

Create `lib/waitlist-confirmation.mjs` with:

```js
const DEFAULT_SITE_URL = 'https://veylo-site-preview.vercel.app';

export function buildWaitlistConfirmation({ to, from, siteUrl = DEFAULT_SITE_URL }) {
  const subject = 'You’re on the Veylo waitlist';
  const text = [
    'You’ve been successfully added to the Veylo waitlist.',
    '',
    'Veylo is a campus social app that helps university students see which friends are sharing that they are around, discover useful campus updates, and turn those updates into real plans.',
    '',
    'Veylo is in active development. Our team may contact you about early beta access, testing opportunities, and ways to help shape the app before launch.',
    '',
    `Learn more: ${siteUrl}`,
    '',
    '— The Veylo team',
  ].join('\n');

  const html = `<!doctype html>
<html lang="en">
  <body style="margin:0;background:#F4F8F7;color:#17211F;font-family:Arial,sans-serif">
    <div style="display:none;max-height:0;overflow:hidden">You’re on the Veylo waitlist.</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#F4F8F7;padding:32px 16px">
      <tr><td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#FFFFFF;border:1px solid #D9E4E1;border-radius:20px">
          <tr><td style="padding:36px">
            <p style="margin:0 0 24px;color:#146C63;font-size:24px;font-weight:700">Veylo</p>
            <h1 style="margin:0 0 18px;font-size:32px;line-height:1.15">You’re on the waitlist.</h1>
            <p style="margin:0 0 18px;line-height:1.65">You’ve been successfully added to the Veylo waitlist.</p>
            <p style="margin:0 0 18px;line-height:1.65">Veylo is a campus social app that helps university students see which friends are sharing that they are around, discover useful campus updates, and turn those updates into real plans.</p>
            <p style="margin:0 0 26px;line-height:1.65">Veylo is in active development. Our team may contact you about early beta access, testing opportunities, and ways to help shape the app before launch.</p>
            <a href="${siteUrl}" style="display:inline-block;padding:13px 18px;border-radius:12px;background:#146C63;color:#FFFFFF;text-decoration:none;font-weight:700">Visit Veylo</a>
            <p style="margin:30px 0 0;color:#65736F;font-size:14px">— The Veylo team</p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;

  return { from, to, subject, html, text };
}
```

- [ ] **Step 4: Run the payload test and confirm it passes**

Run: `node --test tests/waitlist-confirmation.test.mjs`

Expected: PASS for `builds the approved branded confirmation email`.

- [ ] **Step 5: Add failing tests for Resend transport**

Append tests that mock `fetchImpl` and verify:

```js
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
  assert.equal(calls[0][1].headers.authorization, 'Bearer re_test_key');
  const body = JSON.parse(calls[0][1].body);
  assert.equal(body.to, 'student@example.com');
  assert.equal(body.subject, 'You’re on the Veylo waitlist');
  assert.ok(body.html);
  assert.ok(body.text);
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
```

- [ ] **Step 6: Implement the Resend transport**

Add `sendWaitlistConfirmation` to `lib/waitlist-confirmation.mjs`. It must POST JSON to `https://api.resend.com/emails`, use `Authorization: Bearer <key>`, return `{ ok: true, id }` for a successful response, and return `{ ok: false }` after logging only `status` and Resend `name` for failures. Missing configuration must also return `{ ok: false }` without throwing.

- [ ] **Step 7: Run the focused email tests**

Run: `node --test tests/waitlist-confirmation.test.mjs`

Expected: all confirmation-email tests PASS.

- [ ] **Step 8: Commit the email module**

```bash
git add lib/waitlist-confirmation.mjs tests/waitlist-confirmation.test.mjs
git commit -m "feat: add waitlist confirmation email"
```

---

### Task 2: Registration service with database-first semantics

**Files:**
- Create: `lib/waitlist-service.mjs`
- Create: `tests/waitlist-service.test.mjs`

**Interfaces:**
- Consumes: `sendWaitlistConfirmation(options)` from Task 1.
- Produces: `registerWaitlistEmail({ email, supabaseUrl, serviceRoleKey, resendApiKey, fromEmail, siteUrl, fetchImpl, sendConfirmation, logger }) => Promise<{ status: number, message: string }>`

- [ ] **Step 1: Write failing service tests**

Create tests with queued mock responses. Cover these exact outcomes:

```js
test('stores a new email and sends exactly one confirmation', async () => {
  // Supabase returns 201, then the injected confirmation sender returns { ok: true }.
  // Assert result is status 201 and sender received the normalized recipient once.
});

test('does not send a confirmation for a duplicate email', async () => {
  // Supabase returns 409 with { code: '23505' }.
  // Assert result is status 200 with “already” copy and sender call count is zero.
});

test('does not send when Supabase fails', async () => {
  // Supabase returns 500.
  // Assert result is status 500 and sender call count is zero.
});

test('keeps signup successful when confirmation delivery fails', async () => {
  // Supabase returns 201 and sender returns { ok: false }.
  // Assert result remains status 201 with the normal signup message.
});
```

Use `assert.equal`, `assert.deepEqual`, and explicit call arrays; do not make real network requests.

- [ ] **Step 2: Run the service tests and confirm they fail**

Run: `node --test tests/waitlist-service.test.mjs`

Expected: FAIL because `registerWaitlistEmail` does not exist.

- [ ] **Step 3: Implement `registerWaitlistEmail`**

The function must:

1. POST `{ email }` to `${supabaseUrl}/rest/v1/waitlist` with the existing service-role headers.
2. On `response.ok`, await `sendConfirmation` once with `apiKey`, `to`, `from`, `siteUrl`, `fetchImpl`, and `logger`.
3. Return status 201 and `You’re on the list. We’ll contact you when beta testing opens.` regardless of the confirmation sender’s `ok` value.
4. On 409 or Postgres code `23505`, return status 200 and `You’re already on the waitlist.` without calling the sender.
5. On other Supabase errors, log only status/code and return status 500 with `Something went wrong. Try again.`.
6. On unexpected network exceptions, log the exception message and return the same generic status 500 response.

- [ ] **Step 4: Run the service tests**

Run: `node --test tests/waitlist-service.test.mjs`

Expected: all registration-service tests PASS.

- [ ] **Step 5: Commit the registration service**

```bash
git add lib/waitlist-service.mjs tests/waitlist-service.test.mjs
git commit -m "feat: send confirmation after waitlist signup"
```

---

### Task 3: Wire the Vercel HTTP endpoint with testable dependencies

**Files:**
- Modify: `api/waitlist.js`
- Create: `tests/api-waitlist.test.mjs`

**Interfaces:**
- Consumes: `validateWaitlistSubmission(payload)`.
- Consumes: `registerWaitlistEmail(options)`.
- Produces: `createWaitlistHandler({ register, env, logger }) => async handler(request, response)`.
- Preserves: default Vercel export created with real `process.env` and `registerWaitlistEmail`.

- [ ] **Step 1: Write failing HTTP-boundary tests**

Create a response recorder with `status()`, `setHeader()`, and `end()`. Verify:

- GET returns 405 and never calls `register`.
- Invalid email returns 400 and never calls `register`.
- Honeypot returns 200 and never calls `register`.
- Missing Supabase variables returns 503 and never calls `register`.
- Valid input passes the normalized email and all four server-side configuration values into `register`.
- The handler emits the status/message returned by `register`.

- [ ] **Step 2: Run the HTTP tests and confirm they fail**

Run: `node --test tests/api-waitlist.test.mjs`

Expected: FAIL because `createWaitlistHandler` is not exported.

- [ ] **Step 3: Refactor the endpoint minimally**

Update `api/waitlist.js` to:

```js
import { validateWaitlistSubmission } from '../lib/waitlist.mjs';
import { registerWaitlistEmail } from '../lib/waitlist-service.mjs';

export function createWaitlistHandler({
  register = registerWaitlistEmail,
  env = process.env,
  logger = console,
} = {}) {
  return async function handler(request, response) {
    // Preserve method and validation handling.
    // Require WAITLIST_SUPABASE_URL and WAITLIST_SUPABASE_SERVICE_ROLE_KEY.
    // Pass RESEND_API_KEY and WAITLIST_FROM_EMAIL to register.
    // Send the service result through sendJson.
  };
}

export default createWaitlistHandler();
```

The handler must not require Resend configuration to accept a waitlist signup; the confirmation module handles missing Resend configuration as a safe delivery failure.

- [ ] **Step 4: Run all endpoint and service tests**

Run: `node --test tests/api-waitlist.test.mjs tests/waitlist-service.test.mjs tests/waitlist-confirmation.test.mjs`

Expected: all tests PASS.

- [ ] **Step 5: Run the complete existing test suite**

Run: `npm test`

Expected: all existing site, validation, service, and email tests PASS.

- [ ] **Step 6: Commit endpoint wiring**

```bash
git add api/waitlist.js tests/api-waitlist.test.mjs
git commit -m "feat: wire waitlist confirmation delivery"
```

---

### Task 4: Document configuration and operational behavior

**Files:**
- Modify: `.env.example`
- Modify: `README.md`

**Interfaces:**
- Documents the runtime inputs consumed by Tasks 1–3.

- [ ] **Step 1: Update the environment example**

Append:

```text
# Server-only Resend credentials for one-time waitlist confirmations.
RESEND_API_KEY=
WAITLIST_FROM_EMAIL=Veylo <hello@verified-veylo-domain>
```

Do not place a real key or private credential in the repository.

- [ ] **Step 2: Update the README**

Add a “Confirmation email” section documenting:

- The email sends only after a new database insert.
- Duplicate and honeypot submissions do not send.
- A delivery failure does not remove the stored signup.
- `RESEND_API_KEY` and `WAITLIST_FROM_EMAIL` are sensitive Vercel variables.
- The sender must use the already verified Veylo domain.
- Production must be redeployed after environment variables change.

- [ ] **Step 3: Run documentation and secret scans**

Run:

```bash
npm test
rg -n "re_[A-Za-z0-9_]{16,}|service_role.*eyJ|RESEND_API_KEY=.+" . --glob '!docs/superpowers/**'
```

Expected: tests PASS and the scan prints no committed credential value.

- [ ] **Step 4: Commit documentation**

```bash
git add .env.example README.md
git commit -m "docs: configure waitlist confirmation email"
```

---

### Task 5: Configure Resend, deploy, and verify production

**Files:**
- External configuration only: `veylo-site-preview` Vercel environment variables.
- No app-repository or app-Supabase changes.

**Interfaces:**
- Supplies `RESEND_API_KEY` and `WAITLIST_FROM_EMAIL` to the production and preview Vercel environments.

- [ ] **Step 1: Confirm the verified sender**

In Resend, identify the exact sender address on the already verified Veylo domain. Do not use `onboarding@resend.dev` for production.

- [ ] **Step 2: Obtain a narrowly scoped sending credential**

Reuse an existing Resend sending key only if its value is safely available and intended for this website. Otherwise, request action-time confirmation, create a sending-only Resend key, and copy it directly into Vercel without placing it in chat, source control, or a local tracked file.

- [ ] **Step 3: Add sensitive Vercel values**

In only the `veylo-site-preview` project, set `RESEND_API_KEY` and `WAITLIST_FROM_EMAIL` as sensitive values for Production and Preview. Confirm the existing Supabase variables remain unchanged.

- [ ] **Step 4: Deploy the implementation branch to Preview**

Deploy `feature/marketing-waitlist` and confirm the resulting deployment is READY. Do not promote until automated tests pass and the endpoint behaves correctly.

- [ ] **Step 5: Run preview smoke tests**

Check:

```bash
curl -I https://<preview-hostname>
curl -i -X POST https://<preview-hostname>/api/waitlist \
  -H 'content-type: application/json' \
  -d '{"email":"a-real-disposable-inbox-address","company":""}'
```

Expected: page returns 200; first valid submission returns 201.

Use an inbox the operator can actually inspect. Confirm one branded message arrives from the verified Veylo sender and that its subject, HTML, text fallback, and links are correct.

- [ ] **Step 6: Verify duplicate protection**

Submit the same address a second time.

Expected: HTTP 200 with `You’re already on the waitlist.` and no second Resend message.

- [ ] **Step 7: Verify isolated database storage**

Query only project `yohiumlrpfdhphsnnxxw`:

```sql
select email, created_at
from public.waitlist
where email = lower(trim('<the-disposable-inbox-address>'));
```

Expected: exactly one row.

- [ ] **Step 8: Inspect safe runtime diagnostics**

Check the preview deployment’s runtime errors and logs. Expected: no unexpected errors and no API keys or full recipient addresses in log messages.

- [ ] **Step 9: Deploy the verified source to Production**

Create a Production deployment from the verified implementation source with the latest project settings. Confirm `https://veylo-site-preview.vercel.app` serves the full marketing page without authentication.

- [ ] **Step 10: Run the production acceptance test**

Use a second inspectable inbox address. Confirm:

1. The public form returns success.
2. Exactly one row is stored in the isolated waitlist database.
3. Exactly one confirmation email arrives.
4. Resubmission returns the duplicate message and sends no second email.
5. Existing privacy, terms, and support pages remain reachable.

- [ ] **Step 11: Record final verification**

Report the public URL, deployment status, tests run, confirmation delivery result, duplicate result, and the fact that the Veylo app repository and app Supabase project were untouched.
