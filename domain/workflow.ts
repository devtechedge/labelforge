import type { AnnotationStatus, TaskStatus } from "@/generated/prisma/enums";

export const TASK_STATUS_ORDER: TaskStatus[] = [
  "UNASSIGNED",
  "ASSIGNED",
  "IN_PROGRESS",
  "SUBMITTED",
  "IN_REVIEW",
  "RETURNED_FOR_CORRECTION",
  "DISPUTED",
  "ADJUDICATION",
  "ACCEPTED",
  "REJECTED",
  "RESOLVED",
];

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  UNASSIGNED: "Unassigned",
  ASSIGNED: "Assigned",
  IN_PROGRESS: "In progress",
  SUBMITTED: "Submitted",
  IN_REVIEW: "In review",
  ACCEPTED: "Accepted",
  RETURNED_FOR_CORRECTION: "Returned for correction",
  REJECTED: "Rejected",
  DISPUTED: "Disputed",
  ADJUDICATION: "Adjudication",
  RESOLVED: "Resolved",
};

export const ANNOTATION_STATUS_LABELS: Record<AnnotationStatus, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Submitted",
  ACCEPTED: "Accepted",
  RETURNED_FOR_CORRECTION: "Returned for correction",
  REJECTED: "Rejected",
  DISPUTED: "Disputed",
};

export function isFinalTaskStatus(status: TaskStatus): boolean {
  return status === "ACCEPTED" || status === "RESOLVED" || status === "REJECTED";
}

export function deriveTaskStatus(input: {
  annotations: Array<{ status: AnnotationStatus }>;
  requiredAnnotations: number;
  hasAdjudication: boolean;
}): TaskStatus {
  if (input.hasAdjudication) return "RESOLVED";
  const statuses = input.annotations
    .map((annotation) => annotation.status)
    .filter((status) => status !== "DRAFT");

  if (statuses.includes("DISPUTED")) return "DISPUTED";
  if (statuses.includes("RETURNED_FOR_CORRECTION")) return "RETURNED_FOR_CORRECTION";

  const accepted = statuses.filter((status) => status === "ACCEPTED").length;
  if (accepted >= input.requiredAnnotations) return "ACCEPTED";

  const rejected = statuses.filter((status) => status === "REJECTED").length;
  if (rejected >= input.requiredAnnotations) return "REJECTED";

  if (statuses.length === 0) return "IN_PROGRESS";

  const exhausted =
    statuses.length >= input.requiredAnnotations &&
    statuses.every(
      (status) => status === "ACCEPTED" || status === "REJECTED",
    );
  if (exhausted) return "REJECTED";
  if (statuses.some((status) => status === "ACCEPTED" || status === "REJECTED")) {
    return "IN_REVIEW";
  }
  if (
    statuses.filter((status) => status === "SUBMITTED" || status === "ACCEPTED")
      .length >= input.requiredAnnotations
  ) {
    return "IN_REVIEW";
  }
  if (statuses.includes("SUBMITTED")) return "SUBMITTED";
  return "IN_PROGRESS";
}
