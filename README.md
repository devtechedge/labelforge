# LabelForge

A collaborative, auditable data annotation workbench for text and structured records.

LabelForge turns raw CSV and JSONL into reviewed, versioned datasets. It is being built in public in this repository. The complete setup, architecture, workflow, and verification documentation will land here before the first release.

Planned first-release capabilities:

- Bounded CSV and JSONL import with row-level validation and preview before commit.
- Immutable annotation schema versions.
- Server-enforced task assignment for single- and multi-annotator projects.
- A keyboard-accessible annotation workbench with revision-checked autosave.
- Review, correction, disagreement detection, and adjudication.
- Agreement measures reported with their numerator, denominator, and limits.
- Immutable dataset releases with deterministic exports and SHA-256 manifests.

License: MIT. See `LICENSE`.
