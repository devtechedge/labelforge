import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ProjectChrome } from "@/components/project/ProjectChrome";
import { SchemaBuilder } from "@/components/SchemaBuilder";
import {
  ApplySchemaButton,
  GenerateTasksPanel,
  PublishSchemaButton,
} from "@/components/SchemaAdmin";
import { StatusBadge } from "@/components/StatusBadge";
import { Forbidden } from "@/components/Forbidden";
import { requireProjectPage } from "@/auth/project-page";
import { isManager } from "@/auth/permissions";
import { getProjectOverview, getRecentDatasetFields } from "@/services/projects";
import { listSchemaVersions } from "@/services/schemas";
import { parseAnnotationSchema, schemaTypeLabel } from "@/domain/schema";
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = {
  title: "Annotation schema",
};

export default async function SchemaPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string; projectId: string }>;
  searchParams: Promise<{ published?: string }>;
}) {
  const { workspaceId, projectId } = await params;
  const query = await searchParams;
  const access = await requireProjectPage(workspaceId, projectId);
  if (!isManager(access.roles)) {
    return (
      <Forbidden
        title="Managers define schemas"
        body="Your roles do not include schema administration. Ask a manager or workspace owner."
        backHref={`/workspaces/${workspaceId}/projects/${projectId}`}
      />
    );
  }

  const [overview, schemas, sampleFields] = await Promise.all([
    getProjectOverview(projectId),
    listSchemaVersions(projectId),
    getRecentDatasetFields(projectId),
  ]);
  if (!overview) notFound();

  const versions = overview.project.dataset?.versions ?? [];
  const publishedSchemas = schemas
    .filter((schema) => schema.status === "PUBLISHED")
    .map((schema) => ({ id: schema.id, versionNumber: schema.versionNumber }));

  return (
    <ProjectChrome
      workspaceId={workspaceId}
      workspaceName={access.workspace.name}
      projectId={projectId}
      projectName={access.project.name}
      projectStatus={access.project.status}
      annotationMode={access.project.annotationMode}
      roles={access.roles}
      description={access.project.description}
    >
      <div className="stack-lg">
        {query.published ? (
          <div className="success-note" role="status">
            Schema published. You can now generate tasks from a dataset version.
          </div>
        ) : null}
        <div className="stack">
          <p className="eyebrow">Immutable question set</p>
          <h2 className="display-md">Schema versions</h2>
          <p className="lede small">
            A schema version never changes after creation. Publishing makes it
            available for task generation. Existing tasks keep the exact version
            they were created with.
          </p>
        </div>

        <section className="card card-pad stack">
          <div className="spread">
            <div>
              <p className="eyebrow">Generate work</p>
              <h3 className="display-sm">Create tasks from a dataset version</h3>
            </div>
          </div>
          {versions.length === 0 ? (
            <p className="notice notice-warning small">
              Commit a dataset version in Import before generating tasks.
            </p>
          ) : (
            <GenerateTasksPanel
              projectId={projectId}
              schemas={publishedSchemas}
              datasetVersions={versions.map((version) => ({
                id: version.id,
                versionNumber: version.versionNumber,
                recordCount: version.recordCount,
              }))}
            />
          )}
        </section>

        <section className="stack">
          <div className="spread">
            <div>
              <p className="eyebrow">History</p>
              <h2 className="display-sm">All versions</h2>
            </div>
            <p className="small muted">{schemas.length} versions</p>
          </div>
          {schemas.length === 0 ? (
            <p className="small muted">
              No schema exists yet. Create the first draft below.
            </p>
          ) : (
            <div className="stack">
              {schemas.map((schema) => {
                const parsed = parseAnnotationSchema(schema.schemaJson);
                const fieldCount = parsed.ok ? parsed.schema.fields.length : 0;
                const fieldSummary = parsed.ok
                  ? parsed.schema.fields
                      .map((field) => `${field.label} (${schemaTypeLabel(field.type)})`)
                      .join(", ")
                  : "Unreadable schema";
                return (
                  <article className="card card-pad stack" key={schema.id}>
                    <div className="spread">
                      <div>
                        <p className="eyebrow">Schema v{schema.versionNumber}</p>
                        <h3 className="display-sm">
                          {parsed.ok ? parsed.schema.title : "Unreadable schema"}
                        </h3>
                      </div>
                      <div className="cluster">
                        <StatusBadge
                          status={schema.status}
                        />
                        {schema.status === "DRAFT" ? (
                          <PublishSchemaButton
                            projectId={projectId}
                            schemaVersionId={schema.id}
                            versionNumber={schema.versionNumber}
                            afterPublishHref={`/workspaces/${workspaceId}/projects/${projectId}/schema?published=1`}
                          />
                        ) : (
                          <ApplySchemaButton
                            projectId={projectId}
                            schemaVersionId={schema.id}
                            versionNumber={schema.versionNumber}
                          />
                        )}
                      </div>
                    </div>
                    <div className="meta-row">
                      <span>{fieldCount} fields</span>
                      <span>{schema._count.tasks} tasks</span>
                      <span>{schema._count.annotations} annotations</span>
                      <span>Created {formatDateTime(schema.createdAt)}</span>
                      <span>By {schema.createdBy.displayName}</span>
                    </div>
                    <p className="small muted">{fieldSummary}</p>
                    <details className="panel panel-pad">
                      <summary className="field-label" style={{ cursor: "pointer" }}>
                        Inspect schema JSON
                      </summary>
                      <pre
                        className="code-card"
                        style={{ marginTop: "0.7rem", maxHeight: "24rem" }}
                      >
                        {JSON.stringify(schema.schemaJson, null, 2)}
                      </pre>
                    </details>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <SchemaBuilder projectId={projectId} sampleFields={sampleFields} />
      </div>
    </ProjectChrome>
  );
}
