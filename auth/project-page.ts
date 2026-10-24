import "server-only";

import { notFound } from "next/navigation";

import { requirePageUser } from "@/auth/session";
import { getProjectAccess, type ProjectAccess } from "@/repositories/access";

export async function requireProjectPage(
  workspaceId: string,
  projectId: string,
): Promise<ProjectAccess> {
  const user = await requirePageUser();
  const access = await getProjectAccess(user, workspaceId, projectId);
  if (!access) notFound();
  return access;
}
