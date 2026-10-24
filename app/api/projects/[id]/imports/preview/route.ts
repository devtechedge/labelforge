import { AppError } from "@/lib/errors";
import { assertSameOrigin, apiOk, handleApiError } from "@/lib/api";
import { LIMITS } from "@/domain/limits";
import { requireProjectApi } from "@/repositories/api-access";
import { createImportPreview } from "@/services/imports";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request);
    const { id } = await params;
    const access = await requireProjectApi(id);

    const declaredLength = Number(request.headers.get("content-length") ?? "0");
    if (declaredLength > LIMITS.fileBytes + 1024 * 1024) {
      throw new AppError(
        "PAYLOAD_TOO_LARGE",
        `Uploads are limited to ${LIMITS.fileBytes / (1024 * 1024)} MB.`,
        413,
      );
    }

    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      throw new AppError("VALIDATION_FAILED", "Choose a file to upload.", 422);
    }
    if (file.size > LIMITS.fileBytes) {
      throw new AppError(
        "PAYLOAD_TOO_LARGE",
        `This deployment accepts files up to ${LIMITS.fileBytes / (1024 * 1024)} MB.`,
        413,
      );
    }

    const formatValue = String(formData.get("format") ?? "").toUpperCase();
    if (formatValue && formatValue !== "CSV" && formatValue !== "JSONL") {
      throw new AppError("UNSUPPORTED_FORMAT", "Choose CSV or JSONL.", 415);
    }
    const delimiterValue = String(formData.get("delimiter") ?? ",");
    if (![",", ";", "\t"].includes(delimiterValue)) {
      throw new AppError("VALIDATION_FAILED", "Choose a supported delimiter.", 422);
    }
    const idFieldRaw = String(formData.get("idField") ?? "").trim();
    if (idFieldRaw.length > 80) {
      throw new AppError("VALIDATION_FAILED", "Identity field names must be 80 characters or fewer.", 422);
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const batch = await createImportPreview({
      user: access.user,
      workspaceId: access.project.workspaceId,
      projectId: access.project.id,
      roles: access.roles,
      fileName: file.name || "upload",
      bytes,
      format: formatValue ? (formatValue as "CSV" | "JSONL") : undefined,
      options: {
        delimiter: delimiterValue as "," | ";" | "\t",
        ...(idFieldRaw ? { idField: idFieldRaw } : {}),
      },
    });

    return apiOk({ batch }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
