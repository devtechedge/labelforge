import type { AnnotationStatus, TaskStatus } from "@/generated/prisma/enums";
import {
  ANNOTATION_STATUS_LABELS,
  TASK_STATUS_LABELS,
} from "@/domain/workflow";

type Status =
  | TaskStatus
  | AnnotationStatus
  | "EXPIRED"
  | "COMMITTED"
  | "PREVIEW_READY"
  | "ARCHIVED"
  | "PUBLISHED";

const EXTRA_LABELS: Record<string, string> = {
  EXPIRED: "Expired",
  COMMITTED: "Committed",
  PREVIEW_READY: "Preview ready",
  ARCHIVED: "Archived",
  PUBLISHED: "Published",
};

export function StatusBadge({ status }: { status: Status | string }) {
  const label =
    TASK_STATUS_LABELS[status as TaskStatus] ??
    ANNOTATION_STATUS_LABELS[status as AnnotationStatus] ??
    EXTRA_LABELS[status] ??
    status;
  const className = status.toLowerCase().replaceAll("_", "-");

  return (
    <span className={`badge status-${className}`}>
      {label}
    </span>
  );
}
