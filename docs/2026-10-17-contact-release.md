# Isolated support contact release — 17 October 2026

## Authority, source and boundary

John authorized input-free work and necessary actions while away17October.
The official support@joinveylo.com address was already expressly selected.
This release ports only the reviewed contact fix347389fb6d4342a7630870d435cbed10c0287d27,
not the larger dormant launch-list consolidation branch. No user record import,
new email, suppression change, migration, credential, provider agreement, policy
version or native update is authorized or performed by this contact-only slice.

Vercel authenticated17October production list: team
team_7JJ5glFkwoswn9JPoljpQvol, projectprj_8w6OsKo0Z7A7YuIc4DyNEWq0M5e4,
nameveylo-site-preview, current productionREADYdpl_EgjCKrxUah9umPcCkmuftUBxBiSY,
source708b176e098f3d4873676aa8ae9b09b90d5e9000, branchcodex/live-beta-signup.
Latest preview is a different deployment and was not mistaken for production.

Branchcodex/public-support-contact is rooted at that exact production source.
The existing consolidation checkout remains at5e672191191674bb1240bb28991cbaa1b96f4a7f,
clean and unchanged. Native app managed-worktree tooling cannot target this
separate website repository; an isolated temporary linked checkout was created
under/private/tmp/veylo-support-release.dcSNRf/site. No install or shared-branch
push. Normal no-commit cherry-pick had only a CHANGELOG context conflict; resolve
with production history plus contact-only records, not accumulated D2 records.

Bothsupport.html and tests/support-contact.test.mjs must exactly match their
reviewed347389f blobs; all other executable/static/config files remain production
bytes. CHANGELOG/TODO/this receipt supply source and operational records only.
The support page's old date, deletion wording, analytics and linked canonical
legal documents are deliberately not misrepresented as comprehensively updated.

## Verification and rollout

- Production-source baseline `npm run check`:40/40pass,0fail/skip/cancel.
- Ported-source full/focused tests, whitespace and exact-byte/source-scope checks:
  pending at preparation. No TypeScript/lint scripts or native/Expo change.
- Existing Vercel CLI54.21.1 authenticated as the intended account; no credential
  read/export/login change. Help output exit2 is usage behavior, not a deployment.
  An advertised newer CLI was not installed.
- Stage using existing project/team and production environment, **skip domain
  assignment**. Inspect actual candidate project/target/commit and readiness.
- Before promotion, verify candidate support contacts/subject, homepage/API/
  library/config/static bytes and legal redirect destinations without submitting
  signup/support mail or changing any flag. Stop if production moved meanwhile.
- Promote only the exact staged/tested build, not a rebuilt preview. Independently
  verify actual public route and production alias/deployment afterward.

Candidate/deployment/promotion/public proof: **not yet performed at preparation**.
Do not count this file or local tests as a public-release result.

## Compatibility, remaining QA and rollback

Website HTML contact only. iOS/Android native clients, all shared RPC/auth/session/
database/Storage and signup API/email contracts are unchanged. Previously known
iOS1.0.2/build1.0.20, Android1.0.2/code4 and retained1.0.1 still need broader
release/adoption QA; this does not waive it. The basic Gmail→support→human reply
smoke test independently passed17October in10m26s, not full48h/backup/urgent or
deletion-completion acceptance. No message is sent by this release.

EAS Update possible/required:no; new EAS Build:no. Supabase migration, Edge
Function, secret change, admin and App Store metadata/privacy-label change:none.
Vercel website release:required to publish. Physical iPhone Safari and Android
Chrome/default mail client/app-to-site navigation remain untested. No assumed
new retention period, all-copy erasure, age assurance or legal certification.

If rollback is needed, first inspect whether newer changes exist. Revert only
this contact patch or promote the exact prior production when still appropriate;
never overwrite newer website/signup work. A code rollback cannot unsend mail,
but no mail/data mutation is performed here. Full app/legal publication remains
separately gated. No PR into the canonical legal main is created.
