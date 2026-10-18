# Website launch retention: retirement, restore and copies

Local Task4 mechanics only. Website Sydney project `yohiumlrpfdhphsnnxxw`;
never the native app database. Production cleanup, sending and scheduling remain
OFF. Installing SQL is not operational approval. Real fact, field, restore,
transport and copy adapters remain unavailable; no issuer, proof setter, general
replay importer or force switch is supplied.

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
binding and actual HTTP acceptance remain open.

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
