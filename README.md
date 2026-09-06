# Veylo marketing site and beta waitlist

This repository contains the public Veylo marketing page, legal pages, and a small beta waitlist endpoint for Vercel.

The waitlist must remain completely separate from the Veylo application database. It stores only a normalized email address and its creation time.

## Run locally

```bash
npm test
npx vercel dev
```

The static page can also be opened directly, but the waitlist endpoint requires `vercel dev` and environment variables.

## Create the separate waitlist database

1. Create a brand-new Supabase project specifically for the waitlist.
2. Confirm it is not the Supabase project used by the Veylo app.
3. Open the SQL editor in the new project.
4. Run `supabase/waitlist.sql`.
5. Open Project Settings → API.
6. Copy the project URL and service-role key.
7. Keep the service-role key server-side only.

The SQL enables Row Level Security and creates no public policies, so browser clients cannot list or modify waitlist records.

## Configure Vercel

Add these environment variables to the separate Vercel site project:

```text
WAITLIST_SUPABASE_URL
WAITLIST_SUPABASE_SERVICE_ROLE_KEY
RESEND_API_KEY
WAITLIST_FROM_EMAIL
```

Use values from the waitlist-only Supabase project. Do not copy credentials from the Veylo app.

`RESEND_API_KEY` and `WAITLIST_FROM_EMAIL` are sensitive, server-only Vercel variables. The sender must use the already verified Veylo domain (for example, `Veylo <hello@veylo.app>`); do not use the placeholder sender in production. After changing environment variables, redeploy production for the changes to take effect.

Deploy after adding the variables. Vercel will serve the static pages and deploy `api/waitlist.js` as a serverless function.

## Confirmation email

The confirmation email sends only after a new waitlist row is inserted successfully. Duplicate submissions and honeypot submissions do not send an email. If delivery fails, the stored signup remains in the waitlist and the endpoint still treats the signup as successful.

## Test the endpoint

```bash
curl -X POST http://localhost:3000/api/waitlist \
  -H 'content-type: application/json' \
  -d '{"email":"tester@example.com","company":""}'
```

Expected first response: HTTP 201. A duplicate email returns HTTP 200 with a friendly already-registered message.

## View or export testers

Open the waitlist-only Supabase project, select Table Editor → `waitlist`, and export the table as CSV. No admin dashboard is required.

## Optional custom domain

The project works with its free `.vercel.app` address. A domain can be added later in Vercel Project Settings → Domains without changing the application code.

## Current policy and terms

The canonical policy and terms are published from the `main` branch of this repository through GitHub Pages:

- https://thsk79vk85-hash.github.io/veylo-site/privacy.html
- https://thsk79vk85-hash.github.io/veylo-site/terms.html

Marketing and support links point directly to those URLs. Vercel redirects the old `/privacy.html` and `/terms.html` URLs to the canonical pages; the HTML files provide a redirect and clickable fallback when served outside Vercel. Update the canonical documents on `main` instead of creating another policy copy on the marketing branch. Both live documents were checked against GitHub on 6 September 2026 and show 18 August 2026 as their effective update date.

The Vercel marketing branch and GitHub Pages `main` have different roles. Do not merge the marketing branch's redirect-only `privacy.html` and `terms.html` onto `main`: those files must remain the actual legal documents on GitHub Pages.
