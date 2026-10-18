# Website follow-ups

## Release blockers

- `[release-blocker][qa][needs-verification]` Retention Task 1 source/mapping is
  independently accepted (controller archive app `cb26b33`). Task 2 private state
  is locally accepted after independent fix re-review at `c82de3f`, including
  multi-generation receipt catch-up. Task 3 is locally accepted after fix
  `c41df0e5f9f588b579994084a2af8275ca2fb8d9`. Task 4's local independent
  retirement/restore candidate requires controller fresh review of its exact
  commit/tree; continue Tasks 5/6 before whole-change acceptance. The combined
  migrated/HTTP/production-restore gate belongs to
  Task 6; original baseline fixture counts do not establish that coverage.
  Source: `docs/launch-retention-source-map.json`;
  external acceptance receipt: app `tasks/2026-10-18-launch-list-retention-progress.md`.
  Preserve original66 inventory and 21/20-real release gates; no local test count
  or this candidate confers deployment/cleanup authority.
- `[release-blocker][supabase][qa][needs-verification]` Launch intake/unsubscribe
  flags remain OFF. Before any separately authorized Sydney-only rollout, assign
  owner/operator/reviewer, verify exact combined source/migrations/schema/roles,
  preserve beta v1, deploy compatible website callers, control every historical
  writer and settle actual in-flight handoffs. Follow the reviewed cutover guide;
  never enforce an incompatible grant/RPC/writer boundary ahead of affected
  callers. No hosted SQL, import, disposal, email, secrets, schedules or deployment
  is authorized by this local plan; never target the native app database.
- `[release-blocker][supabase][qa][needs-verification]` Obtain independent
  production replay coverage, interval/watermark/access/retention ownership and
  conflict decisions before restore acceptance. Synthetic local restore results
  do not establish production coverage or full-disaster readiness. Pending,
  incomplete or conflicting safety facts keep launch closed.
- `[release-blocker][qa][needs-verification]` Perform separately authorized hosted
  receive/explicit-withdrawal/repeated-link/no-op-GET and provider uncertainty/log
  secrecy QA. Test physical iPhone Safari and Android Chrome/default mail clients
  for signup, 409/503, stalled body, duplicate click, retry, fragment privacy,
  contact/deep links and current/retained client navigation. Local executed
  scripts and controller read-only route evidence are not physical/delivery QA.

## Backend/Supabase follow-ups

- `[release-blocker][supabase][qa][needs-verification]` Ruling 9: Tasks 5/6 must
  bind and prove a trusted per-item caller sets a real 1..5000ms command deadline
  BEFORE dispatching raw disposal or the new receipt/marker mutations. SQL rejects
  disabled/over-limit settings but cannot
  attest when their timer was armed; an inline GUC setter is not that proof.
  Exercise actual transport/HTTP cancellation, rollback, resource release and
  sanitization outside the SQL body/connection failure. Do not change global
  role/default timeouts or old callers. Production transport is still unbound;
  keep cleanup OFF and protected adapters unavailable. No Task 5 transport code
  or Task 6 acceptance is supplied by the local Task 3 fix.
- `[release-blocker][supabase][qa][needs-verification]` Task 5 must preserve Task 4's
  partial `review`/positive-writes outcome as partial progress, never all-complete
  erasure; respect owning generation/scope advancement and consumed authority.
  Bind the independent complete CURRENT restore hook to a real stable source
  barrier/head and applied full replay state, including missing snapshot identities
  and every older live key. The shipped private hooks remain unavailable; copied
  local tables, snapshots, opaque references, booleans and TTLs cannot certify
  currency. Synthetic second-clone success is not production coverage. See
  `docs/launch-retention-runbook.md`; no general replay importer or public setter.
- `[supabase][qa][needs-verification]` Before adopting Task 2/3/4 dormant mechanics,
  complete the combined compatible finish/readiness/restore acceptance and
  independently bind real necessity, references, holds, delivery, usable-link,
  suppression and current external restore coverage. Context deliberately returns
  those facts unavailable; synthetic owning facts must never become a production
  adapter. Retention executors cannot proceed with those defaults; no retention
  issuer/setter/force flag/schedule is installed. Preserve minimum ACLs,
  owner-installed fingerprint and separate retention/import authority purposes.
  Review migrations `20261018141524_launch_list_retention_state.sql` and
  `20261018150520_launch_list_retention_disposition.sql`, plus Task 4 migration
  `20261018170026_launch_list_retention_retirement.sql`, with the later ordered
  website-only rollout; never blanket-push the app database. Keep retention-aware
  finish/readiness during rollback; do not recreate erased raw rows for old code.
- `[qa][later]` Retention Minor M2: existing local PostgreSQL fixture cleanup
  chatter remains deferred to final review; do not change the frozen helper solely
  to remove it during Task 2. Task 2 RED/failed-GREEN/repaired-GREEN diagnostics
  remain unique append-only evidence; preserve them in the controller archive.
- `[qa][needs-verification]` Task 4 final review: the default parallel full DB run
  missed the unchanged Task 3 import-race fixture's 0.5-second lock-observation
  window (242/244); that S+D-only fixture passed alone (13/13). Preserve the failed
  run and assess parallel fixture-load reliability separately; no accepted test,
  helper or production lock contract was changed to hide it. Serial full-suite
  verification passed 244/244 on the same Task 4 code; default-run timing remains
  a review concern, not a claimed default GREEN.
- `[supabase][qa][needs-verification]` Run the full owned local DB suite for later
  launch changes. Verify hosted extension/schema/role parity, actual scale/locks,
  provider late-result persistence and fresh purpose-bound approvals before live
  use. Unknown consent remains unknown/non-sendable; dry-run cannot issue
  authority or send. Preserve original migration and `disposalAllowed:false`.
- `[supabase][qa][needs-verification]` Verify actual key/template transition and
  independently owned per-field end assessments without expiring usable links or
  deleting data on review dates. Keep distinct match/token/rate keys and stable
  payload/identity on retries. A timeout does not settle a handed-off message;
  commercial-message unsubscribe availability runs at least 30 days from actual
  send, not signup or withdrawal. No purge/resubscription flow is approved.
- `[release-blocker][supabase][qa][needs-verification]` Provider/mailbox/export/
  log/backup/PITR/operator copy integrations remain unavailable and uncompleted.
  Assign actual owners/access/necessary identifiers/purpose ends and independently
  verify each completion or restriction; zero local rows is not all-copy erasure.
  Unknown runtime provenance on restored/orphan import contexts stays review;
  no PID-age or coincidentally committed local-XID inference.

## Free version polish

- `[free][qa][needs-verification]` Domain cutover completed 9 September: apex A 216.198.79.1; www CNAME f5a5067f330ba589.vercel-dns-017.com; www redirects to apex. Remaining QA: physical iOS/Android, actual signup/email receipt and native auth round-trip. Preserve auth/mail records in future domain work.

- `[free][qa]` Smoke-test the refreshed showcase in physical iPhone Safari and Android Chrome, including the stock portrait crops/labels, keyboard navigation/screen reader, reduced motion, all four demo panels and signup states. Browser viewport checks have passed; this is not a native-device result.
- `[free][qa][needs-verification]` Verify a controlled real signup and confirmation-email delivery before increasing recruitment traffic; the redesign preserves the existing backend and no live signup was submitted during visual QA.

## App Store readiness

- `[app-store][qa][needs-verification]` 17 October 2026 — Verify both hosted `support.html` contacts and `Veylo Support` mailto subject on physical iPhone Safari and Android Chrome/default mail clients, including app-to-site navigation, after the isolated contact release. The separate single support mailbox receive/human reply test is verified10m26s; ongoing under48h response/backup/urgent/deletion operations are still open. Full canonical D3/D5 publication and independent D1 facts remain open.
- `[app-store][qa]` Keep future legal amendments on the canonical GitHub Pages `main` documents and verify the marketing/app links after publishing. Do not reinstate separate legal-text copies on the marketing branch.

- `[free][qa][needs-verification]` Review codex/interactive-campus-preview on physical iPhone Safari and Android Chrome: swipe versus vertical scrolling, keyboard and screen reader, reduced motion, all four screens and sample campus/status accuracy. HTML remains illustrative rather than pixel-exact native UI.
- `[free][needs-verification]` Public marketing release promoted 11 October from codex/live-beta-signup; future production source protection remains: Keep marketing deployments separate from canonical legal main. Preserve canonical legal pages and current eligibility wording; do not overwrite main with marketing redirects.

- `[free][qa][needs-verification]` Review beta-preview.html combined showcase/signup/email flow. beta-preview.html remains a mock; beta.html now has a real server integration with additive migration applied. Hosted signup and email delivery still need verification. TestFlight public URL supplied and browser-verified; confirm Android group join policy and eligible region before live access; follow docs/beta-signup-preview.md for additive intent-aware registration and server-side email design. Preserve launch-only consent and never infer installation from a signup/click.
- `[free][qa]` Review combined beta preview motion on physical iOS/Android, including OS Reduce Motion switched during a reveal, keyboard focus, and signup/email transitions. No production promotion or live delivery authorized.

## EAS/deployment follow-ups

- `[eas-update][qa][needs-verification]` Retention Task 1 needs no EAS Update or
  native build. Keep candidate output binding external to its source map. For
  future reviewed website promotion, verify production is an ancestor of the
  exact combined tested commit and promote the tested immutable candidate;
  legal-only main must not replace marketing or re-enable automatic deployment.
  Task 5's later additive package scripts require their own scoped review while
  retaining the original frozen package input pin.

- `[qa][needs-verification]` 17 October2026 — Preserve/export the verified complete
  contact-release history bundle through82da1e8 before publication-plan workspace
  cleanup. Its independent restore and commit/tree hashes passed; see the release
  receipt for SHA256. Separately reconcile the pre-existing original shared
  repository main-worktree HEAD error without resetting another chat's checkout.
  The13missing historical trees are recovered; repeating contact deployment or
  source-only tests is not the remaining task.

- `[qa][needs-verification]` 17 October 2026 — Preserve the newly verified contact-only production source0baab74/builddpl_81afMJgSr7sdpJFTAgvSaH9SBwuL in future website releases; merge its exact contact correction into any cumulative candidate without activating unfinished D2 migration paths. Staging/promotion/public checks are complete, detailed in docs/2026-10-17-contact-release.md. Remaining work is physical mailto/app-to-site QA and broader legal/operational publication, not repeating this deploy. No EAS Update/build, Supabase migration/function/secret/admin/store change applies to the contact fix.

## Beta signup deployment follow-ups

- `[release-blocker][qa][needs-verification]` Hosted storage verified for codex/live-beta-signup; Gmail receipt verified; confirm iCloud receipt and production-email approval before enabling delivery; production website promoted; invitations remain disabled pending delivery verification. Resolve marketing production source without overwriting canonical legal main.
- `[qa][needs-verification]` Confirm Android group join policy/eligible region and physical iOS/Android beta flow.

- `[qa][needs-verification]` Phone showcase refreshed from current app source; check physical iPhone/Android layout and compare against released native screens following production promotion.

- `[qa][needs-verification]` Review screenshot-based five-tab green phone showcase on physical phones following public promotion; non-Campus screens remain illustrative.

- `[qa][needs-verification]` Public beta website email delivery remains disabled pending iCloud receipt and explicit production-email approval (Gmail receipt verified); new visitors get beta links on-screen. Production source is marketing branch; preserve canonical legal main.
