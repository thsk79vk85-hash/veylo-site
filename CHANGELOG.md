# Changelog

## 2026-10-19 — Isolate restore-coverage HTTP refusals (Task6 fix1, T6-I1)

- Moves the six invalid-coverage cases after actual unknown-handoff settlement
  and replay. Each first verifies valid-proof delivery/cutover/fence readiness,
  current scope and applied digest, then changes one proof field. The actual
  OTHER-source barrier stays held through each HTTP refusal except the deliberate
  missing-barrier case. Full control/authority/replay/raw-state snapshots and
  unchanged scope prove refusal is non-consuming. The separate complete-proof
  unknown-handoff refusal and one valid activation remain.
- Focused real-HTTP RED: six prerequisite failures plus parent (6/13 pass),
  demonstrating the old arrangement's independent delivery blocker. Corrected
  restore group GREEN:13/13, no failures/skips/cancellations. Unique raw captures
  preserved. No SQL, private client, helper, old race, package, pin or baseline
  change; no product defect demonstrated. No full website/DB/app-root rerun for
  this test-only correction; previous29 HTTP/260 DB/9 focused and488/491 full
  results remain historical, not a new all-tests pass.
- New fix candidate awaits fresh scoped/compound review. M1/M2 and deferred
  T6-N1 cleanup-failure handling/T6-N2 disclosure precision remain for broad
  final review. Website CHANGELOG/TODO updated; main owns app records/index.
- User-visible/native/backend/deployment impact:none. EAS Update possible/
  required no/no; new EAS Build no; Supabase migration/Edge Function/secret no;
  Vercel/admin/site/store/publication no; suggested command none; no PR. All16
  real manual rows stay NOT RUN, all schedules/cleanup/sending OFF. Existing
  iOS/Android/retained-client and real-binding gates remain; no rollback needed
  beyond reverting these test assertions/records.

## 2026-10-19 — Owned full-migration HTTP retention integration (Task6)

- Adds only test-owned `tests/helpers/launch-dataapi.mjs` and
  `tests/launch-list-retention-dataapi.test.mjs`, exact frozen third package
  command/phase and necessary source/state/package phase assertions. Original
  211-byte D2 input, independent pins/package contract, all seven accepted SQL
  files, original commands/dependencies and every original map input stay exact.
  No product SQL/JS defect was demonstrated or changed; no forward migration.
- Real PostgREST14.13/PostgreSQL17.6.1.134 use installed pinned digests, owned
  internal network, random synthetic auth and explicit original RLS/ACL grants.
  Ruling13's ephemeral loopback TCP byte tunnel uses tracked Docker exec/netcat;
  no HTTP stand-in, rewriting, dependency, image pull or exposed DB port. Awaited
  cleanup closes tracked sockets/children and removes/verifies exact resources.
- Actual HTTP covers ordinary denials, service D/R/marker success, exact bigint
  strings, null/malformed/stale/replay refusal, repeated withdrawal after raw
  removal, compact old Boolean finish/terminal conflicts/retired fact false,
  positive-write partial review, null age and independent coverage/copy
  uncertainty for unenrolled raw work and after final local marker retirement.
  Full-set nonempty old import/mode and independent OTHER-source complete current
  restore include absent snapshot identities/live older keys/necessary handoffs,
  applied manifest and stable source fence through activation. Import receipt
  `disposalAllowed:false` remains unchanged; synthetic replay is not production.
- The test-only private HTTP supplier sets its actual pool's libpq startup
  statement deadline before dispatch. Slow proof and reached-write cancellation
  roll back state/authority and release locks. Raw malformed/outside-body/
  cancellation/connection-loss responses remain visible as22P02/P0001/57014/
  PGRST001; private client/RunReceipt sanitization is separately exercised. No
  production transport or real fact/field/restore/copy/provider binding is added.
- Validation: meaningful actual-HTTP supplier RED then GREEN; source/package9/9;
  focused HTTP26/26 plus distinct empty/retirement3/3. First required full check
  was462/467: two owned fixture restart-readiness failures and three unchanged
  race-suite failures (deadline observation/import-result/parent). The owned
  readiness gap was corrected without changing SQL, old races or frozen helpers.
  Corrected final-runtime full check was488/491, with all29 HTTP tests passing:
  unchanged withdrawal lock observation, import refused-vs-reconciled and their
  parent failed. Default full DB suite passed260/260. Neither the later DB pass
  nor focused HTTP passes resolve those full-run failures or historical M1/M2.
  No cause is proved; deterministic handshake/full-load review remains required.
  Every attempt remains in unique actual stdout/stderr/status captures.
  Typecheck/lint/expo-doctor N/A: website test JS/docs only, no app/native code.
- User-visible/hosted impact: none. New Task6 source awaits independent scoped
  and compound factual/broad review. App facts are a separate three-file candidate
  that only the controller stages/commits;66 inventory/21 open/20 final gates,
  B3 RED and dependent photo deletion/expiry OFF remain unchanged. No PR created.
- iOS1.0.2/build1.0.20, Android1.0.2/code4 and retained1.0.1 native/backend
  contracts unchanged; both platforms' actual browser/contact/deep-link QA and
  all16 real operator/provider/copy/restore/scale/stop rows remain NOT RUN.
- Deployment now: EAS Update possible/required no/no; new EAS Build no; Supabase
  migration no new change/no push; Edge Function deploy no; secret change no;
  Vercel/admin/site no; store/privacy metadata no; publication/push/merge none.
  Suggested command none; manual-QA-only no, because real integration/operations
  and review remain. Future adoption requires exact cumulative source, selective
  ordered compatible Sydney migrations/website consumers, actual owning bindings
  and separate operational authority. No blanket app db push; rollback keeps
  suppression/unknown/restore fences and never reconstructs erased raw data.

## 2026-10-19 — Correct Task5 age, empty-inventory uncertainty and CLI errors (Fix 1)

- Addresses review I1/I2/I3 only. Eligibility age now remains explicitly UNKNOWN/
  null throughout SQL inventory, client, processor and receipt schema; numeric
  substitutes are rejected. No clock is inferred from decision/withdrawal/review/
  completion, no completed-only population is substituted, and bounded pages
  cannot prove the oldest eligible age. The initial candidate's qualified
  decision-age metric below is superseded, not accepted as equivalent.
- Coverage and copy uncertainty survive independently of ledger selection,
  including unenrolled withdrawn/unknown raw rows and an empty ledger after
  accepted R retires its final local marker. Configured zero-work runs remain
  unavailable; local or rate-only progress remains partial. Independently proven
  local work still progresses. No phantom marker, issuer, copy-case or timing
  framework was added. Real clock/population/coverage/copy bindings remain gates.
- Invalid CLI arguments now emit one fixed stderr diagnostic, exit nonzero and
  leave stdout empty. Every valid/default stdout path is checked against both
  actual RunReceipt validation and published schema1; no echoed argument/env/
  private value, live switch or bad-argument dispatch.
- Areas: private client/processor/CLI; own unaccepted processing P migration;
  receipt schema; three unit/CLI files and owned SQL tests; website runbook/records.
  Six older migrations, frozen helpers/race, original pins/package contract,
  source-map inputs and package commands remain byte-exact to initial9a3a696.
  P SHA256: `56debc36bb66f24626d5971a1e7a7fb5c0018efe37127b0cb4d20ff7b3455301`.
  Schema SHA256: `3044a2d07b865b6aca4765750f6442c8992e38a1474f298e7135ef61264ae2db`.
- TDD: new defect unit RED0/8 and owned SQL RED11/16; covering GREEN34/34
  (client/process/CLI/schema/source/package) plus16/16 SQL. Three owned W+I+L+C+
  S+D+R+P fixtures cover unchanged timer/rollback behavior, both distinct empty
  cases and rate-only progress. Final-marker proof is owner-only synthetic LOCAL
  purpose evidence invoking accepted R, not off-database or production completion.
  Each attempt has a unique actual raw capture; original report bytes preserved.
  Full check/DB suites were not rerun: historical253,448/450,255/257 stay historical.
  Typecheck/lint/expo-doctor N/A for this website-only JS/SQL correction.
  Deferred M1/M2 are untouched; fresh scoped controller re-review remains next.
- User-visible/hosted backend impact: none while dormant. iOS1.0.2/build1.0.20,
  Android1.0.2/code4 and retained1.0.1 native/backend contracts unchanged. Both
  platforms' physical browser/contact/deep-link QA and all66/21/20 real gates
  remain NOT RUN/uncompleted. No human waiver/default-GREEN/release acceptance.
- Deployment: EAS Update possible/required no/no; new EAS Build no; future
  selective website Supabase P migration yes, none applied hosted. Edge Function
  deploy no; secret change no; Vercel/website/admin deploy no now; App Store
  metadata/privacy-label change no; manual-QA-only no. Suggested deployment
  command none. Future adoption requires exact cumulative source and compatible
  ordered website migration/consumer integration before enforcement, followed by
  real owning bindings and separate operational acceptance. Rollback keeps
  suppression/unknown/restore fences; no erased raw reconstruction.

## 2026-10-19 — Independent launch receipt/marker ends and restore coverage (Task 4)

- Local candidate on `codex/launch-list-retention`, based on accepted Task 3
  `c41df0e5f9f588b579994084a2af8275ca2fb8d9`; no PR, push or deployment. Areas:
  new CLI-generated `20261018170026_launch_list_retention_retirement.sql`, two
  PostgreSQL test files, the narrow nonraw-consent policy regression, and the new
  retirement/restore/copy runbook. Original/accepted migration bytes, source
  pins, package/config and shared fixture remain unchanged.
- Service-only receipt/marker operations use protected per-field purpose proofs
  with unavailable defaults. Provider/claim/terminal-time/provenance/expanded
  authority facts end independently; erasure is one way with no new comparison
  digests. Still-needed callbacks keep exact behavior; callbacks needing truly
  retired comparisons return false without resend/reinflation. Raw unknown
  consent stays review; nonraw consent stays unknown without blocking separately
  proven ends. Partial `review` plus positive writes is explicit, advances the
  owning generation and cannot replay/recount as complete erasure.
- Current intake retains suppression with zero legacy rows; independently ended
  old links can retire separately. Usable/unknown-last-send/under-30-day links
  and all older live key representations remain. Expanded authority/completion
  and minimal consumed-operation cohorts have separate ends; old epoch markers
  require actual monotonic invalidation. Import contexts require actual runtime/
  backend provenance, authoritative transaction non-liveness and locks, never
  PID age or restored absence. Matching facts and optional decision metadata can
  end while minimal replay facts remain; complete proven closure does not create
  an endless self-referential completion archive.
- Existing restore consumer now checks a private, read-only, default-unavailable
  independently CURRENT complete coverage hook before readiness/reopen/approval
  consumption. Exact namespace/source/schema/fingerprint/approval, external head/
  watermarks, every live key and the full actually applied replay digest are
  bound. Missing snapshot identities matter. Unknown handoffs still block reopen;
  legitimate coverage plus readiness rebases exact receipts to the new target
  epoch without inventing settlement. Private mode owner execution is limited to
  that purpose-checked rebase; public tuple/shape and non-restore caller gates
  remain compatible, with no direct ledger-write grant.
- User-visible impact: none while dormant. No real fact/field/restore/transport/
  copy adapter, issuer, setter, schedule or activation. Synthetic source barriers
  and local replay transport are not independently current production evidence.
  Copy adapters remain unavailable and uncompleted, not successful no-ops.
- Migration SHA256:
  `3ceebf9f8f08961c4f96c9086fdbf0a27805032910efbc11c5502dec42c5ebd9`.
  Validation: formal missing-behavior RED, focused 156/156 and remaining website
  tests 174/174. Required default parallel DB run was 242/244: an unchanged S+D-only
  import-race lock-observation assertion failed under load; its standalone run
  passed 13/13 and the complete serial DB rerun passed 244/244. No frozen
  fixture/helper was edited. All failed/final outputs stay
  in unique append-only scratch logs; original 256-line NEEDS_CONTEXT report is
  preserved and implementation results appended. Controller fresh review pending.
- Compatibility: website Sydney project only. iOS 1.0.2/build 1.0.20, Android
  1.0.2/code 4 and retained 1.0.1 native/backend contracts unchanged. Both
  platforms' physical browser/contact/deep-link QA remains open. No physical,
  hosted, HTTP/DataAPI, provider, operator or production restore acceptance is
  claimed by local fixtures.
- Deployment: EAS Update possible/required no/no; new EAS Build no. Future ordered
  website Supabase migration yes; none applied hosted. Edge Function deploy and
  secret change no; Vercel website deployment only for later compatible adoption,
  no admin deployment now; App Store metadata/privacy-label change no;
  manual-QA-only no. Suggested current command: `npm run test:launch-db`; no EAS,
  blanket app `db push` or production command. Keep cleanup/sending OFF until
  real adapter, transport and operational acceptance. Rollback keeps suppression,
  unknown and restore fences and compatible finish/readiness; never replay erased
  raw facts or pretend SQL rollback reverses disposal.

## 2026-10-19 — Repair old pending handoffs and require a real caller deadline (Task 3 fix 1)

- Review T3-I1/T3-I2 reproduced against `fbbead5`: real old public APIs wrote
  `pending:true` before D and exact late results then refused; unbounded callers
  could dispose, and command cancellation escaped as raw SQL errors. The previous
  function-local `statement_timeout` setting did not arm the current command's
  deadline. This entry supersedes that claim in the initial Task 3 history below.
- Scoped changes: undeployed disposition migration, its two PostgreSQL tests and
  website CHANGELOG/TODO. Task 2/original migrations, input pins, shared fixture,
  package/config, old public signatures, app records and global defaults unchanged.
  New disposition migration SHA256:
  `f12923d5063745285b17f2a4f3597b5a8eb202c5bb08e74c63aed27f7a33ce99`.
- Exact timed/pinned historical pending may correct only its erroneous settled
  bit under the existing outer/owning locks before accepting its late result.
  The fenced writer guard adds only that exact transition; true terminal records
  are not rewritten. Withdrawn historical pending compacts as unresolved, never
  a fabricated settlement; missing evidence remains review. No resend authority.
- Disposal now refuses disabled or over-5000ms caller statement-timeout settings
  before taking the fence. The ineffective function setting is removed; actual
  in-body `query_canceled` rolls writes/locks back and returns the fixed count-only
  refusal. SQL checks the configured bound, not when a timer was armed. Tasks 5/6
  must bind a trusted transport that establishes 1..5000ms BEFORE SQL dispatch,
  never by an inline setter, and sanitizes cancellation outside the function or
  connection failures. No such production transport is shipped or assumed here.
- Validation: focused assertion RED 30 pass / 13 fail / 43 total (including
  parents/cascaded readiness failures); deadline/race GREEN 13/13; old-pending
  GREEN 31/31; final two-file GREEN 44/44, zero failures/skips/cancellations.
  Final actual 5.5-second proof was cancelled after 5123ms; advisory and owning
  row locks were available while its caller transaction remained open. A second
  real deadline after compact insertion proves complete rollback. Ruling 8/M3
  now checks cleanup's actual Lock state after BOTH beta claim and finish, plus
  its eventual refused/unavailable/zero-write result and retained raw row.
  Exact old-API pending is created on W+I+L+C+S before applying D. Initial 152/173
  evidence remains historical; no original-103/full/HTTP/restore suite rerun or
  inflated new-schema claim. Seven prior rollback boundaries, NO ACTION order,
  active/both-beta preservation and multi-generation compact API regression pass.
  Whitespace checks pass; no TS/typecheck/lint scripts or Expo/native work.
  Existing fixture chatter and CLI notice remain deferred. Original 341-line
  report bytes are preserved and fix evidence is appended to the same report.
- Compatibility/deployment: Sydney website only. iOS 1.0.2/build 1.0.20,
  Android 1.0.2/code 4 and retained 1.0.1 native contracts unchanged; physical
  browser/contact/deep-link QA on both platforms remains open. No deployment,
  sending, live cleanup, PR or push. EAS Update possible/required no/no; new EAS
  Build required no (website SQL/tests/records only). Future ordered website
  Supabase migration yes; Edge Function/secret change no; future website/Vercel
  adoption yes after compatible transport/consumer acceptance, admin deploy no;
  App Store metadata/privacy-label change no; manual-QA-only no. Suggested current
  command: `node --test tests/launch-list-retention-disposition-postgres.test.mjs tests/launch-list-retention-races-postgres.test.mjs`.
- Remaining: independent fix re-review, Tasks 4–6, actual pre-command production
  transport/HTTP/restore and protected operational/physical acceptance. Rollback
  keeps suppression, unresolved handoffs, compatible finish/readiness and restore
  fences; never reconstitute erased raw rows or reintroduce the false deadline.

## 2026-10-19 — Atomic launch raw minimization and exact late finishes (Task 3)

- Branch `codex/launch-list-retention`, based on independently re-reviewed Task 2
  `c82de3ffea196f5dcccfc78643f789359d1a75e9`. Local implementation only; no PR,
  push, deployment, sending or live cleanup. Areas: one new website migration,
  two real PostgreSQL test files, and website CHANGELOG/TODO. Original migrations,
  accepted Task 2 bytes and all input pins are unchanged.
- CLI-generated `20261018150520_launch_list_retention_disposition.sql`, SHA256
  `90d933a14912a13bd5f70c86eb262a04c629a8220ec719f995ff6b120819cb0f`.
  Adds service-only atomic raw disposal with exact authority, scope, generation,
  epoch and protected-fact checks. External integrations remain unavailable;
  there is no issuer, setter, force flag, schedule or production activation.
  Canonical writer control is required. Suppression and usable links survive;
  complete covered raw launch/legacy rows are removed in NO ACTION order while
  necessary exact handoff facts and disposition provenance remain private.
- Existing public signatures/shapes remain compatible. Raw and compact pending
  finishes remain unresolved. Exact late definitive finishes can catch up across
  multiple committed owning generations/epochs without reconstructing raw rows
  or permitting resend. Conflicting/stale tokens and terminal regressions refuse.
  Cancelled/disabled unsent leases do not invent provider settlement. Lifecycle
  equality binds disposed source identities/versions, refuses missing active
  mappings and drift, and extends owner-installed definition/ACL coverage.
- User-visible impact: none while dormant. Synthetic migrated tests preserve all
  active launch and both beta platform fields, repeat withdrawal after deletion,
  and prove same-address beta claim AND finish while cleanup waits. Seven reached
  failure boundaries roll back the complete transaction. No fake/nullable email.
- Validation: actual assertion RED for missing disposition/pending settlement,
  source-version drift, missing handoff evidence, malformed context and raw/guard
  terminal contradiction; final Task 3 GREEN 34/34. Required
  `npm run test:launch-db` ran once on final code: 152/152, comprising 103
  original baseline tests, 15 Task 2 state tests and 34
  Task 3 migrated tests. Remaining website test files: 173/173. No final failures,
  skips or cancellations. Baseline fixtures do not install retention migrations;
  the exact fixture migration sets and positive migrated old-caller coverage are
  in the Task 3 scratch report. Combined migrated/HTTP/restore acceptance is Task 6.
  An earlier 151/151 full run predates the final contradiction assertion/fix;
  the new safety change justified the final follow-up run. No redundant
  `npm run check` (alias for the same tests) or npm reporter forwarding.
  Typecheck/lint scripts absent; no TS/native change;
  expo-doctor N/A. Existing fixture cleanup chatter and CLI upgrade notice remain
  deferred for final review. No upgrade performed. Whitespace check passed.
- Compatibility: Sydney website database only; native iOS 1.0.2/build 1.0.20,
  Android 1.0.2/code 4 and retained 1.0.1 contracts are unchanged. Both platforms'
  browser/contact/deep-link physical QA remains open. Deploy compatible finish,
  readiness and restore consumers before any separately authorized disposal;
  bind actual external necessity/reference/hold/restore evidence first.
- Deployment: EAS Update possible/required no/no; new EAS Build required no.
  Future ordered website Supabase migration yes; Edge Function/secret changes no;
  future website/Vercel deployment yes for adoption, admin deploy no; App Store
  metadata/privacy-label change no; manual-QA-only no. Nothing deployed. Suggested
  current command: `npm run test:launch-db`; no EAS or blanket app `db push`.
- Remaining: controller independent Task 3 review, Tasks 4–6, protected adapters,
  actual hosted/provider/restore/operator evidence and physical QA. Rollback must
  first disable cleanup/claims and retain compatible compact finish/readiness,
  suppression and unknown/restore fences. Never restore erased raw facts merely
  to run an older deployment. Database rollback is not recovery of disposed data.

## 2026-10-19 — Repair delayed receipt generation catch-up (Task 2 fix 1)

- Review finding T2-I1 reproduced against local base
  `8018218c8857102aa57654cf8d8f80719f7342ec`: multiple committed item advances
  could strand independent delivery receipts behind mutually exclusive generation
  guards. The undeployed Task 2 migration now keeps item revisions unit-step while
  allowing nondecreasing receipt catch-up and exact-current retries; every receipt
  still requires its owning item's exact current generation/epoch. Exact handoff
  identity, terminal outcomes, fields, minimum ACLs and unavailable external facts
  remain guarded. No cleanup executor or authority is added.
- Changed areas: Task 2 migration, its real PostgreSQL test and website records.
  Migration SHA256 after the fix:
  `4cd3a7593d17034d67e9c106ed088459e270c26b4c496b6ea2414aaf9db87b5c`.
  Earlier Task 2 hashes/results below describe the prior local commit, not this fix.
  All original migrations and source pins remain unchanged. No PR/push/deployment.
- Validation: actual multi-generation/two-outstanding-handoff SQL assertion RED
  (13 pass, 2 fail including parent; 15 total), then covering SQL GREEN 15/15 with
  zero failures/skips/cancellations. Tests commit two item decisions before late
  results and cover stale/backward/future/current generations, exact-current
  retry, separate sent/failed results, identity and terminal conflicts. Existing
  positive import/mode compatibility now also proves a consumed restore-purpose
  canonical reopen, epoch increment and unchanged iOS/Android beta data on the
  new migration set. Synthetic restore references are not real replay coverage.
- Only `node --test --test-reporter=tap tests/launch-list-retention-state-postgres.test.mjs`
  reran, using the existing owned offline fixture. Policy unchanged; no policy,
  full website or 103-test SQL rerun for this scoped predicate change. Both affected
  table paths, ACL/fingerprint behavior and old import/mode/restore are covered in
  that migrated fixture. Previous full-suite counts remain historical. Whitespace
  check passed; typecheck/lint scripts absent, no TS/native change, expo-doctor N/A.
  Existing fixture cleanup chatter is retained; no npm/CLI invocation was needed.
- Compatibility: website Sydney-only dormant state, not the app database.
  iOS 1.0.2/build 1.0.20, Android 1.0.2/code 4 and retained 1.0.1 native contracts
  unchanged; physical browser/contact/deep-link QA for both platforms still open.
  Backend public signatures and old import receipt contract remain compatible.
- Deployment: EAS Update possible/required no/no; new EAS Build required no.
  Future ordered website Supabase migration yes; none applied to a hosted target.
  Edge Function/secret/admin/App Store metadata/privacy-label changes no;
  future Vercel website deployment yes for adoption, none now; manual-QA-only no.
  Suggested current command is the covering Node command above; no EAS or blanket
  `npx supabase db push` command is authorized. Compatible finish/readiness/restore
  clients, independent operational evidence and review must precede disposition.
- Remaining: controller re-review; Task 6 combined migration/HTTP/restore gate and
  hosted/physical acceptance remain open. Prior report and logs are preserved;
  fix evidence is appended to the same Task 2 report. Rollback keeps cleanup off
  and preserves suppression, usable links, unknown handoffs and restore fences;
  do not resurrect disposed raw data or restore the receipt-stranding predicate.

## 2026-10-19 — Add dormant private retention policy and generations (Task 2)

- Branch `codex/launch-list-retention`, starting commit
  `8c589f6e6c771b613151b127656f70ed254bb199`; local implementation only, no PR.
  Task 1's cumulative source/mapping is independently accepted; controller
  archive is app commit `cb26b33`. No controller/app records or input pins changed.
- Areas: `lib/launch-retention-policy.mjs`, its policy tests and test-only
  synthetic facts helper, real PostgreSQL retention-state tests, and CLI-generated
  `supabase/migrations/20261018141524_launch_list_retention_state.sql`.
  Migration SHA256:
  `3cb2c5730a4bca6585ec432ac70e7dcc85c08a181db6f4b0008d02d60560144f`.
  Added conservative, pure purpose decisions; private RLS ledgers, exact bigint
  generation/epoch fencing, independent handoff receipts and separate
  `retention_raw|retention_receipt|retention_marker` authority operations.
  Extended the owner-installed definition/ACL/state fingerprint; service cannot
  certify it. Service has only SELECT on new tables and EXECUTE on read context.
- User-visible impact: none while dormant. All production external necessity,
  reference, hold, delivery, link, suppression and independent restore facts stay
  unavailable. No external adapter, authority issuer, cleanup executor or schedule
  ships. Unknown consent stays unknown; usable links and independent suppression
  purposes remain protected. The synthetic facts helper is test-only.
- Backend compatibility: original migration bytes, input pins, public API
  signatures/bodies/ACLs and old `disposalAllowed:false` contract preserved.
  Positive migrated-schema import/mode tests preserve both beta platforms.
  iOS 1.0.2/build 1.0.20, Android 1.0.2/code 4 and retained 1.0.1 native
  contracts are unchanged; these are website Sydney-only tables, never the app
  database. Future compatible finish/readiness/restore callers and writer control
  must be verified before any separately authorized minimization or restriction.
- Validation: assertion RED 20/74 passing, focused final GREEN 87/87, final
  `npm run check -- --test-reporter=tap` 290/290 including the required existing
  103-test launch database suite once (117 DB tests with Task 2). Zero final
  failures/skips/cancellations. Additional state-retirement assertion RED and
  repaired GREEN are retained, along with every failed GREEN and sandbox attempt,
  in unique evidence files referenced by the Task 2 report. Final check emitted
  one npm warning because the reporter option reached npm instead of Node; all
  tests still ran. Existing owned-fixture cleanup chatter remains, per deferred
  Minor M2. CLI emitted an update notice; nothing installed/upgraded. Typecheck
  and lint scripts absent; no TypeScript/native change; expo-doctor not applicable.
- Deployment impact: EAS Update possible/safe/required no; new EAS Build required
  no. Supabase migration required yes for a future separately reviewed website
  rollout; Edge Function deploy no; Supabase secret change no; future Vercel
  website deploy yes for adoption, admin deploy no; App Store Connect
  metadata/privacy-label change no; manual-QA-only no. No deployment performed.
  Suggested command now: `npm run check`; no EAS command or blanket
  `npx supabase db push` is authorized. No link/login/hosted SQL occurred.
- Remaining: controller review of Task 2, Tasks 3–6 and actual hosted/Data API,
  provider/writer/necessity/restore/operator acceptance. Physical current/retained
  iPhone Safari and Android Chrome signup, withdrawal, retry, contact/deep-link QA
  remains required; no physical test claimed. Rollback keeps cleanup disabled,
  suppression/usable-link/unknown-handoff fences intact; never resurrect raw data
  or activate an old client after future minimization.

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

## 2026-10-19 — Prepare disabled bounded launch retention processing (Task 5)

- Local website implementation only; controller independent review remains next.
  Added strict private client/processor, offline-only CLI, RunReceipt schema1 and
  focused unit/real PostgreSQL tests. At most100 work items total across raw,
  receipt and marker lanes; independent bounded100-row rate sweep runs first.
  Every apply is a separate supplied-transport autocommit transaction. No stale
  approval caching, issuer, force switch, sender/provider, schedule or production
  transport is supplied. Default unbound processing reports unavailable/zero work.
- Unknown consent/settlement and active launch/beta/account purposes remain
  protected. Positive-write Task4 review remains partial/review; completed ordinary
  work plus one unknown/unavailable copy remains partial. Existing import
  `disposalAllowed:false`, public response shapes and all accepted SQL bytes stay
  unchanged. Receipts contain only opaque run ID, bounded counts, qualified
  observed decision age and fixed reasons; no all-copy-erasure success field.
- Generated forward migration
  `supabase/migrations/20261018184435_launch_list_retention_processing.sql`
  adds read-only service-only inventory and an independent rate-event sweep for
  events strictly older than the existing day. Recent events and the ten-minute
  limiter remain unchanged. Existing owner-installed fingerprint covers new
  private/public definitions/ACLs and rate-table access; no ledger DML grants or
  old-caller prerequisites are added. Migration SHA256:
  `dfd97570e5d4eb39a6f230762ba126154db07aa19595249e0d5514a04207c1b1`.
- Ruling12 consumes a private trusted-code `executeBounded({rpc,args})` dependency;
  shape/booleans do not attest arbitrary owner I/O. Only the authorized test helper
  creates/owns a network-none/pull-never local fixture. The SAME actual client and
  psql supplier use fixed startup libpq `PGOPTIONS` with5000ms deadline before any
  SQL, proving valid processing, actual slow-proof cancellation, reached-write
  rollback and released locks. Production remains unbound; Task6 must independently
  prove actual owned HTTP/cancel/connection behavior. Unit doubles are not timer proof.
- Package adds ONLY `test:launch-retention` and `launch:retention:dry-run` under
  the independently frozen exact exception. Added exact fixture/shared validator/
  negative tests and necessary source/S-state checks plus separate source-map
  exception phase. Original211-byte D2 package baseline, scripts/dependencies/
  other fields and frozen input pins/map entries are preserved. No Task6 command.
- User-visible/hosted backend impact: none while dormant. Runbook now documents
  states, per-item processing, separate rate bound, private exceptions, proposed
  future hourly cadence and missing protected/copy/production bindings.
- Validation: assertion RED preserved (unit4/16, required SQL0/2 before P, plus
  package RED); all failed implementation/debug attempts remain separate raw
  scratch captures. Focused final253/253; required `npm run check` once448/450,
  reproducing unchanged S+D import-race child+parent Lock-observation failures.
  Required `npm run test:launch-db` once255/257, same unchanged child+parent failure.
  Neither full run is GREEN; no full-suite rerun was made for clean logs.
  Offline dry-run exit0, unavailable with zero work; whitespace check passed.
  No TypeScript/lint scripts or Expo/native changes; typecheck/lint/expo-doctor N/A.
  Old baseline counts do not establish all-R/P or HTTP coverage. The new13-result
  fixture installs W+I+L+C+S+D+R+P; earlier fixture sets remain unchanged.
- Compatibility/deployment: Sydney website only. iOS1.0.2/build1.0.20,
  Android1.0.2/code4 and retained1.0.1 native/backend contracts unchanged; physical
  browser/contact/deep-link QA on both platforms remains NOT RUN. EAS Update
  possible/required no/no; new EAS Build no. Future selective ordered website
  Supabase migration yes, none applied hosted; Edge Function deploy no; secret
  change no; Vercel/website/admin deploy no now (future compatible website/consumer
  adoption separately required); App Store metadata/privacy-label change no;
  manual-QA-only no. Suggested deployment command: none now. Preserve cumulative
  source and compatible consumer-first/transition ordering before enforcement.
  All66 inventory/21open/20final real gates remain uncompleted. Rollback stops
  processing while retaining suppression/unknown/restore fences and compatible
  finish/readiness; never reconstruct erased raw facts or claim SQL reverses disposal.
