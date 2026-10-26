-- DropForeignKey
ALTER TABLE "Adjudication" DROP CONSTRAINT "Adjudication_schemaVersionId_fkey";

-- DropForeignKey
ALTER TABLE "Annotation" DROP CONSTRAINT "Annotation_schemaVersionId_fkey";

-- DropForeignKey
ALTER TABLE "AnnotationTask" DROP CONSTRAINT "AnnotationTask_schemaVersionId_fkey";

-- DropForeignKey
ALTER TABLE "DatasetRelease" DROP CONSTRAINT "DatasetRelease_schemaVersionId_fkey";

-- DropForeignKey
ALTER TABLE "ReleaseItem" DROP CONSTRAINT "ReleaseItem_taskId_fkey";

-- AddForeignKey
ALTER TABLE "AnnotationTask" ADD CONSTRAINT "AnnotationTask_schemaVersionId_fkey" FOREIGN KEY ("schemaVersionId") REFERENCES "AnnotationSchemaVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Annotation" ADD CONSTRAINT "Annotation_schemaVersionId_fkey" FOREIGN KEY ("schemaVersionId") REFERENCES "AnnotationSchemaVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Adjudication" ADD CONSTRAINT "Adjudication_schemaVersionId_fkey" FOREIGN KEY ("schemaVersionId") REFERENCES "AnnotationSchemaVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DatasetRelease" ADD CONSTRAINT "DatasetRelease_schemaVersionId_fkey" FOREIGN KEY ("schemaVersionId") REFERENCES "AnnotationSchemaVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReleaseItem" ADD CONSTRAINT "ReleaseItem_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "AnnotationTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
