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
```

Use values from the waitlist-only Supabase project. Do not copy credentials from the Veylo app.

Deploy after adding the variables. Vercel will serve the static pages and deploy `api/waitlist.js` as a serverless function.

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
