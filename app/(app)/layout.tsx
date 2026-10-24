import { AppHeader } from "@/components/AppHeader";
import { requirePageUser } from "@/auth/session";

export default async function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requirePageUser();
  return (
    <>
      <AppHeader user={user} />
      {children}
    </>
  );
}
