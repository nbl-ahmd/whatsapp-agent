/**
 * Application error hierarchy. Route handlers map these to HTTP responses.
 */
export class AppError extends Error {
  constructor(message, { statusCode = 500, code = "INTERNAL_ERROR", details, cause } = {}) {
    super(message, { cause });
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isAppError = true;
  }
}

export class ValidationError extends AppError {
  constructor(message = "Invalid request", details) {
    super(message, { statusCode: 400, code: "VALIDATION_ERROR", details });
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Authentication required") {
    super(message, { statusCode: 401, code: "UNAUTHORIZED" });
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Not allowed") {
    super(message, { statusCode: 403, code: "FORBIDDEN" });
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Not found") {
    super(message, { statusCode: 404, code: "NOT_FOUND" });
  }
}

export class ConflictError extends AppError {
  constructor(message = "Conflict") {
    super(message, { statusCode: 409, code: "CONFLICT" });
  }
}

export class RateLimitError extends AppError {
  constructor(message = "Too many requests") {
    super(message, { statusCode: 429, code: "RATE_LIMITED" });
  }
}

export class ExternalServiceError extends AppError {
  constructor(message = "Upstream service error", details) {
    super(message, { statusCode: 502, code: "EXTERNAL_SERVICE_ERROR", details });
  }
}

export function isAppError(error) {
  return Boolean(error && error.isAppError);
}
