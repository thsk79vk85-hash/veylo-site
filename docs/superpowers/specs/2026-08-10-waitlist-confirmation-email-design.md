# Veylo Waitlist Confirmation Email Design

## Goal

Send a branded transactional confirmation email when a university student successfully joins the Veylo beta waitlist. The confirmation should reassure the student that the signup worked, briefly explain Veylo, and set accurate expectations about what happens next.

## Scope and isolation

- Change only the separate `veylo-site` marketing website and its `veylo-site-preview` Vercel project.
- Continue storing waitlist records only in the separate `Veylo Waitlist` Supabase project.
- Do not modify the Veylo mobile app repository, app Supabase project, or app authentication email flow.
- Reuse the same verified Veylo sender address and domain already used for app verification emails.
- Keep all Resend credentials server-side.

## Recommended architecture

Extend the existing `/api/waitlist` serverless endpoint. For a valid new submission:

1. Normalize and validate the email as it does today.
2. Insert the address into the isolated `public.waitlist` table.
3. After a successful insert, send one transactional confirmation through the Resend Email API.
4. Return the existing successful signup response to the browser.

Use the Resend HTTP API directly from the existing JavaScript serverless function. This avoids adding a framework or email-template dependency to the small static website.

## Configuration

Add these sensitive server-side values to the separate Vercel website project:

- `RESEND_API_KEY` — a Resend key permitted to send transactional email.
- `WAITLIST_FROM_EMAIL` — the verified Veylo sender in the form `Veylo <sender@verified-domain>`.

Neither value may appear in browser JavaScript, HTML, logs, source control, or a public environment-variable prefix.

## Confirmation email

Subject: `You’re on the Veylo waitlist`

The email should:

- Address the recipient without inventing a name.
- Confirm that their email was added successfully.
- Describe Veylo as a campus social app that helps university students see which friends are sharing that they are around, discover useful campus updates, and turn those updates into real plans.
- Explain that Veylo is in active development.
- Say the team may contact them about early beta access, testing opportunities, and product feedback.
- Avoid promising guaranteed beta acceptance, immediate access, or a launch date.
- Remind them that Veylo uses campus-level presence and does not show an exact live location.
- Include the public Veylo website URL.

Provide both HTML and plain-text versions. Use the existing green, cream, white, dark-text, and orange Veylo palette. Keep the design simple and reliable across common email clients.

## Duplicate handling

A duplicate database insert continues to return `You’re already on the waitlist.` It must not send another confirmation email. This prevents repeated form submissions from becoming an email-abuse mechanism.

## Failure behaviour

Database storage remains the source of truth.

- If database insertion fails, do not send an email and return the existing generic signup error.
- If database insertion succeeds but Resend fails, keep the student on the waitlist.
- Record only safe delivery diagnostics in server logs: Resend response status, error code, and request context that does not include the API key or full recipient address.
- Return a successful waitlist response because the signup itself completed. Do not ask the student to resubmit and create duplicates.
- Do not expose Resend’s raw error response to the browser.

The first implementation will not add a retry queue or delivery-status columns. Those are unnecessary for the current beta volume and can be added later if delivery monitoring shows a need.

## Abuse and privacy protections

- Preserve existing email validation and the hidden honeypot field.
- Send only after the database confirms a new record.
- Never send for bot-honeypot submissions.
- Never send for duplicate submissions.
- Do not add the recipient to a marketing audience or broadcast list.
- Use the submitted address only for the waitlist confirmation and the beta-contact purpose already disclosed on the page.

## Testing

Add focused automated tests for:

- A new valid email triggers one Resend request after successful storage.
- The Resend request uses the configured sender, correct recipient, expected subject, HTML body, and plain-text body.
- A duplicate signup does not call Resend.
- A bot-honeypot submission does not call Resend.
- A database failure does not call Resend.
- A Resend failure does not change a completed database signup into a failed signup response.
- Missing Resend configuration is handled safely without exposing secrets.

Production verification must:

1. Confirm the full website remains publicly accessible.
2. Submit a new disposable inbox address through the actual waitlist form.
3. Confirm the record appears in the isolated waitlist database.
4. Confirm exactly one branded email arrives from the verified Veylo sender.
5. Submit the same address again and confirm no second email is sent.
6. Inspect Vercel runtime logs for unexpected errors without printing credentials or full recipient addresses.
