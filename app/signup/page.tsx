import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AuthShell } from "@/components/AuthShell";
import { AuthSwitchLinks, SignupForm } from "@/components/AuthForms";
import { getCurrentUser } from "@/auth/session";
import { safeNextPath } from "@/validation/requests";

export const metadata: Metadata = {
  title: "Create account",
};

export default async function SignupPage({
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
        <p className="eyebrow">New account</p>
        <h1>Open a workspace</h1>
        <p className="muted small">
          You can create or join a workspace after your account is open. Invited
          teammates keep the invitation link they were sent.
        </p>
      </div>
      <SignupForm next={next} />
      <AuthSwitchLinks mode="signup" next={next} />
    </AuthShell>
  );
}
