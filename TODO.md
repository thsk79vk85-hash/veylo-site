# Website follow-ups

## Free version polish

- `[free][qa][needs-verification]` Domain cutover completed 9 September: apex A 216.198.79.1; www CNAME f5a5067f330ba589.vercel-dns-017.com; www redirects to apex. Remaining QA: physical iOS/Android, actual signup/email receipt and native auth round-trip. Preserve auth/mail records in future domain work.

- `[free][qa]` Smoke-test the refreshed showcase in physical iPhone Safari and Android Chrome, including the stock portrait crops/labels, keyboard navigation/screen reader, reduced motion, all four demo panels and signup states. Browser viewport checks have passed; this is not a native-device result.
- `[free][qa][needs-verification]` Verify a controlled real signup and confirmation-email delivery before increasing recruitment traffic; the redesign preserves the existing backend and no live signup was submitted during visual QA.

## App Store readiness

- `[app-store][qa]` Keep future legal amendments on the canonical GitHub Pages `main` documents and verify the marketing/app links after publishing. Do not reinstate separate legal-text copies on the marketing branch.

- `[free][qa][needs-verification]` Review codex/interactive-campus-preview on physical iPhone Safari and Android Chrome: swipe versus vertical scrolling, keyboard and screen reader, reduced motion, all four screens and sample campus/status accuracy. HTML remains illustrative rather than pixel-exact native UI.
- `[free][needs-verification]` Resolve production source choice before promotion: current Vercel production deployment dpl_CmjrjoyBKwySp1rpGGWgH3C7YGZS targets canonical legal main (37216ec), while the approved marketing site lives on codex/launch-waitlist-polish. Preserve canonical legal pages and current eligibility wording; do not overwrite main with marketing redirects.

- `[free][qa][needs-verification]` Review beta-preview.html combined showcase/signup/email flow. beta-preview.html remains a mock; beta.html now has a real server integration with additive migration applied. Hosted signup and email delivery still need verification. TestFlight public URL supplied and browser-verified; confirm Android group join policy and eligible region before live access; follow docs/beta-signup-preview.md for additive intent-aware registration and server-side email design. Preserve launch-only consent and never infer installation from a signup/click.
- `[free][qa]` Review combined beta preview motion on physical iOS/Android, including OS Reduce Motion switched during a reveal, keyboard focus, and signup/email transitions. No production promotion or live delivery authorized.

## Beta signup deployment follow-ups

- `[release-blocker][qa][needs-verification]` Hosted storage verified for codex/live-beta-signup; verify controlled email receipt before enabling delivery; no real tester invitations or production promotion yet. Resolve marketing production source without overwriting canonical legal main.
- `[qa][needs-verification]` Confirm Android group join policy/eligible region and physical iOS/Android beta flow.

- `[qa][needs-verification]` Phone showcase refreshed from current app source; check physical iPhone/Android layout and compare against released native screens before production promotion.

- `[qa][needs-verification]` Review screenshot-based five-tab green phone showcase on physical phones before public promotion; non-Campus screens remain illustrative.
