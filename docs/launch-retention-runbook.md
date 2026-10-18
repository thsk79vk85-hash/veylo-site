# Website launch retention: disabled bounded processing, retirement, restore and copies

Local Task4/5 mechanics and Task6 integration evidence only. Website Sydney project `yohiumlrpfdhphsnnxxw`;
never the native app database. Production cleanup, sending and scheduling remain
OFF. Installing SQL is not operational approval. Real fact, field, restore,
transport and copy adapters remain unavailable; no issuer, proof setter, general
replay importer or force switch is supplied.

## Bounded private processing — no production wiring

`processLaunchRetention({client,limit=100})` observes at most100 total opaque
work items across raw/receipt/marker lanes, with one awaited apply RPC/autocommit
transaction per item. It never issues authority, imports senders, contacts providers
or installs schedules. It consumes only fresh inventory tuples and never caches
or refreshes consumed approvals. Duplicate/oversized/malformed inventory refuses
before apply; mismatched/reordered results are unavailable for that item. Restarts
observe current generations/scopes and existing purpose-specific unused authority.
Old import receipts still require `disposalAllowed:false`.

The read-only service-only `inventory_launch_retention_v1(integer)` supplies
bounded exact bigint-string tuples and existing unique matching authority, not
eligibility proof. It defaults disabled for unconfigured/transition control and
unavailable for unsafe fingerprint/restore state. Protected owning facts remain
unavailable. The D/R executors still recheck all consent/purpose/hold/reference/
settlement/restore/field facts transactionally; inventory never substitutes for
them. Missing or ambiguous authority is review, never minted or guessed. More
than the selected bound remains explicit follow-up. Forward migration Q joins
unique current usable authority before selecting at most100 items (one extra
read-only lookahead for hasMore), prioritizing usable authority then decision
time/ID. An unchanged no-authority prefix cannot hide ordinary authorized work.
Missing/ambiguous/stale/consumed authority stays unchanged and available for private
review, with hasMore when outside the selected page; it cannot authorize itself.
The next run re-evaluates all authority matches. D/R still recheck actual owning
facts; authority priority is not eligibility, coverage or an all-copy result.
Inventory selection does not establish completeness: it cannot account for an
unenrolled withdrawn/unknown raw row or independent outstanding copies. Fixed
`coverage_unavailable` and `copies_unavailable` remain explicit even when the
ledger/page is empty, including after accepted R removes the last local marker.
No phantom marker, admission issuer or copy-case system is created to retain
those signals. Independently eligible local work can still progress under D/R.

`createLaunchRetentionClient({transport})` consumes the PRIVATE TRUSTED-CODE
dependency `executeBounded({rpc,args})`. Only fixed inventory/apply/sweep RPCs and
strict validated arguments/results can cross it. Missing/wrong-shaped/claim-only
rpc/fetch objects are unavailable. Object shape, a Boolean, a brand or reading a
GUC is not proof that arbitrary owner code armed a timer. A supplied implementation
must own the actual executing-connection deadline1..5000ms BEFORE dispatch and
sanitize cancellation/connection errors, with each item committed or rolled back
by its own server transaction. No production implementation is supplied/wired.

The authorized test-only factory closes over its own labelled network-none,
pull-never local PostgreSQL fixture. Each actual psql connection receives fixed
libpq `PGOPTIONS=-c statement_timeout=5000` at startup, before role selection or
SQL. It executes one allowlisted RPC SELECT in autocommit. The SAME real client
and supplier exercise positive D/R operations, slow-proof cancellation, reached-
write rollback and released locks. This proves that local psql supplier only.
Task6's separate owned HTTP supplier is described below; neither result certifies
arbitrary owner I/O or supplies the missing production implementation.

`sweep_launch_rate_events_v1(integer)` independently deletes at most100 events
strictly older than the existing one-day window, skipping locked rows and reporting
remaining work. The processor attempts this separate bounded transaction FIRST,
even if launch inventory fails or an exceptional launch item owns the outer fence.
It does not take that fence or change recent events/the ten-minute limiter. No
global role/database deadline or old-caller prerequisite is changed. Invocation
requires the protected supplier; no default schedule is created.

`docs/launch-retention-receipt.schema.json` is schema1 for the new RunReceipt.
Only an opaque run ID, state, bounded lane counts, independent rate counts,
explicit UNKNOWN/null `oldestEligibleAgeSeconds`, and fixed reasons are returned.
Current adapters establish neither the actual eligibility clock nor coverage of
the relevant eligible population across bounded pages. Decision, withdrawal,
review and completion times are not substituted, and completed work cannot
exclude older eligible-but-blocked work from the metric. Item `ageSeconds` and
the receipt metric must both remain null; client/schema/runtime reject numeric
ages. An actual eligibility-clock AND population/coverage integration remains
an uncompleted gate, with no timing framework or new authority supplied here.
`disabled` means the observed launch configuration is OFF
and there was no progress; `unavailable` means no progress and unavailable
processing/necessary facts; `idle` means no eligible work observed; `processed`
means bounded work completed without a known blocked item; `partial` means work
or necessary follow-up is blocked/unresolved, including a remaining bound.
An already-disposed retry has zero writes and adds no new completion count.
Positive-write R review counts as review/partial, never full item completion.
SQL inventory and the processor retain independent unavailable coverage/copy
signals; an empty ledger cannot discharge them. With current missing integrations,
an otherwise empty configured run is unavailable; any local/rate progress remains
partial, even after final local retirement. OFF with zero work remains disabled
with explicit unknown follow-up. Current processing cannot establish idle or
processed while these owning boundaries remain unavailable. Completed ordinary
work alongside one unknown/copy exception stays partial. No state asserts all-copy erasure.

Local commands: `npm run test:launch-retention` and
`npm run launch:retention:dry-run -- --limit 100`. The CLI always constructs an
UNBOUND client, ignores environment/credentials/client injection, and cannot
select a target or execute live mutations. It emits a sanitized unavailable
receipt with zero work; URL/key/env/live/force/apply flags are rejected.
Valid/default stdout always conforms to RunReceipt schema1. Invalid arguments
instead produce only the fixed `Invalid launch retention arguments.` diagnostic
on stderr, exit nonzero and leave stdout empty. No argument/env/private values
are echoed and no dispatch occurs on that separate error path.

Only the two Task5 commands and exact Task6 `test:launch-retention-dataapi`
command are added under the independently frozen exact
package contract (SHA2564018cfc8af0f8563e2cb810d40cd40bc1661266f15e415dc3682c38a4146b7b4).
The reviewed211-byte D2 baseline, original commands/dependencies/fields, old
input pins and source-map inputs stay unchanged. The additive map exception
records phaseTask6 separately. No old command, dependency or other field changes.

## Owned real HTTP integration — local evidence only

`npm run test:launch-retention-dataapi` uses installed PostgREST14.13 digest
`488093de819567422bc1d37cb79da6e84bca3726bac321daeed618f0ed957888` and
PostgreSQL17.6.1.134 digest
`9faa7279bcf1fd6834e65dc876b11e39cb53030bcb3d653beb7e5668200acbb5`.
These are selected LOCAL versions, not inferred hosted versions. The test helper
accepts no existing target, hosted URL or credentials. It creates UUID-labelled
owned containers on one owned internal network with `--pull=never`. An ephemeral
127.0.0.1 Node TCP listener pipes unchanged bytes through tracked Docker exec
and installed `/usr/bin/nc -w 30` to that exact owned PostgREST. It is a byte
tunnel, without HTTP routes/parsing/rewriting/error responses. Awaited cleanup
closes its sockets/children and removes/checks only exact owned resources.

Each HTTP fixture installs waitlist.sql plus seven accepted I/L/C/S/D/R/P migrations
and new Q `20261018215239_launch_list_retention_selection.sql`;
original migration bytes are unchanged. Synthetic roles use explicit grants,
the original RLS/ACL contract, owner-only necessity/field/restore bindings and
purpose-specific authority. No test issuer/binding ships. Requests exercise
ordinary-role denial, service D/R/marker success, exact >2^53 decimal strings,
null/malformed/stale/replayed tuples, usable repeat withdrawal after raw removal,
old four-argument compact finish, terminal conflicts and no resend/refill after
provider comparison retirement. Positive-write review remains partial. Age stays
null; coverage/copies remain unavailable after actual final local marker removal
and for unenrolled raw work. Rate-only progress cannot close those requirements.

The private HTTP `executeBounded` supplier closes over that fixture's actual
PostgREST pool. libpq connection-startup options set statement_timeout=5000
before role/RPC dispatch. Actual slow proof and reached-delete cancellation,
rolled-back state/authority and released locks establish conformance of THIS
supplier. The30second netcat limit and15second fetch safeguard are outer bounds,
not database timer evidence. No global role/database deadline/default or old
import/restore/finish prerequisite is added. Production client/CLI stay UNBOUND.

Raw API output is distinct from sanitized client receipts. PostgREST14.13 exposes
malformed-bigint input in22P02/400, synthetic outside-body message/detail in
P0001/400, outside-body statement cancellation in57014/500 and killed executing
connection inPGRST001/503. SQL body catches do not sanitize those raw boundaries.
The separate private supplier/client returns only its fixed unavailable diagnostic
or strictly validated result; RunReceipt never passes backend errors through.
This does not make the raw DataAPI public-safe or establish hosted log handling.

The second-clone HTTP fixture verifies original NONEMPTY import/mode/restore on
the FULL set, with `disposalAllowed:false` unchanged. Another owned network-none
source advances beyond an older snapshot, including absent identities, old live
key representations and an unresolved handoff. Complete current head/watermarks,
live keys and actual applied manifest must agree under the OTHER source's real
fence THROUGH activation. Missing/stale/self-certified/tampered proof refuses;
complete coverage cannot settle unknown delivery. Owner-only synthetic dump/replay
and proof tables are local fixtures, not a production currency/replay integration.

The consolidated final wave replaces fixed race-holder sleeps with explicit
owner-only gates and observed contender locks. Every started actor is awaited on
success or failure; each synthetic handoff is settled before following global
import prerequisites. Server execution timing is recorded separately from external
observer scheduling, preserving the five-second command deadline/rollback oracle.
Both SQL-clone and HTTP restore fixtures attempt every owned teardown and retain
original plus cleanup errors. Successful absence audits alone cannot prove this
failure branch. The S+D-only race fixture and I/L/C/S/D/R-only SQL-clone restore
fixture retain those scopes; they do not become Q coverage. The processing and
HTTP fixtures cover Q. Exact frozen-source full/DB/HTTP results are recorded in
the final-wave report; historical488/491 and earlier failures remain preserved.
One fresh scoped combined rereview by the controller remains required.

Retained N3: frozen D2 UUID cleanup messages are ownership diagnostics, not failed
cleanup. CLI update notices and the app's four existing experimental Node warnings
do not establish product failure or install authority. Early overwritten output,
uncaptured generator output and transcribed diagnostics retain their provenance
limits; none is reconstructed. New captures use unique labels/UUIDs. No generic
warning suppression, pin loosening or cosmetic heavy rerun is warranted.

After separate operational acceptance, the proposed cadence is hourly bounded
runs. Assign private actionable exceptions/overdue reviews to John or his
authorized backup through existing operator tools. A review date reassesses;
it neither deletes nor extends retention. Do not send routine cleanup emails.
Real protected facts, production supplier, copy/operator/restore/HTTP/physical
acceptance and live authority remain prerequisites before any activation.

## Purpose-specific retirement

`minimize_launch_receipt_v1(item_id,generation,epoch,scope,approval_ref)` and
`retire_launch_marker_v1` have the same service-only tuple and count-only JSON
envelope. The private executor binds the exact operation, owner generation,
current fence epoch, match-key namespace, schema/fingerprint and current owning
scope to a fresh purpose-specific authority. A consumed authority refuses;
expiry/revocation alone is never evidence that retained facts can end.

The private read-only `launch_retention_field_context_v1(uuid,bigint)` defaults
to unavailable. Its `fieldPurposes` projection uses literal `table.column` paths
from the owning relations, not caller-selected columns. Each leaf is a complete
structured verified/unavailable proof with opaque evidence reference, exact
generation/epoch/project/source/schema/key/scope binding and fixed live-purpose
codes. Empty lists, booleans, source absence, a timeout, and a review date cannot
establish that proof. Unknown/malformed/stale leaves retain the affected facts;
real item-wide holds/references stop all affected work.

| Owning facts | Independent end / minimal indivisible cohort |
| --- | --- |
| Compact delivery | Provider reference, claim token/outcome/time, terminal observation time and handoff time can each end independently. Signup/handoff/item identity, outcome and generation/epoch are the row's exact reconciliation/no-resend cohort. Its row ends only when every remaining fact ends; unknown/pending retains its unresolved handoff cohort. |
| Legacy provenance | Obsolete legacy time and keyed match can end separately after the mapping source is no longer live and protected mapping/replay purposes have ended. Legacy UUID, disposition linkage and outcome remain the row locator/ownership cohort until all its mapping/replay purposes end. A still-present source cannot lose its mapping. |
| Authority/completion | Expanded writer, evidence, source/schema/scope, restore-reference and result facts have separate leaves on the same consumed row. Opaque approval reference, operation, consumed state, epoch and item linkage are the minimal anti-replay cohort. A real monotonic epoch invalidation plus ended dependent purposes/references is needed to remove an old marker; token expiry is insufficient. |
| Import context | Transaction/backend/authority/scope and mapping references are one transaction-ownership cohort. Newly created real importer contexts record their actual PostgreSQL runtime/backend provenance. Retirement additionally requires authoritative committed/aborted transaction status, owning locks and ended references. Unknown/restored runtime provenance remains review, including coincidentally reused XIDs/PIDs. No PID age estimate. |
| Matching/links | Hash-only withdrawal lookup and keyed suppression are separate row cohorts. Current intake still needs suppression with zero legacy rows. Every older live key representation remains necessary. Usable links remain; retiring a link needs explicit ended purposes, a safe retired route, closed possible late handoffs and independently known last ACTUAL send at least 30 days ago. Settlement observation time is not a send clock. |
| Disposition ledger | Its matching/key/withdrawal/decision-scope cohort ends only after every representation depending on it ends. The remaining opaque operation/generation/epoch cohort is independent. It is not permission to retain ended optional decision metadata or recreate matching facts. Control, monotonic deployment epoch and owner-installed fingerprint are not subscriber erasure targets. |

`minimized_fields` records actual one-way erasure; it is not evidence or approval.
Guards prevent clearing that metadata or refilling erased values. No new provider
or claim digest is substituted. Before exact comparison facts end, old exact,
idempotent and terminal callback behavior remains. After a required comparison
fact genuinely ends, the existing four-argument Boolean finish returns false for
that comparison. It cannot acknowledge lost facts, repopulate the field, change
terminal outcome, reconstruct a signup or authorize another send. Unresolved
handoffs never become settled through minimization.

Raw unknown-consent behavior is unchanged. After raw removal, consent stays
unknown; separately verified withdrawal/necessity/reference/restore purposes,
not fabricated recorded consent, govern receipt/marker ends.

## New-RPC partial outcomes and deadlines

For these two new operations only, `outcome:review` with positive `writes` means
eligible leaves were minimized transactionally while other leaf assessments
remain unresolved. It is partial progress, not complete retirement or all-copy
erasure. `minimized` means currently eligible work completed while positively
needed facts can remain; `retained` has no writes. Unknown touched leaves do not
mutate. Every positive operation advances/fences the owning generation and binds
and consumes the exact authority as appropriate; replay cannot recount writes.
The later Task5 caller must classify review/positive-writes as partial.

`retired` means the assessed matching representation has ended; an independently
needed opaque operation cohort can still remain. Optional decision metadata ends
separately. After actual epoch invalidation and independently proven complete
closure of every remaining cohort, the final approval is consumed and its now
unneeded completion removed in that transaction. Replaying/reinserting the exact
old tuple cannot act on a missing work object. The purpose-end decision precedes
removal; missing source rows do not establish it. Restoring older state still
requires complete independently current coverage. Sparse retired work remains
unavailable without genuine protected context; no missing consent, key, withdrawal
time or external proof is fabricated from the snapshot.

Authority/item association is itself owning evidence. Retention completions bind
their actual opaque work ID. Unknown/shared historical import or restore scopes
must not be guessed into a single-item association; they stay private review until
real ownership/reference assessment is available. The test-only owner association
of a historical restore receipt is not a production linking/approval adapter.

Ruling9: the trusted caller must establish a real 1..5000ms statement deadline
BEFORE dispatching each mutation command. The SQL setting check is admission
only: an inline `set_config`, function-local setting or Boolean cannot prove an
armed timer. Do not change global role/default timeouts or add new deadline
requirements to old import/restore/finish callers. Use one item transaction at a
time. In-body cancellation/lock failures roll back writes and release acquired
resources with a sanitized zero-write refusal; the real transport must separately
sanitize connection loss and cancellation outside that body. Production transport
binding and actual hosted HTTP acceptance remain open.

## Independent restoration — quarantine first

Externally disable sending/cleanup and isolate the restore target before loading
data. Keep it fenced with `restore_required` set; a restored snapshot's own
canonical flag, function, verified result or authority cannot establish safety.
Neither migration installation nor old `disposalAllowed:false` import authority
grants retention/replay authority.

The existing restore/mode consumer keeps its public tuple/shape. After outer
fence and selected authority/control locks, and before reopening or consuming
approval, it invokes:

`private.launch_retention_restore_coverage_v1(approval_ref,scope,epoch) -> jsonb`

This read-only hook defaults unavailable. A real adapter must independently read
the current source namespace/head and hold a genuine stable handoff/fence/barrier
through activation. It must bind the selected restore-purpose approval and exact
project/reviewed source/schema/fingerprint/target scope/epoch and that authority's
snapshot/replay/coverage references. It must provide canonical bigint-string
current/covered watermarks, matching current/covered heads, complete sorted unique
live/covered key generations and the complete current replay manifest digest.
An opaque coverage reference is insufficient.

The deterministic replay manifest covers all required suppression, usable links,
disposition generations, necessary exact handoffs, consumed-operation/replay
facts, provenance, import contexts, raw launch safety references and older key
representations. It excludes raw addresses/payloads/keys and the selected local
restore approval. Matching counts or loops over only snapshot-existing items do
not establish completeness. The actual locally applied state must match the
whole independently current digest, including identities entirely missing from
the snapshot. Missing/partial/stale/tampered/self-certified/older-key coverage
keeps the target quarantined and the authority unconsumed.

The hook is a TRUSTED integration boundary. SQL cannot prove that owner-forged
JSON is external or that a claimed barrier actually exists, just as reading a
timeout GUC cannot prove timer arming. The default body remains unavailable;
production adapter, barrier ownership, replay transport and operational acceptance
are uncompleted requirements. No public setter or general importer ships.

Current coverage does not settle unknown/pending deliveries. They still block
delivery readiness and cannot resend. After verified coverage and settled
readiness, restore deterministically rebases surviving item generations by one
step and catches receipts up to the new target epoch under the same fence. It
does not alter handoff identity/outcome or invent settlement. The private mode
implementation needs owner execution for that narrow rebase; its public facade
remains invoker/service-only and no ledger DML grant is added. Non-restore mode,
import and finish paths receive no new external-proof prerequisite.

Local tests use a second genuinely owned network-isolated PostgreSQL clone, an
older synthetic dump, a newer independently owned source held under its actual
outer fence, owner-only synthetic proof binding, and exact replay transport.
Those tests are not production external evidence or a deployed integration.

## Provider, mailbox, export, backup and operator copies

Database minimization is not all-copy erasure. Track each actual copy boundary
separately: provider messages/events, shared mailbox content, exports/downloads,
logs, backups/PITR and operator-held copies. For each affected copy record the
owner, exact necessary identifiers, access, narrow purpose/basis, end condition,
requested operation and independently verified completion/remaining restriction.
Keep beta/account/shared active messages outside launch-only cleanup.

No provider API, mailbox adapter, backup purge or export inventory is invented.
An unavailable adapter is an uncompleted requirement, never a successful no-op or
zero-count proof. Synthetic database tests contact no mailbox/provider and prove
no off-database disposal. Private evidence itself has separate purpose ends.

## Stop, rollback and deployment limits

Stop claims and cleanup first while keeping suppression, usable links, unknown
handoffs and restore fences. Preserve compatible compact-finish/readiness paths;
fence launch if older code cannot read them. Do not restore disposed raw facts to
make old code run. Rollback cannot undo disposal. Beta and account paths remain
usable; local tests exercise the stopped launch path plus compatible finish/beta
without raw replay.

Nothing here authorizes hosted SQL, migration push/reset, sending, live disposal,
keys, cron, deployment, legal publication or store activation. Future ordered
website migrations and compatible consumers must be separately accepted against
the exact cumulative production source. No app/EAS/native change, Edge Function,
secret or App Store metadata/privacy-label update is required by this SQL-only
website contract. Physical current/retained iOS and Android browser/contact/
deep-link QA and real provider/operator/restore/HTTP acceptance remain required.
