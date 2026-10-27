import type { Metadata } from "next";

import { PublicFooter } from "@/components/PublicFooter";
import { PublicHeader } from "@/components/PublicHeader";

export const metadata: Metadata = {
  title: "Privacy and retention",
};

export default function PrivacyPage() {
  return (
    <>
      <PublicHeader />
      <main id="main-content" className="page container-narrow prose">
        <div className="stack">
          <p className="eyebrow">Policy</p>
          <h1 className="display-md">Privacy and retention</h1>
          <p className="muted small">Last updated 25 October 2026.</p>
        </div>

        <section className="stack">
          <h2>What is stored</h2>
          <p className="lede small">
            Account details (name, email, salted password hash), workspace
            membership and roles, uploaded dataset records, annotation answers,
            review decisions, adjudication rationales, release snapshots, and audit
            events. Production request logs may contain IP addresses and request
            metadata.
          </p>
        </section>

        <section className="stack">
          <h2>Uploaded dataset content</h2>
          <p className="small">
            Imported records are stored in PostgreSQL as normalized JSON. LabelForge
            does not send records to an external model provider and does not
            require an AI service. Import previews are staging records and expire
            after one hour. Row-level error messages quote field names and error
            reasons, not full record bodies.
          </p>
          <p className="small">
            The public demo deployment contains synthetic product reviews and
            support cases. Do not upload confidential or personal data to the demo.
          </p>
        </section>

        <section className="stack">
          <h2>Cookies</h2>
          <p className="small">
            LabelForge sets one essential session cookie. It is HTTP-only, uses
            SameSite=Lax, and is marked Secure in production. There is no analytics
            or advertising cookie, and no third-party tracking script on the
            application.
          </p>
        </section>

        <section className="stack">
          <h2>Retention and deletion</h2>
          <ul className="limit-list">
            <li>
              <span>Import preview rows and errors</span>
              <strong>1 hour staging</strong>
            </li>
            <li>
              <span>Committed dataset versions and annotations</span>
              <strong>Until project deletion</strong>
            </li>
            <li>
              <span>Published releases</span>
              <strong>Until project deletion</strong>
            </li>
            <li>
              <span>Audit events</span>
              <strong>Until workspace deletion</strong>
            </li>
            <li>
              <span>Expired session rows</span>
              <strong>Not reused; revocable</strong>
            </li>
          </ul>
          <p className="small">
            Archiving a project is reversible and keeps its data. Permanent project
            deletion and workspace deletion remove their data, including records,
            annotations, releases, and audit events. Deletion cannot be undone. The
            operator may retain provider-level backups for a limited period as
            configured by the hosting provider.
          </p>
        </section>

        <section className="stack">
          <h2>Subprocessors</h2>
          <p className="small">
            This deployment uses Vercel for application hosting and function
            execution, and a hosted PostgreSQL provider for storage and backups.
            These providers process data on the operator&apos;s behalf. No separate
            analytics, email, or model provider is configured. Invitation links are
            displayed in the application for the owner to share; the application
            does not send invitation email.
          </p>
        </section>

        <section className="stack">
          <h2>Security limits</h2>
          <p className="small">
            LabelForge uses server-side workspace checks, hashed opaque session
            tokens, scrypt password hashing, rate limits, optimistic concurrency,
            and checksummed releases. No system is perfectly secure. This is not a
            security certification or a compliance guarantee. Report a concern to{" "}
            <a href="mailto:devtechedge@gmail.com">devtechedge@gmail.com</a>.
          </p>
        </section>

        <section className="stack">
          <h2>Requests</h2>
          <p className="small">
            Workspace owners can export data through release manifests and delete
            projects or workspaces. For other access or deletion requests, contact
            the operator at{" "}
            <a href="mailto:devtechedge@gmail.com">devtechedge@gmail.com</a>. Identity
            verification may be required.
          </p>
        </section>
      </main>
      <PublicFooter />
    </>
  );
}
