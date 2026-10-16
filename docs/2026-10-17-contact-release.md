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
nameveylo-site-preview, pre-release productionREADYdpl_EgjCKrxUah9umPcCkmuftUBxBiSY,
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
- Ported source `npm run check`:44/44pass,0fail/skip/cancel; includes4reviewed
  contact tests. Whitespace/exact5-path scope checks pass. Page and test blob IDs
  match347389f; all other production source bytes unchanged. No TypeScript/lint
  scripts or native/Expo change.
- Existing Vercel CLI54.21.1 authenticated as the intended account; no credential
  read/export/login change. Help output exit2 is usage behavior, not a deployment.
  An advertised newer CLI was not installed.
- Staged production-target READYdpl_81afMJgSr7sdpJFTAgvSaH9SBwuL with
  `--prod --skip-domain`, exact source0baab74af58b72072ac14c95287487fde47c6c26.
  Raw read-only deployment metadata confirms project/team/target/source/base/
  reviewed-contact refs. GitSource is null for this local CLI upload, not a
  claimed GitHub push. All46actual uploaded source paths/SHA1content hashes match
  the committed artifact; manifest SHA256:
  49f9b185586c43b4f48588835a2baf3943cef7c76f40efcc648ff59d27860784.
- Staging assigned the generic project Vercel alias only; joinveylo.com/www and
  the shorter project alias remained on the old build until promotion. Fresh
  filtered alias readback confirmed that immediately before promotion. Clean
  exact source was still a descendant of708b176; no intervening change ignored.
- Authenticated candidate GETs: support, homepage, CSS and signup.js exactly
  match source; both API GETs405; privacy/terms/deletion307locations unchanged.
  No signup, mailto activation, POST or email sent. Existing production variables
  reused; no environment flag, secret or provider setting was changed.
- Promoted that exact staged build, without rebuild. Public9route checks passed:
  same4source bodies,2method guards and3canonical legal redirects. Filtered alias
  readback puts joinveylo.com/www/shortproject alias on the tested deployment.
  Public browser confirms both corrected display/mailto contacts and subject.
  These observations were complete by2026-10-16T15:45:21Z (17OctoberBrisbane).
- Public support SHA256:
  6b1bc63cc9d4459dd5996b35a985f69fdf296f66986d3f6c053f1011f09cdf5f.
  Full-page desktop JPEG saved outside the repo as
  /private/tmp/veylo-support-release.dcSNRf/public-support-contact-2026-10-17.jpg,
  SHA25664d54bff8cd80ee7704a43189fbc1a1838d12a9bf778a8216b1450b00c749ddb.
- Exact-deployment production error/fatal aggregation for the20minute lookback
  returned no groups. This is a bounded observation, not proof of permanent
  error-free operation. Drains were not rechecked; broader monitoring/retention
  and human operations remain gaps, not silently configured by this release.

**Contact-only public release verified.** This follow-up changes records only;
the deployed source remains0baab74 and needs no second deployment.

### Diagnostic qualifications

- Initial dry scanner over-rejected the unchanged tracked `.env.example`.
  The orchestration wrongly continued staging after that nonzero guard; do not
  hide this ordering error. Before promotion, exact-template inspection proved
  all values are placeholders/empty, and the full46file hash/source check passed.
  No actual credentials/private files were uploaded. Future dependent external
  actions explicitly check the preceding result; promotion did so.
- MCP's simplified deployment metadata omitted custom refs and its source listing
  omitted4doc filenames. Raw read-only APIs resolved both, all46hashes matched.
  No omitted filename or empty simplified metadata was accepted as full proof.
- Unauthenticated curl followed protection to a Vercel Login200, not app content.
  A Buffer equality assertion tried an oversized diff and exited137; no content
  equality was claimed from that failure. Subsequent string/hash/length checks
  avoid dumping the body. Initial sandbox DNS failure was an access limitation.
- Existing authenticated `vercel curl` initially needed local linkage. Only
  ignored non-secret project IDs were saved; no `.env` was pulled. Its optional
  scope flag was forwarded to native curl; omitting that redundant flag resolved
  the CLI parsing failure. The successful requests used pinned deployment/project
  identity. No protection setting was disabled or share-link tool requested;
  CLI authentication internals were not independently audited.
- Cloud build used Vercel CLI64.0.2 and emitted an npm cache-dir warning; local
  CLI54.21.1 was not upgraded. Tests passed, but cloud output was not pristine.
  An alias response unexpectedly included an old expired bypass field in tool
  output; it is omitted from all records and subsequent alias output is filtered.

## Compatibility, remaining QA and rollback

### Later source-history recovery — 17 October

The first complete-history backup failed on a missing older tree; the exact
47-file82da1e8 source archive was preserved as a fallback, not claimed as full
history. Subsequent read-only GitHub metadata confirmed the public website repo
and its actual branches. Ordinary main/all-branch fetches left13missing trees:
their commits were already locally known, so normal fetch negotiation omitted
the incomplete trees. Each was mapped to the published live-beta-signup ancestry.
One supported `git fetch --refetch` of that exact branch recovered them without
rewriting commits, resetting checkouts, pushing or deploying. New recovery refs
are isolated under refs/remotes/website-recovery-20261017.

The release branch's reachable missing-object count is now0. A235477-byte bundle
records complete history through82da1e8f5e4fd2070ce3c8c92febe8128db440c9;
`git bundle verify` passed. SHA256:
18cd138f4602c283da1e746260b682ca708674c651e7a8bbbf731ff209b60476.
An independent bare restore from that bundle passed object/connectivity checks
and matched the exact commit and treeb9a660e336b9761452d0738da41234382d57941c.
Its default HEAD is an unborn main, reported as a notice, not a missing object.
The original shared repository's broader fsck still exits8 solely for its
pre-existing main-worktree detached HEAD pointing at nothing; that unrelated
checkout was not reset or silently repaired. A process-list diagnostic was
unavailable in the sandbox; successful object, bundle and restore checks provide
the recovery evidence instead. An initial wildcard-only fetch had an invalid
refspec and made no network change; no failed check is called a pass.

The bundle and original verified source archive are retained in the app's
private publication-plan workspace; preserve/export them before eventual cleanup.
The contact branch remains otherwise unchanged, and the separate D2 checkout
remains clean at5e67219. No runtime file, deployment, subscriber, provider setting,
email or release gate changed. This records a recoverable release source, not
repository-wide health, GitHub integration or full legal publication.

Website HTML contact only. iOS/Android native clients, all shared RPC/auth/session/
database/Storage and signup API/email contracts are unchanged. Previously known
iOS1.0.2/build1.0.20, Android1.0.2/code4 and retained1.0.1 still need broader
release/adoption QA; this does not waive it. The basic Gmail→support→human reply
smoke test independently passed17October in10m26s, not full48h/backup/urgent or
deletion-completion acceptance. No message is sent by this release.

EAS Update possible/required:no; new EAS Build:no. Supabase migration, Edge
Function, secret change, admin and App Store metadata/privacy-label change:none.
Vercel website release:completed for this contact correction. Physical iPhone Safari and Android
Chrome/default mail client/app-to-site navigation remain untested. No assumed
new retention period, all-copy erasure, age assurance or legal certification.

If rollback is needed, first inspect whether newer changes exist. Revert only
this contact patch or promote the exact prior production when still appropriate;
never overwrite newer website/signup work. A code rollback cannot unsend mail,
but no mail/data mutation is performed here. Full app/legal publication remains
separately gated. No PR into the canonical legal main is created.
