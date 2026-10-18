# Changelog

## 2026-10-18 — Assemble the cumulative local launch-list candidate (retention Task 1)

- Branch `codex/launch-list-retention`, integration parent
  `ba7da79dba655ee09f9a87766ccb0cbeccc90d8e`; no PR/push/merge/deployment.
  Integrated only the reviewed 31-path D2 source diff from `708b176` to
  `005a888d25009aa302d808d09126b18a03ea2484`. All 35 pinned non-D2
  production paths, including signup pages/API, original migration and the live
  `support@joinveylo.com` page, remain byte-identical to production `0baab74`.
  Preserved production canonical redirects and D2 privacy headers; imported only
  `git.deploymentEnabled.main=false` from legal-only main `6ddbc5c`.
- Areas: launch signup/withdrawal libraries and routes, browser timeout handling,
  no-send importer, two undeployed website migrations, reviewed tests/helpers,
  `.env.example`, package script and cutover guide/receipt schema. Added
  `docs/launch-retention-source-map.json`, source preservation/negative-fixture
  tests and an independently frozen input fixture. Production/contact history
  remains in these records; historical D2 validation (193/193 website, 103/103
  database) belongs to that input, not this candidate's new results.
- Source map uses the integration parent and external app acceptance receipt;
  the output commit/tree is bound there after commit, avoiding self-reference.
  Immutable input pins remain independent of candidate output. Task 5's later
  reviewed additive package scripts are a scoped future exception, never blanket
  permission to regenerate pins. Controller owns app records and the unchanged
  original66 inventory and 21/20-real release gates.
- Validation: actual source-contract RED (3 pass/3 fail: missing D2 source,
  missing main guard, missing map), focused GREEN 6/6 and full `npm run check`
  203/203; standalone `npm run test:launch-db` 103/103, both with zero
  failures/skips/cancellations or warnings. Exact 66 preserved/D2 file hashes and whitespace
  checks pass. The first large diff transport was truncated; an initial GREEN
  attempt failed 5/6 and the hash audit caught a damaged new SQL file. Recovered
  exact per-file source before full suites; report retains all failed attempts.
  Docker socket preflight initially required sandbox escalation. No dependencies
  installed, hosted SQL/advisors, live requests or messages. Typecheck/lint scripts
  absent; no TypeScript/native change; expo-doctor not applicable.
- Compatibility: iOS 1.0.2/build 1.0.20, Android 1.0.2/code 4 and retained 1.0.1
  native auth/session/RPC contracts unchanged. Website Sydney backend only
  (`yohiumlrpfdhphsnnxxw`), never app project `tnwgabomdjrsadkaanjd`.
  Existing beta v1 and both platform rows remain covered. Migration definitions,
  compatible website routes, historical-writer controls and actual in-flight
  settlement must precede activation/restrictive cutover; flags remain OFF.
- Deployment impact: EAS Update safe/possible/required no; new EAS Build no.
  Future reviewed Supabase migrations yes; Edge Function deploy no; Supabase
  secret change no for this task (future website server-only provisioning needs
  separate authority); future Vercel website deploy yes, admin deploy no; App
  Store Connect metadata/privacy-label change no for this local assembly, final
  notices/metadata need later review. Manual-QA-only no. Nothing deployed.
  Suggested local commands: `npm run check` and `npm run test:launch-db`;
  no EAS command or blanket `npx supabase db push` is authorized.
- Remaining: independent controller review before Task 2, Tasks 2–6 and hosted
  source/schema/writer/provider/restore acceptance. Physical iPhone Safari and
  Android Chrome signup, withdrawal, contact, browser/deep-link and timeout QA
  remains required for current/retained clients. No physical result claimed.
  Rollback pauses launch dispatch, preserves suppression/usable links/handoff
  and consent evidence, and uses compatible forward correction; never restore
  unsafe historical writers or overwrite canonical legal main.

## 2026-10-17 — Recover and verify contact-release source history

- Recovered13missing historical trees from the confirmed public live-beta-signup
  ancestry using a non-negotiated fetch; no ancestor rewriting, checkout reset,
  push or runtime change. Published source remains0baab74/builddpl_81afMJgSr7sdpJFTAgvSaH9SBwuL.
- Complete235477-byte backup through record commit82da1e8 verified, then restored
  into an independent bare repository with matching source commit/tree and no
  missing/corrupt object. Shared repository's pre-existing unrelated main-worktree
  HEAD error remains explicitly qualified in docs/2026-10-17-contact-release.md.
- Files: release receipt, CHANGELOG.md and TODO.md only. No user-visible/backend
  behavior change; no PR. Existing44/44contact-source checks are unchanged, not
  rerun for prose. New validation: zero reachable missing objects, bundle verify,
  independent restore/connectivity/hash checks and whitespace. Physical QA open.
- EAS Update safe/required no; new EAS Build no; Supabase migration/Edge Function/
  secret, Vercel/admin deploy and App Store metadata/privacy-label change no.
  No deployment/rollback required; keep verified source backups before cleanup.

## 2026-10-17 — Publish and verify the isolated support contact

- Deployed source0baab74af58b72072ac14c95287487fde47c6c26 as production-target
  READYdpl_81afMJgSr7sdpJFTAgvSaH9SBwuL, verified candidate, then promoted the
  exact build. Actual public support now displays/links support@joinveylo.com
  twice. Signup/API/library/config/legal/artwork source remains previous
  production708b176; dormant D2 migrations/code were not included or activated.
- 44/44local tests,46actual uploaded source-path/hash comparisons, candidate and
  public9route/source/405guard/307redirect checks passed. Public browser and saved
  desktop screenshot verify contacts/subject. Pinned20minute error/fatal scan
  returned no groups; ongoing monitoring/drains/retention not certified.
- Only CHANGELOG/TODO/release receipt change in this follow-up; no redeploy is
  needed for records. Full source identity, diagnostic/guard-order error and
  recovery, cloud npm warning and manual QA are retained in the receipt. No
  secret/private file upload, signup, new email, data mutation or setting change.
- EAS Update possible/required no; new EAS Build no; migration/Edge Function/
  secret/admin/store metadata change no. Vercel website release completed only.
  iOS/Android native and backend contracts unchanged; physical mailto/app-to-site
  QA remains. No PR/push/merge; rollback inspects newer changes first and never
  overwrites unrelated signup work. Full legal/app release is still gated.

## 2026-10-17 — Isolate reviewed support contact for release

- Ported only the independently reviewed contact correction from347389f onto freshly verified production708b176, branch codex/public-support-contact. Both support.html mailto/display contacts now use support@joinveylo.com and preserve the existing subject. The runtime page and focused test blobs match the reviewed source exactly; all existing signup/API/library/config/legal/artwork files stay at production bytes. No launch-list consolidation files, migration, consent changes or new email behavior are included.
- Files: support.html, tests/support-contact.test.mjs, CHANGELOG.md, TODO.md and docs/2026-10-17-contact-release.md. The existing consolidation checkout remains unchanged. A normal no-commit cherry-pick conflicted only on accumulated CHANGELOG context; resolution keeps production history and this scoped entry, not unrelated D2 records. No private address/body/credential is copied.
- Approval: John's17October delegated instruction authorizes input-free release preparation/actions; this contact was already specifically approved. Support mailbox send/receive/human acknowledgment was independently verified17October in10m26s, not full response/backup/deletion acceptance. No new email send.
- Validation: production baseline40/40 passed. Ported-source full checks and exact-byte/source-scope checks are recorded in the receipt. No TypeScript/lint/Expo/native change; physical iPhone Safari/Android Chrome mailto/app navigation remains manual QA.
- Compatibility: all native iOS/Android and backend contracts unchanged, including previously recorded iOS1.0.2/build1.0.20, Android1.0.2/code4 and retained1.0.1. The public website contact change needs no client adoption or backend migration, and does not certify installed-client inventory.
- Deployment: EAS Update possible/required no, new EAS Build no; Supabase migration/Edge Function/secret/admin/store metadata change no; Vercel website release required. Stage exact production-target candidate without domain assignment, verify unchanged application files and corrected contacts, then promote only that tested build after a fresh production-identity check. No release claimed until the dated receipt confirms it. Rollback must preserve newer website work; no user data erased.

## 2026-09-09 — Connect Joinveylo.com to the launch waitlist

- Changed only GoDaddy apex website A record from WebsiteBuilder Site to 216.198.79.1 and www CNAME from joinveylo.com to f5a5067f330ba589.vercel-dns-017.com; TTL remains one hour. Nameservers, auth CNAME, MX and TXT records preserved. Both domains verified as correctly configured by Vercel. www redirects to https://joinveylo.com/ with 308.
- Updated homepage/support canonical URLs, Open Graph URL/image and confirmation-email destination to Joinveylo.com. Files: index.html, support.html, api/waitlist.js, lib/waitlist-confirmation.mjs, two existing tests, CHANGELOG.md and TODO.md. API shape and database operations unchanged. All released iOS/Android clients remain compatible; auth subdomain unchanged and HTTPS returns 200. This is not an end-to-end native sign-in test.
- Validation: npm run check 27/27 passed; git diff --check passed. Browser loaded the actual waitlist on HTTPS Joinveylo.com. HTTP checks: apex 200, www 308 to apex, auth 200. Initial TLS provisioning was briefly incomplete and subsequently succeeded. Physical devices, actual registration/email receipt and full native auth flows remain manual QA.
- Domain-link candidate dpl_58iFYyHWQzUFgnQWZygSmQucRr8j built and promoted after candidate byte comparison. Public homepage/support/share image return HTTPS 200 and match source; www support redirects to the same path on apex; invalid-email POST returns 400 without a signup. Deployment impact: Vercel website only; EAS Update required no/possible not applicable; new EAS Build no; Supabase migration, Edge Function deploy, secret change, admin deploy and App Store Connect metadata/privacy-label change no. Suggested app command none.
- Branch codex/launch-waitlist-polish, no PR; marketing source must not be merged over canonical legal main. App records branch codex/unified-beta-release. Rollback site by promoting dpl_Cyar3NyNSmmvSVrMoYt7xvNPHvet; DNS rollback only if necessary restores the previous website A destinations 76.223.105.230/13.248.243.5 and www CNAME joinveylo.com. Do not alter auth/mail records.

## 2026-09-09 — Polish the launch waitlist and support page

- Preserved the showcase design and working four-tab preview. Simplified hero/privacy copy, added a relatable between-classes section and launch FAQ, standardised waitlist CTAs, added planned QUT/UQ/Griffith and iPhone/Android scope, made the mobile header sticky, and added a 1200×630 branded share image. Redesigned support with support@veylo.app and both platforms. Updated confirmation-email and success-message copy to launch wording.
- Files: index.html, styles.css, support.html, waitlist.js, lib/waitlist-confirmation.mjs, lib/waitlist-service.mjs, assets/share-card.png, two existing test files, CHANGELOG.md, TODO.md. No database query, schema, auth, RLS or app client contract changes. All released iOS/Android clients unaffected; website response shape remains compatible. Email links deliberately retain the working Vercel URL until custom-domain DNS is live.
- Validation: npm run check passed 27/27; git diff --check passed; Chrome desktop/390px support and signup screenshots reviewed; 320px homepage has no horizontal overflow and preview tabs work. Empty form focuses email and displays its validation error. Candidate homepage/support match local bytes. Physical iOS/Android, assistive technology, successful registration and actual email receipt remain manual QA. No app typecheck/lint/expo-doctor applicable.
- Deployment: exact candidate dpl_Cyar3NyNSmmvSVrMoYt7xvNPHvet built and promoted to https://veylo-site-preview.vercel.app/. Vercel website deploy completed. EAS Update required no/possible not applicable; new EAS Build no; Supabase migration/Edge Function deploy/secret change no; admin deploy no; App Store Connect metadata/privacy labels no. Suggested app command: none. Rollback: vercel promote dpl_9FwJFgXJuDq9qvGuwV1wDP1xB6DC --yes.
- Domains: attached joinveylo.com and www.joinveylo.com to veylo-site-preview. GoDaddy DNS still points to the old website; both available browsers require sign-in. User sign-in requested. No registrar DNS records or nameservers changed, and existing auth.joinveylo.com project mapping preserved. Domain cutover remains incomplete.
- Branch codex/launch-waitlist-polish; PR not created because main is the canonical legal site, not the marketing deployment source. Do not merge the full marketing branch into legal main.

## 2026-09-06 — Bring the sample profiles to life

- Added four compressed, locally hosted Pexels portraits to the fictional Mia/Jordan/Sam/Lina profiles across all four previews and the Campus feature card; a small portrait stack accompanies the coffee card. `assets/portraits/README.md` records sources, photographers and license. Visible caption labels stock portraits and sample content; models are not represented as actual users.
- Changed `index.html`, `styles.css`, portrait assets and records. Adjusted sample spacing to keep all four panels above navigation on small screens; moved the floating note below profile content. No waitlist, legal, JavaScript or backend changes.
- Validation: `npm run check` 27/27 and `git diff --check` pass; all 14 image instances loaded, four tabs operated, desktop/mobile screenshots reviewed, no horizontal overflow at 320/390/768/1024/1280px. At 320px all four panel heights fit their content area. No TypeScript/lint scripts in this static package. Physical iOS/Android and screen-reader checks remain; successful live signup is still a separate pending check.
- iOS/Android: website presentation only, all installed app client versions unchanged. Backend compatibility unchanged. EAS Update possible: no app delivery needed; new EAS Build: no. Supabase migration/Edge Function/secret, admin deploy and App Store Connect metadata/privacy labels: no. Vercel website deploy required; no DNS changes. Command: `vercel deploy --prod --skip-domain --yes`, verify candidate, then `vercel promote <candidate> --yes`.
- Branch: `codex/showcase-refresh`; PR none. Published source `6c4e9b2` as `dpl_9FwJFgXJuDq9qvGuwV1wDP1xB6DC` and promoted the exact verified candidate to https://veylo-site-preview.vercel.app/. Candidate and public homepage, CSS and all four portrait assets match source bytes. Public browser confirms all 14 portrait instances loaded and the stock/sample label. Vercel website deployment completed; manual device QA remains as listed. This record-only follow-up does not require another deployment. Rollback: promote prior deployment `dpl_hN2fuGs4BUT9Lh3ifEdYRcJZ14CR`.

## 2026-09-06 — Refresh the campus showcase

- Final visual follow-up: source `8d467c4`, deployment `dpl_hN2fuGs4BUT9Lh3ifEdYRcJZ14CR`, promoted after exact candidate CSS verification. Public CSS also matches source. Hid a decorative overlapping label and moved the illustrative-preview caption below the phone stage at narrow widths; no functional change.


- Deployment completed: source `f2255242b218212396b093e652957aa6eba49092`, Vercel deployment `dpl_3cJWM41mTWYA75wRM5rzKDEk1wdU`, promoted unchanged to `https://veylo-site-preview.vercel.app/`. Candidate homepage/CSS/preview script matched source exactly and waitlist GET returned 405 without writes; public homepage/CSS/both scripts also matched exactly. Both legacy legal URLs retain HTTP 307 redirects to the canonical current documents. The public page was reopened in the browser and the refreshed structure verified. This follow-up record commit does not change the deployed implementation.

- Reworked `index.html` and `styles.css` with warm off-white, deep green, coral and soft coloured feature sections; editorial typography, a compact wordmark, responsive layouts, simpler feature copy and a prominent beta signup. Uses system fonts and CSS artwork, with no new tracking, remote fonts, native dependencies or personal screenshots.
- Added `showcase.js` for four selectable illustrative Campus/Feed/Friends/Chats panels. Sample content is explicitly labelled; sample action labels are non-interactive, and only the screen-selection controls operate. Replaced the old five-tab illustration with four tabs.
- Added accessible native privacy disclosures based on the current policy, preserving direct canonical policy/terms links and existing Vercel redirects. Copy distinguishes general presence, optional device/background location, existing stored status and service data; no promise that operators cannot access stored data.
- Preserved waitlist submission/API/email behavior. `waitlist.js` only adds invalid-field accessibility state and clears that state on input; styles retain base/focus/error outlines, visible keyboard focus, loading/disabled treatment and reserved validation-message space. Updated existing copy assertions in `tests/site.test.mjs` to match the refreshed page.
- Validation before deployment: 27/27 website tests passed; JS syntax and whitespace checks passed. Browser verified four sample panels, privacy disclosure expansion, mobile default/focused/error input and invalid-email handling without a network submission. Layouts checked at desktop 1280 and 390px mobile; no horizontal overflow at 320/390/768/1024px. Reduced-motion behavior is implemented with a media query but not physically toggled; no physical iOS/Android or screen-reader test is claimed. Successful live signup/email delivery remains untested.
- iOS/Android impact: shared mobile website presentation changes, no Expo app/runtime changes. Backend compatibility: unchanged; API/library files and legal redirect config verified unchanged. No native or OS appearance behavior is altered; standalone site retains its fixed light palette with an inverse privacy section.
- Deployment: Vercel website deploy required; EAS Update possible: no app delivery needed; new EAS Build: no; Supabase migration/Edge Function/secret change, admin deploy, App Store Connect metadata/privacy-label change: no. Suggested sequence: `vercel deploy --prod --skip-domain --yes`, verify candidate and promote that exact deployment. Deployment result is recorded in the follow-up entry/app records.
- Rollback: promote preceding tested legal-link deployment `dpl_2ZvW7XaMbK5cfB7ntS2cwN1JVeAS`. No database/client rollback needed. Source branch: `codex/showcase-refresh`. PR: none.

## 2026-09-06 — Link the showcase to the current policy and terms

- Updated `index.html` and `support.html` to link directly to the canonical GitHub Pages policy and terms. Replaced stale local legal text in `privacy.html` and `terms.html` with redirect/link fallbacks; added temporary server redirects in `vercel.json`. Documented the source in `README.md` and excluded local Vercel configuration/environment files through `.gitignore`.
- Verified that both published documents exactly match the latest GitHub `main` files, dated 18 August 2026. Main commit at verification: `7caebb6b257cbed8469dfbd9ec8a7c6071a31dcb`. No policy/terms wording changed.
- Source baseline: currently deployed website commit `f4ba6f12ad4dce9ec50a23d21c862eb9a731e5e0`, production deployment `dpl_2Q4Yjt4HJP1agzn5fZh4Enz2yiuh`. Local page/style/waitlist/API/library/package SHA-1 values match Vercel's uploaded source manifest. Existing local confirmation-email commits were already deployed but are ahead of GitHub's old marketing branch; keep them in the cumulative site source.
- User impact: policy and terms links use the maintained documents; old Vercel legal URLs forward to those documents rather than serving May copies.
- iOS and Android: no client or native changes; existing app legal URLs already use these canonical URLs. Backend compatibility: unchanged; waitlist/API/email source and database contracts preserved.
- Deployment: Vercel website deployment required. EAS Update possible: no app delivery needed; new EAS Build required: no; Supabase migration, Edge Function deploy, secret change, admin deployment and App Store Connect metadata/privacy-label change: no. Manual QA only: no, website deployment is required. Candidate command: `vercel deploy --prod --skip-domain --yes`; after redirect/page validation, promote that exact candidate. No domain/DNS change required.
- Validation: `npm run check` passes 27/27 tests; `git diff --check` passes. No typecheck/lint scripts exist in this static website package; no TypeScript or native app changes. Candidate checks confirmed both HTTP 307 destinations, exact homepage/source equality and the expected read-only waitlist GET 405 response. No signup submitted or email sent.
- Deployment completed: source `2225943ff3a116b5878519d7d30a8c0a69d29870`, candidate `dpl_2ZvW7XaMbK5cfB7ntS2cwN1JVeAS`, promoted unchanged to `https://veylo-site-preview.vercel.app/`. Public checks confirmed both HTTP 307 redirects, exact final policy/terms equality with GitHub Pages, and homepage/support source equality. Browser navigation opened both documents and showed 18 August 2026. No remaining manual QA required for the link correction; broader mobile/waitlist delivery audits were not performed. This follow-up record commit does not change the deployed website implementation.
- Rollback: restore the previous Vercel deployment if unrelated website behavior regresses; that also restores the stale legal copies, so reapply the link correction promptly. PR: none created for this change.

## 2026-10-11 — Make app previews discoverable

- Added visible Campus/Feed/Friends/Chats selectors, previous/next buttons, a swipe cue, a live screen count, keyboard arrows and horizontal swipe/trackpad navigation. Both sets of selectors stay synchronized; reduced motion disables transition animation.
- Refreshed sample campuses and six status labels, retained stock portraits, moved the floating caption away from app navigation, and replaced old feed category controls with the current collapsed composer/search presentation. This is illustrative HTML aligned with local app source, not a pixel-exact native screenshot.
- Files: index.html, styles.css, showcase.js, CHANGELOG.md, TODO.md. Branch: codex/interactive-campus-preview. Existing marketing source: codex/launch-waitlist-polish. Main remains the separate canonical legal site; do not merge marketing redirects over main.
- Validation: 27 existing tests passed; JavaScript syntax and git diff checks passed. Browser tabs, arrows, keyboard and all panels checked at 320px and desktop; 390px Campus visually checked. Physical swipe, reduced-motion runtime, screen reader and signup/email delivery remain manual QA. No live signup submitted.
- Deployment: Vercel preview only. EAS Update no; new EAS Build no; Supabase migration, Edge Function deploy and secret changes no; App Store metadata/privacy labels no. iOS/Android app contracts unchanged. Production currently targets main legal commit 37216ec; resolving that routing is a separate release decision. Rollback: revert these frontend changes.

## 2026-10-11 — Combine beta signup with interactive showcase

- Added beta-preview.html, beta-preview.css and beta-preview.js as an isolated combined review page; preserved the original index and API. Adds iPhone/Android choices, local success/email states, separate launch-only form and proposed source/platform/intent tracking. No form sends a request or persists an address; no-JS forms remain disabled. Preview analytics omitted.
- Android instructions use the verified group/testing/store links, require the same Google account, allow for group approval and acknowledge regional eligibility. iPhone uses an explicit pending TestFlight-link placeholder. No real email integration, automatic membership or install attribution claimed.
- Files: beta-preview.html/css/js, docs/beta-signup-preview.md, CHANGELOG.md, TODO.md. Branch codex/beta-signup-preview. Existing .gitignore Vercel change preserved separately.
- Validation: 27 existing tests, JS syntax and diff checks passed; browser exercised Android/iPhone success and email states, independent launch intent, qut-club source, desktop and narrow layout. Physical devices/screen reader and actual delivery not tested. Preview-only deployment; no production release/invitations.
- iOS/Android app and backend contracts unchanged. EAS Update no; new EAS Build no; Supabase migration no; Edge Function deploy no; secret change no; Vercel preview yes / production no; App Store metadata/privacy-label change no. Rollback: remove the isolated preview files; existing waitlist is unchanged.

- Beta preview follow-up: user supplied https://testflight.apple.com/join/pFa6262T; browser verified Veylo Social invitation and View in TestFlight action. Replaced iPhone placeholder in success/email previews with the real link; correctly label TestFlight clicks as ios, still not installations. No real signup, invitation, acceptance or install performed.

- Android copy follow-up: added the user-requested feedback and at-least-14-days opt-in request to both shared success/email instructions. This is an invitation request, not a claim that a signup satisfies Play testing requirements. No invitations sent.

## 2026-10-11 — Add motion to combined beta preview

- Added one-shot scroll reveals, short success/email transitions, animated platform/button states, subtle card depth and success checkmarks. Preserves readable content without JavaScript; reduced-motion disables transitions and cancels active reveal animations if the preference changes. No autoplay, looping motion, signup or email behavior changes.
- Files: beta-preview.css/js, CHANGELOG.md, TODO.md. Branch codex/beta-signup-preview. Validation: 27 existing tests, JavaScript syntax and diff checks passed; browser demo submission/success checked. Physical devices and OS reduced-motion runtime remain manual QA.
- Deployment: Vercel preview only; no production. iOS/Android native app and backend contracts unchanged. No EAS Update/build, Supabase migration/function/secret or App Store metadata changes. Rollback: revert motion-only CSS/JS additions.

## 2026-10-11 — Intent-aware beta signup setup

- Website branch: codex/live-beta-signup. Added beta.html, signup.js, signup-motion.js, api/signup.js, lib/signup.mjs, signup tests and migration 20261011050938_add_signup_intents.sql. Separate beta/launch consent, platform/source tracking, transactional duplicate protection, hashed-IP rate limits and Resend idempotency. Existing launch waitlist remains compatible.
- Migration applied and table/RPC existence verified in Veylo Waitlist project yohiumlrpfdhphsnnxxw. RLS enabled; only service_role can access new tables/RPCs. Main app backend and all released iOS/Android clients unaffected.
- Deployment order: additive migration (done), branch-scoped preview configuration, preview verification, controlled email receipt, then separately approved production source selection/promotion. Email defaults disabled; production unchanged.
- Validation: 40 Node tests passed; syntax and diff checks passed. Hosted signup/email receipt and physical iOS/Android QA still need verification. No app typecheck/lint/expo-doctor applicable.
- EAS Update safe/required: not applicable/no. New EAS Build: no. Supabase migration: yes, applied. Edge Function deploy/secret change: no. Vercel website deploy/env configuration: required; admin deploy: no. App Store Connect metadata/privacy-label change: no. Suggested app command: none. Rollback disables SIGNUPS_ENABLED; preserve collected records. No PR into canonical legal main.

- Follow-up verification: branch-scoped SIGNUPS_ENABLED=true, SIGNUP_EMAIL_MODE=disabled and sensitive SIGNUP_RATE_SECRET configured. Private preview dpl_ABWVNR7HkfThtKxfyTL8pTVLvqjr READY. Hosted iOS, Android and launch requests saved; database confirmed exactly one record per intent/platform after duplicate submission, all email-disabled. Synthetic example.invalid records removed. Existing Vercel credentials work at runtime despite empty downloaded values. Controlled actual email receipt still pending user-provided test recipient. Production unchanged.

## 2026-10-11 — Refresh phone showcase UI

- Fixed stale illustrative phone screens in index.html, beta.html and beta-preview.html; styles.css now reflects current app light-mode headers, status rows, Feed and Chats list. Preserved explicit carousel controls and different-campus/status examples. These are sample HTML screens, not native screenshots.
- Branch codex/live-beta-signup. Validation: 40 Node tests pass; git diff --check passes; all four screens checked in browser at narrow width. Physical iOS/Android checks and exact native visual parity still manual.
- CHANGELOG/TODO updated. Website-only: EAS Update required no/possible not applicable; new EAS Build no; migration, Edge Function deploy, Supabase secret, App Store metadata changes no. Vercel preview deploy required; production unchanged. Released iOS/Android clients and backend contracts unaffected. Suggested app command none. No PR.

- Phone UI preview deployed READY as dpl_6cc5uvMvZXY9Kco5W45dao3DBHuC. Hosted beta.html contains exact local HTML followed by Vercel-injected content; narrow browser screenshot confirms full status card above navigation. Public site not promoted.

## 2026-10-11 — Match supplied phone screenshot with green palette
- Website branch codex/live-beta-signup: updated index.html, beta.html, beta-preview.html, styles.css and showcase.js. Taller phone proportions, larger rounded cards, bell/settings icons and five icon-only navigation tabs; sample Profile panel uses known app sections. Green palette retained as requested; illustrative sample profiles retained. Cache-versioned preview assets.
- Validation: 40 website tests and diff checks passed; narrow browser layout inspected, fifth-tab navigation verified. Physical devices and native parity of non-Campus screens remain manual QA. CHANGELOG.md and TODO.md updated in website/app records. No PR.
- Website preview deployment only. EAS Update required no/possible N/A; new EAS Build no; Supabase migration/Edge Function/secret change no; App Store metadata change no. iOS/Android app and backend contracts unchanged. Production not promoted. Suggested app command none.

## 2026-10-11 — Public beta website release preparation
- User approved public release. Branch codex/live-beta-signup: index.html now uses approved beta homepage, signup.js handles saved-with-email-disabled honestly, production signup saving enabled with email mode disabled. Added canonical delete-account redirect, retained canonical privacy/terms and 18+ Australia eligibility. Updated homepage tests; 40 checks pass and diff check passes.
- Vercel production candidate will be staged then promoted after validation; previous production dpl_CmjrjoyBKwySp1rpGGWgH3C7YGZS is rollback target. Automatic approval review blocked enabling invitation emails pending approved recipient/delivery check; no emails sent.
- Files: index.html, signup.js, vercel.json, tests/site.test.mjs, CHANGELOG.md, TODO.md. Website-only; iOS/Android released clients and main app backend unaffected. EAS Update required no/possible N/A; new build no; migration/Edge Function/Supabase secret change no; Vercel website deploy/env configuration yes; App Store metadata change no. Physical phone and actual email receipt QA remain. No PR into legal main.

- Public release completed: production dpl_3N9omRxSysJ52pAKZZP7Hafa22Mk (commit 619f037) promoted to Joinveylo.com. Live homepage byte-prefix matches source; five-screen navigation verified in browser. Support/privacy/terms/delete-account return 200 (legal routes redirect to canonical Pages). Signup invalid-input check returns expected validation with production configuration. No error logs returned by 10-minute scan; this does not establish delivery monitoring. Invitation email mode remains disabled pending approved recipient and receipt check.

## 2026-10-11 — Approved invitation delivery check
- Branch codex/live-beta-signup; no application code changes. Protected preview dpl_HvonGbsyfrUo3gP2uSMZhkHk8Yys sent one iOS and one Android invitation to the two owner-approved addresses. Both provider-accepted; database shows one record for each platform. Duplicate Android submission returned the existing sent record.
- Android invitation independently verified in connected Gmail INBOX (not spam), with correct group/testing/store links and SPF/DKIM/DMARC passing. iCloud inbox receipt remains unconfirmed; do not label both delivered.
- Production email activation rejected by automatic review: requires iCloud receipt confirmation and explicit approval for future signup emails. Public website remains live with signup saving enabled and emails disabled. Pending user question combines those confirmations.
- Files changed: CHANGELOG.md and TODO.md only (website and app records). No PR. EAS Update required no/possible N/A, new EAS Build no, Supabase migration/Edge Function/secret change no, App Store metadata change no. Vercel protected preview/config changed; production activation not completed. Existing iOS/Android clients/backend compatible. Validation: real provider responses, database duplicate query, received Gmail MIME/headers. No code tests rerun because code unchanged. Manual QA: iCloud receipt and physical-device install remain. Suggested app command none.
