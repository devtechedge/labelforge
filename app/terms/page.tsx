import type { Metadata } from "next";

import { PublicFooter } from "@/components/PublicFooter";
import { PublicHeader } from "@/components/PublicHeader";

export const metadata: Metadata = {
  title: "Terms of use",
};

export default function TermsPage() {
  return (
    <>
      <PublicHeader />
      <main id="main-content" className="page container-narrow prose">
        <div className="stack">
          <p className="eyebrow">Policy</p>
          <h1 className="display-md">Terms of use</h1>
          <p className="muted small">Last updated 25 October 2026.</p>
        </div>

        <section className="stack">
          <h2>What this service is</h2>
          <p className="lede small">
            LabelForge is a software workbench for importing structured records,
            collecting human annotations, reviewing submissions, and exporting
            dataset releases. A public demo deployment contains synthetic data and
            is provided for evaluation.
          </p>
        </section>

        <section className="stack">
          <h2>Accounts and workspaces</h2>
          <p className="small">
            You must provide accurate account information and keep your password
            confidential. Workspace owners control membership and may remove
            members or delete a workspace. You are responsible for activity under
            your account. Do not share invitation links with people who are not the
            intended recipient; invitations are bound to the invited email address.
          </p>
        </section>

        <section className="stack">
          <h2>Your content</h2>
          <p className="small">
            You keep ownership of the records you upload and the annotations you
            create. You grant the operator of this deployment permission to store,
            process, display, review, export, and delete that content as needed to
            provide the service. You must have the right to upload the content and
            must not upload content that is unlawful or that you are not permitted
            to process.
          </p>
        </section>

        <section className="stack">
          <h2>Acceptable use</h2>
          <p className="small">
            Do not attempt to access another workspace, bypass authorization,
            overload the service, upload malware, or use the service to make
            decisions that require regulated professional advice. Do not use the
            demo for confidential or personal data.
          </p>
        </section>

        <section className="stack">
          <h2>Availability and changes</h2>
          <p className="small">
            This is an early first release. Features and limits may change.
            Release limits are stated in the interface and documentation before
            upload. The operator may suspend the service for maintenance or to
            address abuse. There is no guarantee of uninterrupted availability.
          </p>
        </section>

        <section className="stack">
          <h2>Liability</h2>
          <p className="small">
            The software is provided on an as-is basis to the extent permitted by
            law. The operator is not liable for indirect or consequential loss, or
            for decisions made using exported data. This page is a plain-language
            product policy, not a certification of legal compliance.
          </p>
        </section>

        <section className="stack">
          <h2>Contact</h2>
          <p className="small">
            Questions about these terms:{" "}
            <a href="mailto:devtechedge@gmail.com">devtechedge@gmail.com</a>.
          </p>
        </section>
      </main>
      <PublicFooter />
    </>
  );
}
