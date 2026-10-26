# ADR 0001: Annotation integrity and reproducible releases

- Status: Accepted
- Date: 2026-10-27

## Context

Annotation work is easy to lose. A draft can be overwritten by a stale browser tab, a schema can change under a task that is already half answered, two reviewers can decide the same submission, and a dataset export can silently change after it was published. LabelForge treats those failures as product states rather than operational accidents.

The first release is deliberately limited to text and structured records, a single PostgreSQL database, and a Vercel deployment. It has no model provider, object store, queue, or multi-service backend.

## Decisions

### Immutable schema versions

A schema version is written once with a monotonically increasing version number. Publishing changes only the status and publication metadata. Tasks reference an exact schema version. Answers are validated against that version, not against whatever schema is currently latest.

Applying a newer schema is an explicit manager action limited to tasks that have no saved answers and a status of Unassigned or Assigned. Tasks with any annotation history stay pinned. The action is audited and returns the number of moved tasks.

Consequences: old answers remain interpretable; managers cannot silently rewrite history; re-annotation requires a new task or a deliberate migration policy that this release does not implement.

### Optimistic concurrency for drafts

Every annotation carries a revision. A draft write includes the revision the client last observed. The service locks the task row, verifies that the annotator still has an active assignment and that the task is editable, then updates only when the stored revision matches. A mismatch returns a conflict with the current revision and status.

Submission follows the same rule. A submission key makes retries idempotent. A duplicate key returns the existing submission instead of creating another record. A stale revision cannot overwrite a newer draft or submission.

Consequences: editors must handle conflicts explicitly. The workbench shows a conflict banner and requires a reload rather than overwriting another person's work.

### Annotation and review separation

Annotations and reviews are separate records. A review stores the reviewer, decision, feedback, and the annotation revision observed. A reviewer cannot decide their own annotation. A decision is accepted only while the annotation is submitted and still at the observed revision. Review history is append-only; returning work lets the annotator edit and resubmit without erasing the earlier decision.

Task status is derived from annotation outcomes and required annotation counts. Adjudication is separate from review. A disputed task must enter Adjudication before a final answer can be recorded. The adjudication stores the final answer, rationale, chosen evidence, and expected task version, then moves the task to Resolved.

Consequences: review cannot masquerade as editing; duplicate and stale decisions are rejected; every final answer has an accountable reviewer or adjudicator.

### Agreement measures with limits

Single-select fields use Cohen's kappa on pairs of non-draft annotations. Multi-select fields use average Jaccard. Text spans use label-aware overlap with a 0.5 intersection-over-union matched-span rule. The product requires at least five comparable pairs before reporting a value, and refuses to report chance agreement when expected agreement is degenerate.

Every metric exposes its numerator, denominator, sample size, skipped missing values, metric definition, and limitations. Text, number, boolean, and structured fields have no invented metric. Resolved adjudications are excluded from the agreement sample because the task is no longer measuring independent disagreement.

Consequences: small samples show Insufficient comparable annotations. The numbers describe this project sample and are not a model quality claim.

### Immutable release snapshots

Publishing a release selects accepted tasks whose required accepted annotations agree, plus resolved adjudications. The release stores one snapshot row per record with source identity, source order, normalized record data, final answer, provenance, and content hash. The manifest stores the dataset and schema versions, selection policy, counts, exclusions, checksums, and export contract.

The release version is allocated under a project row lock in a serializable transaction. Exports re-render rows in deterministic source order. JSONL uses canonical JSON with sorted object keys. CSV has a deterministic column set, CRLF rows, quoted text, and formula-injection protection. The export endpoint recomputes both representations and refuses to send them if either checksum differs from the published value.

Consequences: changing an annotation after publication cannot change an existing release. A new release is a deliberate new snapshot. A release can be larger than the original source records because no mutability is hidden.

## Rejected alternatives

- Editable schema JSON: would reinterpret completed answers and destroy reproducibility.
- Last-write-wins drafts: would lose work and hide conflicts.
- A single combined annotation and review record: would erase the reviewer's independent decision and the revision they observed.
- Releasing by querying live annotations at download time: would make a published release mutable.
- Storing exports only in object storage: adds a provider dependency before the first release needs one. PostgreSQL snapshots are bounded by the import limits.
- Reporting agreement for every field type: would create plausible but meaningless numbers.

## Operational consequences

Import previews are staging data and expire. Opportunistic maintenance removes old previews, expired sessions, and old rate-limit buckets. Committed records, releases, and audit events remain until their project or workspace is deleted. The demo is synthetic and writable. The production budget assumes the Vercel free tier and Neon free tier, with a 4 MB application upload cap below Vercel's 4.5 MB function payload limit.
