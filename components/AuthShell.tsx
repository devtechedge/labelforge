import Link from "next/link";

import { Brand } from "@/components/Brand";
import { ThemeToggle } from "@/components/ThemeToggle";

export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth-layout">
      <aside className="auth-aside">
        <Brand href="/" />
        <div className="stack">
          <p className="eyebrow" style={{ color: "#c6bbae" }}>
            Collaborative data annotation
          </p>
          <p className="auth-quote">
            A label is a claim. A reviewed label is <em>evidence</em>.
          </p>
          <p className="small" style={{ color: "#d8cec0", maxWidth: "34ch" }}>
            LabelForge keeps the record, the schema, the reviewer decision, and the
            published dataset tied together.
          </p>
        </div>
        <div className="auth-aside-meta">
          <span>PostgreSQL-backed workflow</span>
          <span>Schema-pinned annotations</span>
          <span>Immutable release manifests</span>
        </div>
      </aside>
      <main id="main-content" className="auth-main">
        <div className="auth-theme">
          <ThemeToggle />
        </div>
        <div className="auth-form-wrap">
          {children}
          <p className="auth-switch">
            <Link href="/">Back to product overview</Link>
          </p>
        </div>
      </main>
    </div>
  );
}
