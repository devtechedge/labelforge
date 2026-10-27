import Link from "next/link";

import { Brand } from "@/components/Brand";

export function PublicFooter() {
  return (
    <footer className="public-footer">
      <div className="container footer-grid">
        <div className="footer-brand">
          <Brand />
          <p>
            Human annotation, explicit state, reproducible releases. The record,
            the schema, and the decision stay tied together.
          </p>
        </div>
        <div className="footer-col">
          <p className="footer-head">Product</p>
          <Link href="/#workflow">How it works</Link>
          <Link href="/#limits">Limits</Link>
          <Link href="/login">Demo workspace</Link>
        </div>
        <div className="footer-col">
          <p className="footer-head">Account</p>
          <Link href="/signup">Create account</Link>
          <Link href="/login">Sign in</Link>
          <Link href="/workspaces">Workspaces</Link>
        </div>
        <div className="footer-col">
          <p className="footer-head">Policy</p>
          <Link href="/terms">Terms of use</Link>
          <Link href="/privacy">Privacy and retention</Link>
          <a href="https://github.com/devtechedge/labelforge">Source code</a>
        </div>
      </div>
      <div className="container footer-base">
        <span>LabelForge / annotation workflow infrastructure</span>
        <span>Built with Next.js, PostgreSQL, and Prisma</span>
      </div>
    </footer>
  );
}
