# Launch-list cutover and data-only restore operator guide

13 October 2026. Local implementation only; no production operation authorized.
Launch intake and unsubscribe activation remain OFF. Beta remains independently
available. This guide concerns website signup storage in Sydney, not app account
data. Full branch review and each scoped live authorization are still required.

## Authority and operator receipt

The sole authority boundary is existing private `launch_import_authorizations`
plus `launch_list_control` source/project/epoch and installed
`launch_write_fence_ready_v1()` capability. RLS excludes ordinary clients; service
administration is trusted. These records attest operator review; a flag, elapsed
timer, evidence-reference string or successful migration cannot prove human
approval, external writer control, mail settlement or backup completeness.

The release owner must identify a trusted database operator and an evidence
reviewer before execution. Their names and decision references are currently
**unassigned / Needs verification**. Do not have an importer or application route
issue its own approvals. The operator may issue a purpose-bound record only after
the reviewer verifies the following exact receipt, using controlled evidence
records rather than subscriber contents:

| Receipt field | Required verification |
| --- | --- |
| Human decision | Named owner/reviewer, action, time, explicit bounded validity, revocation route and approval reference |
| Environment | Exact website project/environment and Sydney project identity; never native app database; actual role/schema/extension parity |
| Source | Exact combined source commit, tested preview and production deployment IDs, migration paths and SHA-256, schema identity |
| Writers | Every actual current/historical immutable deployment ID, alias, script/job/integration and credential principal; source/environment fingerprints, access controls, owner and refusal-test evidence |
| Settlement | Actual request/worker/provider evidence for every known in-flight dispatch, with unresolved cases retained; no inferred settlement from a timeout, age or DB mode |
| DB scope | Fresh keyed `scopeHash`, `schemaIdentity`, `fenceEpoch`, project/source binding and installed guard readiness |
| Restore only | Exact snapshot reference, independently retained replay reference, coverage/watermark evidence reference, verified time interval and safety-fact categories, conflict decisions and access/retention owner |

Writer IDs in the private table are distinct bounded opaque identifiers, mapped
to exact deployment/script evidence in the restricted operator record. Do not
replace them with URL counts or invent deployment IDs. No real IDs or evidence
are populated by this migration. Store only opaque references and content-free
receipts in project records; never addresses, token capabilities, matching keys,
provider payloads or raw subscriber snapshots. Provider evidence may itself need
restricted access; do not paste it into stdout, issues or analytics.

## Interfaces and transaction ordering

`set_launch_mode_v1(p_expected_epoch bigint, p_mode text, p_scope text,
p_match_key text)` has **four required parameters**, no defaults or three-argument
overload. It takes the existing launch-only outer transaction fence, recomputes
the current keyed scope, validates installed guards and current private authority,
then atomically changes mode, increments epoch and consumes that authority.
Stale or ambiguous evidence refuses without writes. Refusal receipts are not
permission to retry against a changed scope. Re-inventory and obtain fresh review.

The transient matching key is never stored by these functions. Verified hosted
parameter/body/query/error/APM/log handling is a prerequisite **before** using a
live key. Use a reviewed private transport with bound parameters; do not put a key
in a URL, shell argument/history, checked-in SQL, stdout or operator receipt.
Local fixture secrecy is not hosted logging proof.

Authority `operation` is `import` (default for existing records), `mode`, or
`restore`. Import has no target/evidence fields. Mode has `target_mode` of `fenced`
or `canonical`. Restore requires target `canonical` and nonempty bounded
`restore_snapshot_ref`, `restore_replay_ref`, `restore_coverage_ref`. Import
approval cannot change mode; mode/restore approval cannot import. The importer
adapter also checks purpose. `read_launch_import_authorization_v1` exposes purpose
and evidence references to the service operator only. Receipt schema:
`docs/launch-list-receipt.schema.json`; the existing importer emitter deliberately
accepts only importer outcomes, not mode receipts.

Reviewed issuer sequence (parameter names below describe a procedure, not
ready-to-run production SQL):

1. Outside the transaction, collect exact writer/source/environment controls,
   tests, actual settlement and fresh human approval for one operation/target.
   Review expiry and revocation; an evidence row is not independent proof.
2. Verify migration definitions and capability installation as database owner.
   Definition/grant/trigger changes require reviewed migration-end capability
   reinstallation, a new schema fingerprint and fresh approvals. Service role
   has no capability self-certification setter.
3. Begin a short READ COMMITTED transaction; take
   `pg_advisory_xact_lock(hashtextextended('launch-list-fence',0))` **before**
   control/authority/data row locks. No table or shared beta-email lock.
4. Verify trusted `project_ref`/`source_commit` binding and external environment
   against reviewed receipt. Never infer deployment from a client parameter.
   Obtain `inventory_launch_legacy_v1(transient_match_key)` under the fence.
5. Insert one fresh authorization with the reviewed operation/target, that exact
   scope/schema/epoch, distinct verified writer IDs, control/test/settlement
   references, verified time and bounded expiry. Restore evidence references
   must describe independently reviewed coverage through reopening. Do not reuse
   consumed/revoked/expired approvals or resolve ambiguity by picking any row.
6. Invoke the import or four-argument mode RPC in the **same transaction**. RPC
   rechecks current state. Require the documented outcome; otherwise rollback.
   Commit and retain only the content-free receipt. An error rolls back mode and
   consumption. A lost response is not proof of rollback: inspect current mode,
   epoch and consumed receipt before deciding whether another action is needed.
7. Revocation uses the same outer fence before authority update, with actual
   owner review. Never restore an older authorization/revocation/control state.

Scope includes row versions as well as values; equal-count changes invalidate
approval. Beta rows remain outside launch scope. `fenced` entry accepts only
mode-purpose authority and refuses known unsettled handoffs, so first close
external launch dispatch and drain/reconcile it. `canonical` requires fenced
source mode, exact legacy-to-canonical/suppression/review provenance equality and
consistent withdrawal/delivery facts. A restore-marked target requires fresh
restore-purpose authority. There is no authorized mode RPC path back to unsafe
`transition`. All mode changes increment epoch; older handoff authorizations fail.

## Ordered cutover gates

1. Review and deploy only the exact additive lifecycle migration to Sydney:
   `20261013112838_launch_list_lifecycle.sql`. Review the extended second migration
   `20261013125523_launch_list_canonical_cutover.sql` separately and authorize its
   installation before the purpose-aware importer/new mode API. It installs guards
   and service-only RPCs while leaving default `transition`, bindings and
   authority unchanged. No blanket app `npx supabase db push` is appropriate.
2. Separately authorize server-only secrets and verify transport/log secrecy.
   Deploy/test compatible current `/api/signup` launch and `/api/waitlist` routes,
   guarded delivery and explicit unsubscribe page. Preserve exact beta v1
   signatures, links, intents/platforms and session-independent website behavior.
3. Inventory and control **exact** historical unsafe deployments/scripts and
   their source/environment/principal bindings. Immutable old URLs must be denied
   at their entry point before any provider call. SQL insert refusal cannot stop
   an old script which ignores storage failure and sends directly. A still
   uncontrolled writer or unknown inventory blocks cutover. Restrictive canonical
   activation must follow compatible website callers and these controls.
4. Hold launch activation/dispatch closed outside the DB; beta stays available.
   Establish actual settlement of pre-existing HTTP/worker/provider calls,
   including old v1 sends lacking modern guards. Database mode alone is not
   settlement. Pending, review or unknown results remain unresolved regardless
   of elapsed time. Obtain reviewed fresh authority and enter launch-only fenced
   mode. No full-site maintenance or beta outage is allowed.
5. Re-inventory after all safety updates; separately authorize no-send importer
   reconciliation. Require exact normalized identity/provenance equality, original
   IDs/times and preserved canonical/provider/beta facts. Imported unknown consent
   stays review and non-sendable. Unsupported/non-ASCII/conflicting rows require
   explicit review; no silent drops, consent upgrades or count-only equality.
6. Obtain fresh **mode-purpose** approval for the post-reconciliation scope and
   canonical target. RPC verifies guards and equality, increments epoch, consumes
   approval and switches the legacy mirror boundary atomically. Canonical refuses
   old direct `waitlist` inserts and obsolete v1 launch claim/finish; v2 writes
   canonical storage only. No source rows are deleted or mirrors purged here.
7. Only after independent hosted acceptance, separately authorize activation and
   test both routes and withdrawal. Verify actual deployed source/group IDs and
   keep rollback compatible/guarded. Local completion authorizes none of this.
8. Separate disposal proposal only after equality, necessary delivery/provenance
   reconciliation, exact fresh targets/writer status and applicable retention
   decisions. No deletion is implemented or approved in Task 5.

## Maintenance, late results and honest retry

Fenced new launch claims return maintenance (current HTTP routes return retryable
503). Existing beta claims/finish remain available, even while another transaction
owns the launch fence and for the same address on iOS/Android.

Monotonic valid withdrawal and a matching **already recorded** handoff result can
persist through maintenance. Withdrawal stores suppression/receipt, preserves
provider history and handed-off claim lookup, and cannot recall mail. Late finish
retains accepted provider ID/failed/pending outcome; it never starts transport,
clears withdrawal, invents settlement or retries the provider call. Duplicate
finish returns false and cannot overwrite settled facts. Pending remains a
cutover blocker even if the handler finished recording it.

The latest `launch_delivery_guard.handoff_token`/`handoff_at`/`settled` proof now
survives a subsequent unsent retry. Nullable private additions distinguish its
recorded `handoff_state` (`sent`, `failed`, `pending`) from the current
`claim_token`. `claim_outcome` (`disabled`, `cancelled`) and `claim_finished_at`
record an explicit completion of that unsent lease. They are not a new public
delivery state, a provider result, fresh consent or a retention deadline. A new
handoff replaces the latest handoff proof only after guarded authorization;
unsent retries preserve the pinned payload, first-attempt clock, nonce and hash.

Import, maintenance entry and canonical/restore readiness share the same delivery
predicate. A completed unsent retry requires the retained timed/pinned definite
rejection, a distinct current lease and finite completion time, with matching
disabled row or withdrawn row plus suppression/receipt. Missing proof, pending
handoff or contradictory outcomes still refuse fresh authority. A cancelled
unsent lease may retain the public row's `sending` state alongside withdrawal;
only its private explicit cancellation explains why that lease cannot dispatch.
Do not infer cancellation from a null token alone or rewrite historical facts.
Replay must include these four fields and the latest outcome as well as the
existing safety categories. An older incomplete replay is not ready to reopen.

The additions default to null for existing records; ordinary matching terminal
proof remains compatible. A later guarded claim can record a previously known
matching definite rejection, without filling missing/uncertain evidence. Both
migrations are still undeployed: install the exact reviewed lifecycle definition
then cutover definition/fingerprint before compatible website routes, keeping
launch closed until scoped operational gates pass. If either older candidate was
applied elsewhere, stop for a reviewed forward migration and handoff/lease drain;
do not assume editing an already-applied file upgrades that installation.

Lock contention/storage failure can still return retryable 503 for withdrawal;
the page must retain honest retry/support behavior rather than claim success.
If late-result persistence fails, retain the exact result in separately reviewed
restricted operational evidence and retry/reconcile the **same** handoff, not a
new provider send. Current route can report provider acceptance even if finish
persistence failed; treat its guard as unresolved. Do not depend on a worker's
memory, an HTTP timeout or a browser retry to preserve evidence. Actual durable
provider/result retrieval and logging procedure is a rollout gate.

Rate-event cleanup remains request-triggered deletion older than one day; it is
not a guaranteed wall-clock expiry job or a retention policy for subscriber data.

## Closed data-only restore drill and production gap

An old full snapshot alone **cannot recover withdrawals after the snapshot**.
This synthetic data-only drill does not certify D1's broader backup/disaster
restore gate or any provider backup. Production's independently preserved replay
source, verified interval/watermark, storage/access/retention procedure and named
owner remain **external release blockers**. No replay store is provisioned here.

Before any separately authorized real restoration, the owner/reviewer must
identify an independent minimal source covering every withdrawal/suppression,
usable token lookup, provider/handoff uncertainty/outcome, provenance correction,
control epoch and authority/revocation change from snapshot through reopening.
They must verify no gaps (including failure/retry windows), conflicting facts,
source identity, ordering, access, encryption/logging and a justified retention
end trigger. A fabricated coverage reference is not coverage. Missing coverage
keeps all launch writers/sending externally closed; retain beta availability.

Synthetic test procedure (owned DB only, no subscriber export files/stdout):

1. Preserve newest safety facts in an owner-only namespace inaccessible to anon,
   authenticated and service runtime clients. Keep snapshot and replay bytes
   entirely inside the network-isolated owned DB fixture.
2. Hold launch activation/historical writers closed independently of restored DB
   state. Prepare isolated data-only target with current reviewed guards, fenced
   mode, epoch greater than preserved latest epoch and `restore_required=true`.
   Preserve latest authority and revocations; never load snapshot control or
   authority over them. Owner-only fixture fault injection is not a runtime
   trigger bypass/restore RPC for production.
3. Load older launch data only. Never replace beta rows. Pre-withdrawal raw rows
   do not authorize signup/send/reopen: restoration mark requires restore-purpose
   authority and observable contradictory suppression/provider facts refuse.
4. Merge/replay **all** newest safety categories. Suppression dominates old active
   state; preserve earliest justified withdrawal and its receipts. Keep original
   provider/attempt/token/payload facts. Missing/contradictory/uncertain handoffs
   stay review/closed until actual evidence resolves them. Never accept an older
   active status, revocation state or shorter epoch as newer truth. Conflicts need
   owner resolution, not `ON CONFLICT DO NOTHING` as a production merge strategy.
5. Independently verify full coverage and exact current data/provenance consistency,
   install/verify writer guards, then re-inventory **after replay**. Old scope
   approvals refuse even for equal counts. Fresh restore-purpose authorization
   binds snapshot/replay/coverage references to exact source/schema/scope/epoch.
   Ordinary mode/import approvals cannot reopen the restored target.
6. Only verified restore authority can reopen canonical; epoch increases and
   restore requirement clears atomically. Verify later withdrawal still suppresses
   signup, receipt still works, uncertain sends cannot retry, old inserts/v1
   launch remain denied and beta data/behavior are exact. Reopen external traffic
   only after separately authorized hosted QA. Remove owned fixture afterward.

The local tests retain latest authority/control and safety tables separately,
restore stale launch fields, reject missing/stale/contradictory replay and a newly
unsettled handoff, then reopen after complete synthetic replay plus fresh review
record. These facts prove local guard behavior, not that a real replay source
exists or that a full disaster restore can recover later facts.

## Retention, rollback and acceptance

No guessed TTL, subscriber export, automated purge or indefinite full-row archive
is approved. Minimize raw withdrawn launch data only after necessary delivery and
provenance reconciliation and applicable owner-reviewed retention decisions.
Retain minimal keyed suppression and necessary token/idempotency lookup until
their justified link/withdrawal/no-repeat obligation ends. Define the end trigger,
owner and evidence before disposal; unresolved source/provider/mailbox/export and
backup retention stays an open gate. Provider handoff and disposal cannot be
undone by a code revert. A migration does not certify third-party erasure.

Rollback closes launch-only intake/dispatch or deploys a compatible guarded route.
Preserve suppression, usable receipts, canonical IDs, matching/token keys, payload
hashes, uncertain handoffs, provider facts, provenance and consumed/revoked
authority. Never roll back to unsafe historical writers or unguarded transition.

Hosted acceptance requires separately approved synthetic addresses/recipient:
both launch route response contracts, receive then explicit unsubscribe, repeated
link, no-op GET, historical URL refusal before provider invocation, storage error,
uncertain/late provider results, maintenance retry, failed restore and successful
covered replay/reopen. Verify no token/query/body/error/analytics leak; preserve
same-address iOS/Android beta and TestFlight/Android links throughout. Record
source/deployment IDs, exact evidence and iPhone Safari/Android Chrome results.
No real subscriber QA or campaign. Physical device/hosted results remain unrun.

Released-client evidence: iOS 1.0.2/build 1.0.20; Android 1.0.2/code 4 and retained
1.0.1. Reverify at rollout and test external signup/legal links on both platforms.
No app Auth/session/RPC/account contract changed. A discovered native dependency
requires a compatible deployment sequence, not a platform exemption.

EAS Update possible/required: no. New EAS Build required: no. Future reviewed
Sydney migrations and compatible website Vercel deploy are required; server-only
secret configuration separately authorized. App Edge Function/admin deploy not
expected. Website legal/collection notices and applicable store privacy metadata
must be reviewed against final verified behavior; no publication performed.
Suggested local checks: `npm run check` and `npm run test:launch-db`.
