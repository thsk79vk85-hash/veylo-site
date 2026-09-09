# Website follow-ups

## Free version polish

- `[free][qa][needs-verification]` Finish GoDaddy DNS after user signs in. Both root and www are attached to the waitlist Vercel project. Current apex A records are 76.223.105.230 and 13.248.243.5; www CNAME points to joinveylo.com. Vercel currently recommends apex A 216.198.79.1 / 64.29.17.1 (legacy 76.76.21.21 also accepted), and www CNAME f5a5067f330ba589.vercel-dns-017.com. Re-read settings before changing; preserve MX/TXT/auth and nameservers. Verify HTTPS/root/www and the existing auth subdomain, then update canonical/share/email URLs and optionally redirect www to root. Until then use https://veylo-site-preview.vercel.app/.

- `[free][qa]` Smoke-test the refreshed showcase in physical iPhone Safari and Android Chrome, including the stock portrait crops/labels, keyboard navigation/screen reader, reduced motion, all four demo panels and signup states. Browser viewport checks have passed; this is not a native-device result.
- `[free][qa][needs-verification]` Verify a controlled real signup and confirmation-email delivery before increasing recruitment traffic; the redesign preserves the existing backend and no live signup was submitted during visual QA.

## App Store readiness

- `[app-store][qa]` Keep future legal amendments on the canonical GitHub Pages `main` documents and verify the marketing/app links after publishing. Do not reinstate separate legal-text copies on the marketing branch.
