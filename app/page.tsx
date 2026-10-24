import Link from "next/link";

import { PublicFooter } from "@/components/PublicFooter";
import { PublicHeader } from "@/components/PublicHeader";
import { env } from "@/lib/env";

export default function LandingPage() {
  const demoHref = env.DEMO_MODE ? "/login" : "/signup";

  return (
    <>
      <PublicHeader />
      <main id="main-content">
        <section className="hero">
          <div className="container hero-grid">
            <div className="hero-copy">
              <p className="eyebrow">Annotation workflow infrastructure</p>
              <h1 className="display-lg">
                Raw records in.
                <br />
                Reviewed evidence out.
              </h1>
              <p className="lede">
                LabelForge is a collaborative workbench for text and structured
                data. Import a file, pin an immutable schema, assign real work,
                resolve disagreement, and publish a dataset with a manifest you
                can verify.
              </p>
              <div className="hero-actions">
                <Link className="btn btn-primary" href={demoHref}>
                  {env.DEMO_MODE ? "Open the demo workspace" : "Create a workspace"}
                </Link>
                <a className="btn btn-secondary" href="#workflow">
                  See the workflow
                </a>
              </div>
              <p className="hero-note">
                Open source / PostgreSQL / no model provider required
              </p>
            </div>

            <div className="workflow-preview" aria-hidden="true">
              <div className="preview-top">
                <div>
                  <p className="eyebrow">Annotation task</p>
                  <p className="mono" style={{ marginTop: "0.35rem" }}>
                    R-1042 · queue 03 of 12
                  </p>
                </div>
                <span className="badge status-in-review">In review</span>
              </div>
              <div className="preview-record">
                <p className="record-meta">review_text · synthetic sample</p>
                <p>
                  The invoice shows a duplicate charge from last month. Support
                  fixed it quickly, but I had to explain the issue twice.
                </p>
              </div>
              <div className="preview-labels">
                <div className="preview-label selected">
                  <span>Category</span>
                  <span className="mono">billing</span>
                </div>
                <div className="preview-label selected">
                  <span>Sentiment</span>
                  <span className="mono">negative</span>
                </div>
                <div className="preview-label">
                  <span>Severity</span>
                  <span className="mono">medium</span>
                </div>
              </div>
              <div className="preview-footer">
                <span>Schema v2 pinned</span>
                <span>Revision 4 · saved</span>
              </div>
            </div>
          </div>
        </section>

        <div className="container">
          <div className="panel-pad" style={{ borderTop: "1px solid var(--line-strong)", borderBottom: "1px solid var(--line)", borderRadius: 0 }}>
            <div className="meta-row" style={{ justifyContent: "space-between" }}>
              <span>CSV and JSONL import</span>
              <span>Server-enforced assignment</span>
              <span>Revision-checked autosave</span>
              <span>Schema-pinned answers</span>
              <span>Checksummed releases</span>
            </div>
          </div>
        </div>

        <section className="section" id="workflow">
          <div className="container">
            <div className="section-head">
              <p className="eyebrow">The workflow</p>
              <h2 className="display-md">An auditable path from file to release</h2>
              <p className="lede">
                Every step is stored, scoped to a workspace, and visible in the
                audit trail. There is no hidden AI step and no fabricated
                productivity score.
              </p>
            </div>
            <div className="steps">
              <div className="step">
                <p className="step-number">01</p>
                <h3>Import and validate</h3>
                <p>
                  Parse real bytes, preview row errors, quarantine duplicates, and
                  commit only when the result is explicit.
                </p>
              </div>
              <div className="step">
                <p className="step-number">02</p>
                <h3>Pin a schema</h3>
                <p>
                  Publish an immutable annotation schema. Tasks keep the version
                  they started with.
                </p>
              </div>
              <div className="step">
                <p className="step-number">03</p>
                <h3>Assign and annotate</h3>
                <p>
                  Managers assign eligible annotators. Drafts autosave with an
                  expected revision.
                </p>
              </div>
              <div className="step">
                <p className="step-number">04</p>
                <h3>Review or adjudicate</h3>
                <p>
                  Accept, return, reject, or send a disagreement to a reasoned
                  final answer.
                </p>
              </div>
              <div className="step">
                <p className="step-number">05</p>
                <h3>Release with proof</h3>
                <p>
                  Freeze accepted or adjudicated work into a versioned export with
                  SHA-256 checksums.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="section" style={{ background: "rgba(251, 248, 241, 0.55)", borderBlock: "1px solid var(--line)" }}>
          <div className="container split">
            <div className="stack-lg">
              <div className="stack">
                <p className="eyebrow">Built for the awkward parts</p>
                <h2 className="display-md">The form is easy. The record integrity is not.</h2>
                <p className="lede">
                  LabelForge treats concurrency, schema drift, and disagreement as
                  first-class product states instead of edge cases.
                </p>
              </div>
              <div className="grid-2">
                <article className="feature-card">
                  <h3>Optimistic concurrency</h3>
                  <p>
                    Every draft write carries an expected revision. A stale editor
                    gets a conflict, never a silent overwrite.
                  </p>
                </article>
                <article className="feature-card">
                  <h3>Immutable schema versions</h3>
                  <p>
                    Answers are interpreted under the schema pinned to the task.
                    New schemas apply only through explicit, audited actions.
                  </p>
                </article>
                <article className="feature-card">
                  <h3>Honest agreement measures</h3>
                  <p>
                    Cohen&apos;s kappa, average Jaccard, and span overlap are shown
                    with sample size, numerator, denominator, and limitations.
                  </p>
                </article>
                <article className="feature-card">
                  <h3>Reproducible releases</h3>
                  <p>
                    A release is a stored snapshot. The manifest records the
                    policy, counts, schema, and checksums used to verify it.
                  </p>
                </article>
              </div>
            </div>
            <div className="stack">
              <p className="eyebrow">A schema, not a prompt</p>
              <div className="code-card">
                {[
                  "{",
                  '  "kind": "labelforge.annotation-schema",',
                  '  "version": 1,',
                  '  "title": "Product review triage",',
                  '  "fields": [',
                  '    {',
                  '      "type": "single_select",',
                  '      "key": "category",',
                  '      "required": true,',
                  '      "options": ["bug", "billing", "praise"]',
                  "    }",
                  "  ]",
                  "}",
                ].map((line) => (
                  <div key={line}>{line}</div>
                ))}
              </div>
              <p className="small muted">
                Text fields, numbers, booleans, multi-select, and offset-checked
                text spans are supported. No arbitrary code execution.
              </p>
            </div>
          </div>
        </section>

        <section className="section" id="limits">
          <div className="container split">
            <div className="stack">
              <p className="eyebrow">Stated limits</p>
              <h2 className="display-md">Small enough to verify. Explicit by design.</h2>
              <p className="lede">
                The first release is deliberately constrained. Limits are
                enforced on the server and explained before upload, not hidden
                behind a truncated file.
              </p>
              <ul className="limit-list">
                <li>
                  <span>Upload per file</span>
                  <strong>4 MB</strong>
                </li>
                <li>
                  <span>Rows per import</span>
                  <strong>10,000</strong>
                </li>
                <li>
                  <span>Records per project</span>
                  <strong>25,000</strong>
                </li>
                <li>
                  <span>Preview staging lifetime</span>
                  <strong>1 hour</strong>
                </li>
                <li>
                  <span>Import formats</span>
                  <strong>CSV / JSONL</strong>
                </li>
                <li>
                  <span>External model calls</span>
                  <strong>None</strong>
                </li>
              </ul>
              <p className="small muted">
                Vercel Functions cap request bodies at 4.5 MB. LabelForge sets a
                4 MB application limit to leave room for multipart overhead. Host
                limits can change; the app states the limit it enforces.
              </p>
            </div>
            <div className="card card-pad stack">
              <p className="eyebrow">One release, one proof</p>
              <h3 className="display-sm">The manifest carries the claim.</h3>
              <div className="panel-pad inset">
                <p className="mono tiny" style={{ color: "var(--muted)" }}>
                  labelforge.release-manifest.v1
                </p>
                <p className="mono" style={{ marginTop: "0.6rem", overflowWrap: "anywhere" }}>
                  checksums.jsonlSha256
                  <br />
                  9f2c...a71d
                </p>
                <p className="mono" style={{ marginTop: "0.6rem" }}>
                  selectionPolicy
                  <br />
                  accepted_or_adjudicated_v1
                </p>
                <p className="mono" style={{ marginTop: "0.6rem" }}>
                  excludedCount · exclusions by reason
                </p>
              </div>
              <p className="small muted">
                Accepted work is included. Unresolved disagreement is excluded and
                counted. A release never mutates after publication.
              </p>
            </div>
          </div>
        </section>

        <section className="section" style={{ borderTop: "1px solid var(--line)" }}>
          <div className="container split" style={{ alignItems: "center" }}>
            <div className="stack">
              <p className="eyebrow">Start with real workflow</p>
              <h2 className="display-md">
                Open the demo, follow one record, publish one release.
              </h2>
              <p className="lede">
                The seeded workspace contains synthetic product reviews and
                support records, multiple roles, drafts, a correction, a
                disagreement, and a completed release.
              </p>
            </div>
            <div className="cluster">
              <Link className="btn btn-primary" href={demoHref}>
                {env.DEMO_MODE ? "Use a demo identity" : "Create an account"}
              </Link>
              <Link className="btn btn-secondary" href="/login">
                Sign in
              </Link>
            </div>
          </div>
        </section>
      </main>
      <PublicFooter />
    </>
  );
}
