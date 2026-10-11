# Combined beta signup preview — 11 October 2026

Entry point: `beta-preview.html?source=instagram#beta` (review-only).

## Implemented in this preview

The existing interactive showcase is preserved. The new page adds Android/iPhone choices, browser-only signup/success states, invitation-email previews, and an independent launch-notification form. All forms remain disabled until their local handlers are installed. The preview omits waitlist.js and analytics, makes no signup/email requests, and stores no addresses or tracking events persistently. The original index.html and server-side waitlist files are unchanged.

The review inspector demonstrates source (direct, instagram, qut-club, campus-poster, friend-invite), platform (ios/android/unspecified), and intent (beta/launch). Events explicitly report preview_only, signup_saved=false, invitation_sent=false and installation=not measured. Unknown sources fall back to direct. Forwarded links preserve a campaign label, not verified individual referral attribution. No actual installation measurement is implemented.

Android uses the verified handoff links: https://groups.google.com/g/veylo-android-testers, https://play.google.com/apps/testing/app.veylo and https://play.google.com/store/apps/details?id=app.veylo. The handoff reports Closed testing — Alpha release 1.0.2 and one eligible country/region. The preview does not claim worldwide access. It instructs users to join the group first with the same Play Store Google account, wait for access if approval is required, open testing, choose Become a tester, then install through Google Play. Group join/approval configuration has not been independently verified in this task.

The iPhone public TestFlight URL is unknown. Both success and email states display a non-clickable pending-link placeholder. No live Apple invitation is invented, and no App Store Connect API invitation integration exists.

## Future implementation boundary

Current branch source confirms api/waitlist.js delegates to registerWaitlistEmail and uses the existing Resend confirmation sender. Its existence and passing unit tests do not prove live email delivery. It handles launch-list registration, not separate beta records with source/platform/intent.

Before enabling a live beta endpoint:

- Verify Android membership configuration and exact eligible region; supply and verify an enabled public TestFlight invitation URL.
- Design an additive, backward-compatible signup contract. Preserve existing email-only waitlist clients as launch intent. Do not silently migrate launch signups into beta or marketing.
- Store source, platform, intent and the applicable consent wording/version; keep beta and launch intent independent even for the same address. Avoid using an email-only deduplication key to collapse distinct intentions.
- Reuse the server-side Resend delivery boundary for an intent-specific invitation; make sending idempotent, record delivery outcome, and show the verified invitation/access instructions on success even if delivery fails. Do not expose API keys in the page. Public TestFlight links can be shared; they do not identify installed users.
- Validate requests, abuse controls and error states. Record signup completion separately from invitation delivery, access-link clicks, tester membership, installation and app activation. Do not infer installations from a browser click.
- Named Apple invitations through App Store Connect are an alternative, not implemented.
- Confirm production source/routing and launch eligibility wording before promotion. Canonical legal main and marketing source are currently separate.

## Validation and release impact

Existing 27 website tests and syntax checks pass. Browser checks exercised Android and iOS success/email states, launch-only submission, source=qut-club mapping, independent intent records and desktop/narrow layout. No real invitations, group joins, app installs or live registrations performed. Physical-device, screen-reader and production delivery checks remain outside this mock.

App iOS/Android and Supabase contracts unchanged. No EAS Update/build, migration, Edge Function/secret change, or App Store metadata change. Vercel preview only; production not authorized. No implementation of future automation is claimed.
