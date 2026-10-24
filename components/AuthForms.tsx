"use client";

import Link from "next/link";

import { ActionForm } from "@/components/ActionForm";
import { SubmitButton } from "@/components/SubmitButton";
import {
  demoLoginAction,
  loginAction,
  signupAction,
} from "@/app/actions/auth";
import { acceptInvitationAction } from "@/app/actions/workspaces";

export function LoginForm({ next }: { next?: string }) {
  return (
    <ActionForm action={loginAction}>
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <div className="field">
        <label htmlFor="login-email">Email</label>
        <input
          className="input"
          id="login-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          maxLength={254}
        />
      </div>
      <div className="field">
        <label htmlFor="login-password">Password</label>
        <input
          className="input"
          id="login-password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          maxLength={200}
        />
      </div>
      <SubmitButton pendingLabel="Signing in...">Sign in</SubmitButton>
    </ActionForm>
  );
}

export function SignupForm({ next }: { next?: string }) {
  return (
    <ActionForm action={signupAction}>
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <div className="field">
        <label htmlFor="signup-name">Display name</label>
        <input
          className="input"
          id="signup-name"
          name="displayName"
          autoComplete="name"
          required
          minLength={2}
          maxLength={80}
        />
      </div>
      <div className="field">
        <label htmlFor="signup-email">Email</label>
        <input
          className="input"
          id="signup-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          maxLength={254}
        />
      </div>
      <div className="field">
        <label htmlFor="signup-password">Password</label>
        <input
          className="input"
          id="signup-password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={10}
          maxLength={200}
          aria-describedby="signup-password-hint"
        />
        <p className="field-hint" id="signup-password-hint">
          Use at least 10 characters. Passwords are stored as salted scrypt hashes.
        </p>
      </div>
      <SubmitButton pendingLabel="Creating account...">
        Create account
      </SubmitButton>
    </ActionForm>
  );
}

export function DemoLoginPanel() {
  return (
    <div className="demo-panel">
      <div>
        <p className="eyebrow">Demo workspace</p>
        <p className="small" style={{ marginTop: "0.35rem" }}>
          Synthetic records only. Use a one-click identity or the credentials
          below.
        </p>
      </div>
      <ActionForm action={demoLoginAction} className="demo-buttons">
        <SubmitButton
          className="btn btn-secondary btn-sm"
          name="role"
          value="owner"
          pendingLabel="Opening..."
        >
          Owner
        </SubmitButton>
        <SubmitButton
          className="btn btn-secondary btn-sm"
          name="role"
          value="manager"
          pendingLabel="Opening..."
        >
          Manager
        </SubmitButton>
        <SubmitButton
          className="btn btn-secondary btn-sm"
          name="role"
          value="reviewer"
          pendingLabel="Opening..."
        >
          Reviewer
        </SubmitButton>
        <SubmitButton
          className="btn btn-secondary btn-sm"
          name="role"
          value="annotator"
          pendingLabel="Opening..."
        >
          Annotator
        </SubmitButton>
      </ActionForm>
      <p className="field-hint">
        All demo accounts use the password <span className="mono">DemoPass!2026</span>.
        Owner: owner@labelforge.demo, reviewer: reviewer@labelforge.demo, annotator:
        maya@labelforge.demo.
      </p>
      <p className="field-hint">
        Demo sign-in is disabled unless the deployment explicitly enables it. It
        cannot impersonate non-demo accounts.
      </p>
    </div>
  );
}

export function AcceptInviteForm({ token }: { token: string }) {
  return (
    <ActionForm action={acceptInvitationAction}>
      <input type="hidden" name="token" value={token} />
      <SubmitButton pendingLabel="Joining workspace...">
        Join workspace
      </SubmitButton>
    </ActionForm>
  );
}

export function AuthSwitchLinks({
  mode,
  next,
}: {
  mode: "login" | "signup";
  next?: string;
}) {
  const suffix = next ? `?next=${encodeURIComponent(next)}` : "";
  if (mode === "login") {
    return (
      <p className="auth-switch">
        New to LabelForge? <Link href={`/signup${suffix}`}>Create an account</Link>
      </p>
    );
  }
  return (
    <p className="auth-switch">
      Already have an account? <Link href={`/login${suffix}`}>Sign in</Link>
    </p>
  );
}
