import { z } from "zod";

export const idSchema = z.string().min(5).max(64);

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("Enter a valid email address.")
  .max(254);

export const displayNameSchema = z
  .string()
  .trim()
  .min(2, "Use at least 2 characters.")
  .max(80, "Use 80 characters or fewer.");

export const passwordSchema = z
  .string()
  .min(10, "Use at least 10 characters.")
  .max(200, "Use 200 characters or fewer.");

export const workspaceNameSchema = z
  .string()
  .trim()
  .min(2, "Use at least 2 characters.")
  .max(80, "Use 80 characters or fewer.");

export const projectNameSchema = z
  .string()
  .trim()
  .min(2, "Use at least 2 characters.")
  .max(120, "Use 120 characters or fewer.");

export const projectDescriptionSchema = z
  .string()
  .trim()
  .max(1000, "Use 1,000 characters or fewer.")
  .default("");

export const workspaceCreateSchema = z.object({
  name: workspaceNameSchema,
});

export const invitationCreateSchema = z.object({
  email: emailSchema,
  roles: z
    .array(z.enum(["MANAGER", "REVIEWER", "ANNOTATOR"]))
    .min(1, "Choose at least one role.")
    .max(3),
});

export const projectCreateSchema = z
  .object({
    workspaceId: idSchema,
    name: projectNameSchema,
    description: projectDescriptionSchema,
    annotationMode: z.enum(["SINGLE", "MULTI"]),
    annotationsPerTask: z.number().int().min(1).max(3).default(1),
  })
  .superRefine((value, ctx) => {
    if (value.annotationMode === "SINGLE" && value.annotationsPerTask !== 1) {
      ctx.addIssue({
        code: "custom",
        path: ["annotationsPerTask"],
        message: "Single-annotator projects require exactly one annotation.",
      });
    }
    if (value.annotationMode === "MULTI" && value.annotationsPerTask < 2) {
      ctx.addIssue({
        code: "custom",
        path: ["annotationsPerTask"],
        message: "Multi-annotator projects need at least two annotations.",
      });
    }
  });

export const projectUpdateSchema = z.object({
  projectId: idSchema,
  annotationMode: z.enum(["SINGLE", "MULTI"]),
  annotationsPerTask: z.number().int().min(1).max(3),
});

export const assignmentSchema = z.object({
  taskIds: z.array(idSchema).min(1).max(100),
  userIds: z.array(idSchema).min(1).max(10),
});

export const reassignmentSchema = z.object({
  taskIds: z.array(idSchema).min(1).max(100),
  userId: idSchema,
});

export const draftSaveSchema = z.object({
  answer: z.record(z.string(), z.unknown()),
  expectedRevision: z.number().int().min(0),
});

export const submitSchema = z.object({
  expectedRevision: z.number().int().min(0),
  submissionKey: z.string().min(8).max(100),
});

export const reviewSchema = z.object({
  decision: z.enum([
    "PASS",
    "RETURN_FOR_CORRECTION",
    "REJECT",
    "REQUEST_ADJUDICATION",
  ]),
  feedback: z.string().trim().max(2000).optional(),
  expectedRevision: z.number().int().min(0),
  idempotencyKey: z.string().min(8).max(100).optional(),
});

export const adjudicationSchema = z.object({
  finalAnswer: z.record(z.string(), z.unknown()),
  rationale: z.string().trim().min(20).max(2000),
  expectedTaskVersion: z.number().int().min(0),
  chosenAnnotationId: idSchema.nullish(),
});

export const schemaCreateSchema = z.object({
  schema: z.unknown(),
});

export const schemaPublishSchema = z.object({
  schemaVersionId: idSchema,
});

export const schemaApplySchema = z.object({
  schemaVersionId: idSchema,
});

export const taskGenerationSchema = z.object({
  schemaVersionId: idSchema,
  datasetVersionId: idSchema,
});

export const importCommitSchema = z.object({
  batchId: idSchema,
});

export const releaseCreateSchema = z.object({
  schemaVersionId: idSchema,
  datasetVersionId: idSchema.optional(),
  notes: z.string().trim().max(1000).optional(),
});

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).max(1000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export const workspaceQuerySchema = z.object({
  workspaceId: idSchema,
});

export const taskQuerySchema = z.object({
  projectId: idSchema,
  status: z.string().optional(),
  assigneeId: idSchema.optional(),
  page: z.coerce.number().int().min(1).max(1000).default(1),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(200),
  next: z.string().max(500).optional(),
});

export const signupSchema = z.object({
  displayName: displayNameSchema,
  email: emailSchema,
  password: passwordSchema,
  next: z.string().max(500).optional(),
});

export const demoLoginSchema = z.object({
  role: z.enum(["owner", "manager", "reviewer", "annotator"]),
});

export function safeNextPath(value: string | undefined | null): string {
  if (!value) return "/workspaces";
  if (!value.startsWith("/") || value.startsWith("//")) return "/workspaces";
  return value;
}
