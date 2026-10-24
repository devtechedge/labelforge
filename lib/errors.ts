export type ErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION_FAILED"
  | "CONFLICT"
  | "STALE_REVISION"
  | "RATE_LIMITED"
  | "PAYLOAD_TOO_LARGE"
  | "UNSUPPORTED_FORMAT"
  | "IMPORT_EXPIRED"
  | "SCHEMA_INVALID"
  | "ANSWER_INCOMPLETE"
  | "RELEASE_INTEGRITY"
  | "INTERNAL_ERROR";

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: unknown;

  constructor(
    code: ErrorCode,
    message: string,
    status: number,
    details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

export function notFound(message = "Not found."): AppError {
  return new AppError("NOT_FOUND", message, 404);
}

export function forbidden(message = "You do not have permission to do that."): AppError {
  return new AppError("FORBIDDEN", message, 403);
}

export function conflict(message: string, details?: unknown): AppError {
  return new AppError("CONFLICT", message, 409, details);
}

export function validationFailed(
  message: string,
  details?: unknown,
): AppError {
  return new AppError("VALIDATION_FAILED", message, 422, details);
}
