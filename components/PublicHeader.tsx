import Link from "next/link";

import { Brand } from "@/components/Brand";
import { getCurrentUser } from "@/auth/session";

export async function PublicHeader() {
  const user = await getCurrentUser();

  return (
    <header className="public-header">
      <div className="container">
        <Brand href={user ? "/workspaces" : "/"} />
        <nav className="public-nav" aria-label="Primary">
          <Link href="/#workflow" className="nav-secondary">
            How it works
          </Link>
          <Link href="/#limits" className="nav-secondary">
            Limits
          </Link>
          {user ? (
            <Link className="btn btn-secondary btn-sm" href="/workspaces">
              Open workspaces
            </Link>
          ) : (
            <>
              <Link href="/login" className="nav-secondary">
                Sign in
              </Link>
              <Link className="btn btn-primary btn-sm" href="/signup">
                Create account
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
