import Link from "next/link";

import { PublicFooter } from "@/components/PublicFooter";
import { PublicHeader } from "@/components/PublicHeader";
import { env } from "@/lib/env";

const capabilities = [
  { key: "01", label: "CSV and JSONL import" },
  { key: "02", label: "Server-enforced assignment" },
  { key: "03", label: "Revision-checked autosave" },
  { key: "04", label: "Schema-pinned answers" },
  { key: "05", label: "Checksummed releases" },
];

const steps = [
  {
    number: "01",
    title: "Import and validate",
    body: "Parse real bytes, preview row errors, quarantine duplicates, and commit only when the result is explicit.",
  },
  {
    number: "02",
    title: "Pin a schema",
    body: "Publish an immutable annotation schema. Tasks keep the version they started with.",
  },
  {
    number: "03",
    title: "Assign and annotate",
    body: "Managers assign eligible annotators. Drafts autosave with an expected revision.",
  },
  {
    number: "04",
    title: "Review or adjudicate",
    body: "Accept, return, reject, or send a disagreement to a reasoned final answer.",
  },
  {
    number: "05",
    title: "Release with proof",
    body: "Freeze accepted or adjudicated work into a versioned export with SHA-256 checksums.",
  },
];

const features = [
  {
    index: "01",
    title: "Optimistic concurrency",
    body: "Every draft write carries an expected revision. A stale editor gets a conflict, never a silent overwrite.",
  },
  {
    index: "02",
    title: "Immutable schema versions",
    body: "Answers are interpreted under the schema pinned to the task. New schemas apply only through explicit, audited actions.",
  },
  {
    index: "03",
    title: "Honest agreement measures",
    body: "Cohen's kappa, average Jaccard, and span overlap are shown with sample size, numerator, denominator, and limitations.",
  },
  {
    index: "04",
    title: "Reproducible releases",
    body: "A release is a stored snapshot. The manifest records the policy, counts, schema, and checksums used to verify it.",
  },
];

const limits = [
  ["Upload per file", "4 MB"],
  ["Rows per import", "10,000"],
  ["Records per project", "25,000"],
  ["Preview staging lifetime", "1 hour"],
  ["Import formats", "CSV / JSONL"],
  ["External model calls", "None"],
];

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
                Reviewed <em>evidence</em> out.
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
              <p className="hero-facts">
                <span>Open source</span>
                <span>PostgreSQL</span>
                <span>No model provider required</span>
              </p>
            </div>

            <div className="hero-artifact" aria-hidden="true">
              <div className="artifact-frame">
                <div className="artifact-topbar">
                  <span className="artifact-dots">
                    <i />
                    <i />
                    <i />
                  </span>
                  <span className="artifact-label">Labelforge / workbench</span>
                  <span className="artifact-id">R-1042</span>
                </div>
                <div className="artifact-body">
                  <div className="artifact-record">
                    <p className="artifact-kicker">review_text / synthetic sample</p>
                    <p className="artifact-text">
                      The invoice shows a <mark>duplicate charge</mark> from last
                      month. Support fixed it quickly, but I had to explain the
                      issue twice.
                    </p>
                  </div>
                  <div className="artifact-answers">
                    <div className="artifact-answer is-selected">
                      <span>Category</span>
                      <strong>billing</strong>
                    </div>
                    <div className="artifact-answer is-selected">
                      <span>Sentiment</span>
                      <strong>negative</strong>
                    </div>
                    <div className="artifact-answer">
                      <span>Severity</span>
                      <strong>medium</strong>
                    </div>
                  </div>
                </div>
                <div className="artifact-footer">
                  <span>Schema v2 pinned</span>
                  <span>Revision 4 / saved</span>
                </div>
              </div>
              <p className="artifact-caption">
                Illustrative task state, not live data
              </p>
            </div>
          </div>

          <div className="container">
            <div className="capability-band">
              {capabilities.map((item) => (
                <div className="capability" key={item.key}>
                  <span className="capability-key">{item.key}</span>
                  <span>{item.label}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="section" id="workflow">
          <div className="container">
            <div className="section-head">
              <p className="eyebrow">The workflow</p>
              <h2 className="display-md">An auditable path from file to release</h2>
              <p className="section-lede">
                Every step is stored, scoped to a workspace, and visible in the
                audit trail. There is no hidden AI step and no fabricated
                productivity score.
              </p>
            </div>
            <ol className="steps">
              {steps.map((step) => (
                <li className="step" key={step.number}>
                  <p className="step-number">{step.number}</p>
                  <h3>{step.title}</h3>
                  <p>{step.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="section section-tinted">
          <div className="container">
            <div className="section-head split-head">
              <div>
                <p className="eyebrow">Built for the awkward parts</p>
                <h2 className="display-md">
                  The form is easy. The record integrity is not.
                </h2>
              </div>
              <p className="section-aside">
                LabelForge treats concurrency, schema drift, and disagreement as
                first-class product states instead of edge cases.
              </p>
            </div>

            <div className="feature-layout">
              <div className="feature-grid">
                {features.map((feature) => (
                  <article className="feature-card" key={feature.index}>
                    <p className="feature-index">{feature.index} / record</p>
                    <h3>{feature.title}</h3>
                    <p>{feature.body}</p>
                  </article>
                ))}
              </div>

              <aside className="schema-artifact" aria-label="Example schema">
                <div className="artifact-topbar">
                  <span className="artifact-label">schema.json</span>
                  <span className="artifact-id">v1 / immutable</span>
                </div>
                <pre className="code-block">
                  <code>
                    <span className="code-line">{"{"}</span>
                    <span className="code-line">
                      {"  "}
                      <span className="tok-key">&quot;kind&quot;</span>
                      {": "}
                      <span className="tok-string">
                        &quot;labelforge.annotation-schema&quot;
                      </span>
                      {","}
                    </span>
                    <span className="code-line">
                      {"  "}
                      <span className="tok-key">&quot;version&quot;</span>
                      {": "}
                      <span className="tok-number">1</span>
                      {","}
                    </span>
                    <span className="code-line">
                      {"  "}
                      <span className="tok-key">&quot;title&quot;</span>
                      {": "}
                      <span className="tok-string">
                        &quot;Product review triage&quot;
                      </span>
                      {","}
                    </span>
                    <span className="code-line">
                      {"  "}
                      <span className="tok-key">&quot;fields&quot;</span>
                      {": ["}
                    </span>
                    <span className="code-line">{"    {"}</span>
                    <span className="code-line">
                      {"      "}
                      <span className="tok-key">&quot;type&quot;</span>
                      {": "}
                      <span className="tok-string">&quot;single_select&quot;</span>
                      {","}
                    </span>
                    <span className="code-line">
                      {"      "}
                      <span className="tok-key">&quot;key&quot;</span>
                      {": "}
                      <span className="tok-string">&quot;category&quot;</span>
                      {","}
                    </span>
                    <span className="code-line">
                      {"      "}
                      <span className="tok-key">&quot;required&quot;</span>
                      {": "}
                      <span className="tok-number">true</span>
                      {","}
                    </span>
                    <span className="code-line">
                      {"      "}
                      <span className="tok-key">&quot;options&quot;</span>
                      {": ["}
                      <span className="tok-string">&quot;bug&quot;</span>
                      {", "}
                      <span className="tok-string">&quot;billing&quot;</span>
                      {", "}
                      <span className="tok-string">&quot;praise&quot;</span>
                      {"]"}
                    </span>
                    <span className="code-line">{"    }"}</span>
                    <span className="code-line">{"  ]"}</span>
                    <span className="code-line">{"}"}</span>
                  </code>
                </pre>
                <p className="schema-cap">
                  Text fields, numbers, booleans, multi-select, and offset-checked
                  text spans are supported. No arbitrary code execution.
                </p>
              </aside>
            </div>
          </div>
        </section>

        <section className="section" id="limits">
          <div className="container spec-layout">
            <div>
              <p className="eyebrow">Stated limits</p>
              <h2 className="display-md">
                Small enough to verify. Explicit by design.
              </h2>
              <p className="lede" style={{ marginTop: "0.9rem" }}>
                The first release is deliberately constrained. Limits are enforced
                on the server and explained before upload, not hidden behind a
                truncated file.
              </p>
              <div className="spec-list">
                {limits.map(([label, value]) => (
                  <div className="spec-row" key={label}>
                    <span>{label}</span>
                    <strong>{value}</strong>
                  </div>
                ))}
              </div>
              <p className="spec-note">
                Vercel Functions cap request bodies at 4.5 MB. LabelForge sets a
                4 MB application limit to leave room for multipart overhead. Host
                limits can change; the app states the limit it enforces.
              </p>
            </div>

            <aside className="manifest-card" aria-label="Example release manifest">
              <div className="manifest-head">
                <span>One release, one proof</span>
                <span className="manifest-stamp">Immutable</span>
              </div>
              <div className="manifest-body">
                <p className="manifest-title">
                  The manifest carries the claim.
                </p>
                <dl style={{ margin: 0, display: "grid", gap: "0.8rem" }}>
                  <div className="manifest-row">
                    <dt className="manifest-key">format</dt>
                    <dd className="manifest-value">labelforge.release-manifest.v1</dd>
                  </div>
                  <div className="manifest-row">
                    <dt className="manifest-key">checksums.jsonlSha256</dt>
                    <dd className="manifest-value">computed at publish</dd>
                  </div>
                  <div className="manifest-row">
                    <dt className="manifest-key">selectionPolicy</dt>
                    <dd className="manifest-value">accepted_or_adjudicated_v1</dd>
                  </div>
                  <div className="manifest-row">
                    <dt className="manifest-key">counts</dt>
                    <dd className="manifest-value">
                      included and excluded, by task
                    </dd>
                  </div>
                  <div className="manifest-row">
                    <dt className="manifest-key">lineage</dt>
                    <dd className="manifest-value">
                      dataset version / schema version
                    </dd>
                  </div>
                </dl>
              </div>
              <p className="manifest-foot">
                Fields shown structurally; values are produced at publish time.
                Accepted work is included. Unresolved disagreement is excluded and
                counted. A release never mutates after publication.
              </p>
            </aside>
          </div>
        </section>

        <section className="container" aria-labelledby="start-title">
          <div className="cta-band">
            <div>
              <p className="eyebrow">Start with real workflow</p>
              <h2 id="start-title">
                Open the demo, follow one record, publish one release.
              </h2>
              <p>
                The seeded workspace contains synthetic product reviews and support
                records, multiple roles, drafts, a correction, a disagreement, and a
                completed release.
              </p>
            </div>
            <div className="cta-actions">
              <Link className="btn btn-on-dark" href={demoHref}>
                {env.DEMO_MODE ? "Use a demo identity" : "Create an account"}
              </Link>
              <Link className="btn btn-outline-dark" href="/login">
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
