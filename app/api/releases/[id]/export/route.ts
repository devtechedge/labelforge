import { apiOk, handleApiError } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { requireApiUser } from "@/auth/session";
import { buildReleaseBundle } from "@/exports/bundle";
import type { ReleaseManifest } from "@/exports/snapshot";
import {
  getReleaseExport,
  recordExportAudit,
  verifyReleaseIntegrity,
} from "@/services/releases";

export const runtime = "nodejs";

function safeSlug(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 50) || "project"
  );
}

function streamText(text: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      const chunkSize = 64 * 1024;
      for (let offset = 0; offset < text.length; offset += chunkSize) {
        controller.enqueue(encoder.encode(text.slice(offset, offset + chunkSize)));
      }
      controller.close();
    },
  });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireApiUser();
    const { id } = await params;
    const format = new URL(request.url).searchParams.get("format") ?? "bundle";
    if (!["bundle", "csv", "jsonl", "manifest"].includes(format)) {
      throw new AppError(
        "VALIDATION_FAILED",
        "Choose bundle, csv, jsonl, or manifest.",
        422,
      );
    }

    const { release, items } = await getReleaseExport(user, id);
    const { jsonl, csv } = verifyReleaseIntegrity(release, items);
    const base = `labelforge-${safeSlug(release.project.name)}-release-${release.versionNumber}`;

    await recordExportAudit({
      user,
      workspaceId: release.project.workspaceId,
      releaseId: release.id,
      format,
    });

    const headers: Record<string, string> = {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    };

    if (format === "manifest") {
      return apiOk({ manifest: release.manifest, items: items.length });
    }

    if (format === "bundle") {
      const bundle = buildReleaseBundle({
        manifest: release.manifest as unknown as ReleaseManifest,
        jsonl,
        csv,
      });
      return new Response(new Uint8Array(bundle), {
        headers: {
          ...headers,
          "Content-Type": "application/zip",
          "Content-Disposition": `attachment; filename="${base}.zip"`,
        },
      });
    }

    if (format === "csv") {
      return new Response(streamText(csv), {
        headers: {
          ...headers,
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${base}.csv"`,
        },
      });
    }

    return new Response(streamText(jsonl), {
      headers: {
        ...headers,
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Content-Disposition": `attachment; filename="${base}.jsonl"`,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
