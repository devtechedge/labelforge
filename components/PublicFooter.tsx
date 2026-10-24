import Link from "next/link";

export function PublicFooter() {
  return (
    <footer className="public-footer">
      <div className="container">
        <p>
          LabelForge. Human annotation, explicit state, reproducible releases.
        </p>
        <nav className="footer-links" aria-label="Footer">
          <Link href="/terms">Terms</Link>
          <Link href="/privacy">Privacy and retention</Link>
          <Link href="/login">Sign in</Link>
        </nav>
      </div>
    </footer>
  );
}
