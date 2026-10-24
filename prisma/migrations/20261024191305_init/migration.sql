-- CreateEnum
CREATE TYPE "WorkspaceRole" AS ENUM ('OWNER', 'MANAGER', 'REVIEWER', 'ANNOTATOR');

-- CreateEnum
CREATE TYPE "WorkspaceStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('INVITED', 'ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "InvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "AnnotationMode" AS ENUM ('SINGLE', 'MULTI');

-- CreateEnum
CREATE TYPE "FileFormat" AS ENUM ('CSV', 'JSONL');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('PREVIEW_READY', 'COMMITTED', 'EXPIRED', 'FAILED');

-- CreateEnum
CREATE TYPE "SchemaStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('UNASSIGNED', 'ASSIGNED', 'IN_PROGRESS', 'SUBMITTED', 'IN_REVIEW', 'ACCEPTED', 'RETURNED_FOR_CORRECTION', 'REJECTED', 'DISPUTED', 'ADJUDICATION', 'RESOLVED');

-- CreateEnum
CREATE TYPE "AssignmentStatus" AS ENUM ('ACTIVE', 'RELEASED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "AnnotationStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'ACCEPTED', 'RETURNED_FOR_CORRECTION', 'REJECTED', 'DISPUTED');

-- CreateEnum
CREATE TYPE "ReviewDecision" AS ENUM ('PASS', 'RETURN_FOR_CORRECTION', 'REJECT', 'REQUEST_ADJUDICATION');

-- CreateEnum
CREATE TYPE "ReleaseStatus" AS ENUM ('PUBLISHED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "disabledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Workspace" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "status" "WorkspaceStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Membership" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roles" "WorkspaceRole"[],
    "status" "MembershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invitation" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "roles" "WorkspaceRole"[],
    "tokenHash" TEXT NOT NULL,
    "status" "InvitationStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "inviterId" TEXT NOT NULL,
    "acceptedById" TEXT,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "ProjectStatus" NOT NULL DEFAULT 'ACTIVE',
    "annotationMode" "AnnotationMode" NOT NULL DEFAULT 'SINGLE',
    "annotationsPerTask" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Dataset" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "currentVersionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Dataset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DatasetVersion" (
    "id" TEXT NOT NULL,
    "datasetId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "format" "FileFormat" NOT NULL,
    "sourceFileName" TEXT NOT NULL,
    "sourceChecksum" TEXT NOT NULL,
    "contentChecksum" TEXT NOT NULL,
    "recordCount" INTEGER NOT NULL,
    "importedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DatasetVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DatasetRecord" (
    "id" TEXT NOT NULL,
    "datasetVersionId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "sourceOrder" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "contentHash" TEXT NOT NULL,

    CONSTRAINT "DatasetRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnnotationSchemaVersion" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "schemaJson" JSONB NOT NULL,
    "status" "SchemaStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMP(3),
    "publishedById" TEXT,

    CONSTRAINT "AnnotationSchemaVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnnotationTask" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "datasetVersionId" TEXT NOT NULL,
    "datasetRecordId" TEXT NOT NULL,
    "schemaVersionId" TEXT NOT NULL,
    "status" "TaskStatus" NOT NULL DEFAULT 'UNASSIGNED',
    "version" INTEGER NOT NULL DEFAULT 0,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "requiredAnnotations" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnnotationTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskAssignment" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "AssignmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "assignedById" TEXT NOT NULL,
    "exclusiveSlot" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "TaskAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Annotation" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "annotatorId" TEXT NOT NULL,
    "schemaVersionId" TEXT NOT NULL,
    "answer" JSONB NOT NULL,
    "status" "AnnotationStatus" NOT NULL DEFAULT 'DRAFT',
    "revision" INTEGER NOT NULL DEFAULT 0,
    "submissionKey" TEXT,
    "lastSavedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Annotation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Review" (
    "id" TEXT NOT NULL,
    "annotationId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "decision" "ReviewDecision" NOT NULL,
    "feedback" TEXT,
    "observedRevision" INTEGER NOT NULL,
    "dedupeKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Adjudication" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "adjudicatorId" TEXT NOT NULL,
    "schemaVersionId" TEXT NOT NULL,
    "finalAnswer" JSONB NOT NULL,
    "rationale" TEXT NOT NULL,
    "chosenAnnotationId" TEXT,
    "expectedTaskVersion" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Adjudication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DatasetRelease" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "datasetVersionId" TEXT NOT NULL,
    "schemaVersionId" TEXT NOT NULL,
    "selectionPolicy" TEXT NOT NULL,
    "recordCount" INTEGER NOT NULL,
    "annotationCount" INTEGER NOT NULL,
    "excludedCount" INTEGER NOT NULL,
    "checksum" TEXT NOT NULL,
    "csvChecksum" TEXT NOT NULL,
    "manifest" JSONB NOT NULL,
    "status" "ReleaseStatus" NOT NULL DEFAULT 'PUBLISHED',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMP(3),

    CONSTRAINT "DatasetRelease_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReleaseItem" (
    "id" TEXT NOT NULL,
    "releaseId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "datasetRecordId" TEXT,
    "taskId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "answer" JSONB NOT NULL,
    "provenance" JSONB NOT NULL,
    "contentHash" TEXT NOT NULL,

    CONSTRAINT "ReleaseItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportBatch" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "format" "FileFormat" NOT NULL,
    "sourceChecksum" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "status" "ImportStatus" NOT NULL DEFAULT 'PREVIEW_READY',
    "parseOptions" JSONB NOT NULL,
    "totalRows" INTEGER NOT NULL,
    "validRows" INTEGER NOT NULL,
    "invalidRows" INTEGER NOT NULL,
    "duplicateRows" INTEGER NOT NULL,
    "normalizationNotes" JSONB,
    "errorsTruncated" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "committedAt" TIMESTAMP(3),
    "committedVersionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportBatchRow" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "sourceId" TEXT,
    "data" JSONB,
    "valid" BOOLEAN NOT NULL,
    "errorCode" TEXT,

    CONSTRAINT "ImportBatchRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportRowError" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "field" TEXT,
    "code" TEXT NOT NULL,
    "message" TEXT NOT NULL,

    CONSTRAINT "ImportRowError_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateLimitBucket" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "RateLimitBucket_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_disabledAt_idx" ON "User"("disabledAt");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Workspace_slug_key" ON "Workspace"("slug");

-- CreateIndex
CREATE INDEX "Workspace_ownerId_idx" ON "Workspace"("ownerId");

-- CreateIndex
CREATE INDEX "Membership_userId_status_idx" ON "Membership"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_workspaceId_userId_key" ON "Membership"("workspaceId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Invitation_tokenHash_key" ON "Invitation"("tokenHash");

-- CreateIndex
CREATE INDEX "Invitation_workspaceId_status_idx" ON "Invitation"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "Invitation_email_status_idx" ON "Invitation"("email", "status");

-- CreateIndex
CREATE INDEX "Invitation_expiresAt_idx" ON "Invitation"("expiresAt");

-- CreateIndex
CREATE INDEX "Project_workspaceId_status_idx" ON "Project"("workspaceId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Project_workspaceId_name_key" ON "Project"("workspaceId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Dataset_projectId_key" ON "Dataset"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "Dataset_currentVersionId_key" ON "Dataset"("currentVersionId");

-- CreateIndex
CREATE INDEX "DatasetVersion_datasetId_createdAt_idx" ON "DatasetVersion"("datasetId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DatasetVersion_datasetId_versionNumber_key" ON "DatasetVersion"("datasetId", "versionNumber");

-- CreateIndex
CREATE INDEX "DatasetRecord_datasetVersionId_sourceOrder_idx" ON "DatasetRecord"("datasetVersionId", "sourceOrder");

-- CreateIndex
CREATE UNIQUE INDEX "DatasetRecord_datasetVersionId_sourceId_key" ON "DatasetRecord"("datasetVersionId", "sourceId");

-- CreateIndex
CREATE INDEX "AnnotationSchemaVersion_projectId_status_idx" ON "AnnotationSchemaVersion"("projectId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AnnotationSchemaVersion_projectId_versionNumber_key" ON "AnnotationSchemaVersion"("projectId", "versionNumber");

-- CreateIndex
CREATE INDEX "AnnotationTask_projectId_status_idx" ON "AnnotationTask"("projectId", "status");

-- CreateIndex
CREATE INDEX "AnnotationTask_projectId_priority_idx" ON "AnnotationTask"("projectId", "priority");

-- CreateIndex
CREATE INDEX "AnnotationTask_schemaVersionId_idx" ON "AnnotationTask"("schemaVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "AnnotationTask_datasetRecordId_schemaVersionId_key" ON "AnnotationTask"("datasetRecordId", "schemaVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskAssignment_exclusiveSlot_key" ON "TaskAssignment"("exclusiveSlot");

-- CreateIndex
CREATE INDEX "TaskAssignment_taskId_status_idx" ON "TaskAssignment"("taskId", "status");

-- CreateIndex
CREATE INDEX "TaskAssignment_userId_status_idx" ON "TaskAssignment"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Annotation_submissionKey_key" ON "Annotation"("submissionKey");

-- CreateIndex
CREATE INDEX "Annotation_taskId_status_idx" ON "Annotation"("taskId", "status");

-- CreateIndex
CREATE INDEX "Annotation_annotatorId_status_idx" ON "Annotation"("annotatorId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Annotation_taskId_annotatorId_schemaVersionId_key" ON "Annotation"("taskId", "annotatorId", "schemaVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "Review_dedupeKey_key" ON "Review"("dedupeKey");

-- CreateIndex
CREATE INDEX "Review_annotationId_createdAt_idx" ON "Review"("annotationId", "createdAt");

-- CreateIndex
CREATE INDEX "Review_taskId_createdAt_idx" ON "Review"("taskId", "createdAt");

-- CreateIndex
CREATE INDEX "Adjudication_adjudicatorId_createdAt_idx" ON "Adjudication"("adjudicatorId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Adjudication_taskId_key" ON "Adjudication"("taskId");

-- CreateIndex
CREATE INDEX "DatasetRelease_projectId_createdAt_idx" ON "DatasetRelease"("projectId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DatasetRelease_projectId_versionNumber_key" ON "DatasetRelease"("projectId", "versionNumber");

-- CreateIndex
CREATE INDEX "ReleaseItem_releaseId_idx" ON "ReleaseItem"("releaseId");

-- CreateIndex
CREATE UNIQUE INDEX "ReleaseItem_releaseId_position_key" ON "ReleaseItem"("releaseId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "ReleaseItem_releaseId_sourceId_key" ON "ReleaseItem"("releaseId", "sourceId");

-- CreateIndex
CREATE INDEX "AuditEvent_workspaceId_createdAt_idx" ON "AuditEvent"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_action_idx" ON "AuditEvent"("action");

-- CreateIndex
CREATE INDEX "ImportBatch_projectId_createdAt_idx" ON "ImportBatch"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "ImportBatch_workspaceId_status_idx" ON "ImportBatch"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "ImportBatch_expiresAt_idx" ON "ImportBatch"("expiresAt");

-- CreateIndex
CREATE INDEX "ImportBatchRow_batchId_valid_idx" ON "ImportBatchRow"("batchId", "valid");

-- CreateIndex
CREATE UNIQUE INDEX "ImportBatchRow_batchId_rowNumber_key" ON "ImportBatchRow"("batchId", "rowNumber");

-- CreateIndex
CREATE INDEX "ImportRowError_batchId_rowNumber_idx" ON "ImportRowError"("batchId", "rowNumber");

-- CreateIndex
CREATE INDEX "RateLimitBucket_windowStart_idx" ON "RateLimitBucket"("windowStart");

-- CreateIndex
CREATE UNIQUE INDEX "RateLimitBucket_key_windowStart_key" ON "RateLimitBucket"("key", "windowStart");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Workspace" ADD CONSTRAINT "Workspace_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_inviterId_fkey" FOREIGN KEY ("inviterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_acceptedById_fkey" FOREIGN KEY ("acceptedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dataset" ADD CONSTRAINT "Dataset_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dataset" ADD CONSTRAINT "Dataset_currentVersionId_fkey" FOREIGN KEY ("currentVersionId") REFERENCES "DatasetVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DatasetVersion" ADD CONSTRAINT "DatasetVersion_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "Dataset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DatasetVersion" ADD CONSTRAINT "DatasetVersion_importedById_fkey" FOREIGN KEY ("importedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DatasetRecord" ADD CONSTRAINT "DatasetRecord_datasetVersionId_fkey" FOREIGN KEY ("datasetVersionId") REFERENCES "DatasetVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnnotationSchemaVersion" ADD CONSTRAINT "AnnotationSchemaVersion_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnnotationSchemaVersion" ADD CONSTRAINT "AnnotationSchemaVersion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnnotationSchemaVersion" ADD CONSTRAINT "AnnotationSchemaVersion_publishedById_fkey" FOREIGN KEY ("publishedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnnotationTask" ADD CONSTRAINT "AnnotationTask_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnnotationTask" ADD CONSTRAINT "AnnotationTask_datasetVersionId_fkey" FOREIGN KEY ("datasetVersionId") REFERENCES "DatasetVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnnotationTask" ADD CONSTRAINT "AnnotationTask_datasetRecordId_fkey" FOREIGN KEY ("datasetRecordId") REFERENCES "DatasetRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnnotationTask" ADD CONSTRAINT "AnnotationTask_schemaVersionId_fkey" FOREIGN KEY ("schemaVersionId") REFERENCES "AnnotationSchemaVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskAssignment" ADD CONSTRAINT "TaskAssignment_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "AnnotationTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskAssignment" ADD CONSTRAINT "TaskAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskAssignment" ADD CONSTRAINT "TaskAssignment_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Annotation" ADD CONSTRAINT "Annotation_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "AnnotationTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Annotation" ADD CONSTRAINT "Annotation_annotatorId_fkey" FOREIGN KEY ("annotatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Annotation" ADD CONSTRAINT "Annotation_schemaVersionId_fkey" FOREIGN KEY ("schemaVersionId") REFERENCES "AnnotationSchemaVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_annotationId_fkey" FOREIGN KEY ("annotationId") REFERENCES "Annotation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "AnnotationTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Adjudication" ADD CONSTRAINT "Adjudication_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "AnnotationTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Adjudication" ADD CONSTRAINT "Adjudication_adjudicatorId_fkey" FOREIGN KEY ("adjudicatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Adjudication" ADD CONSTRAINT "Adjudication_schemaVersionId_fkey" FOREIGN KEY ("schemaVersionId") REFERENCES "AnnotationSchemaVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Adjudication" ADD CONSTRAINT "Adjudication_chosenAnnotationId_fkey" FOREIGN KEY ("chosenAnnotationId") REFERENCES "Annotation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DatasetRelease" ADD CONSTRAINT "DatasetRelease_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DatasetRelease" ADD CONSTRAINT "DatasetRelease_schemaVersionId_fkey" FOREIGN KEY ("schemaVersionId") REFERENCES "AnnotationSchemaVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DatasetRelease" ADD CONSTRAINT "DatasetRelease_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReleaseItem" ADD CONSTRAINT "ReleaseItem_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "DatasetRelease"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReleaseItem" ADD CONSTRAINT "ReleaseItem_datasetRecordId_fkey" FOREIGN KEY ("datasetRecordId") REFERENCES "DatasetRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReleaseItem" ADD CONSTRAINT "ReleaseItem_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "AnnotationTask"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportBatch" ADD CONSTRAINT "ImportBatch_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportBatch" ADD CONSTRAINT "ImportBatch_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportBatch" ADD CONSTRAINT "ImportBatch_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportBatchRow" ADD CONSTRAINT "ImportBatchRow_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ImportBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportRowError" ADD CONSTRAINT "ImportRowError_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ImportBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
