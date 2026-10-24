import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AuthShell } from "@/components/AuthShell";
import {
  AuthSwitchLinks,
  DemoLoginPanel,
  LoginForm,
} from "@/components/AuthForms";
import { getCurrentUser } from "@/auth/session";
import { env } from "@/lib/env";
import { safeNextPath } from "@/validation/requests";

export const metadata: Metadata = {
  title: "Sign in",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;
  const user = await getCurrentUser();
  const next = params.next ? safeNextPath(params.next) : undefined;

  if (user) redirect(next ?? "/workspaces");

  return (
    <AuthShell>
      <div className="stack">
        <p className="eyebrow">Welcome back</p>
        <h1>Sign in to the workbench</h1>
        <p className="muted small">
          Sessions are stored as hashed tokens. Sign-in attempts are rate limited.
        </p>
      </div>
      <LoginForm next={next} />
      <AuthSwitchLinks mode="login" next={next} />
      {env.DEMO_MODE ? <DemoLoginPanel /> : null}
    </AuthShell>
  );
}
