/** Domain errors for CRM — mapped by errorHandler via statusCode/code. */
export class CrmError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(message: string, code: string, statusCode = 400) {
    super(message);
    this.name = "CrmError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

export function crmNotFound(entity: string): CrmError {
  return new CrmError(`${entity} not found`, "NOT_FOUND", 404);
}

export function crmConflict(message: string, code = "CONFLICT"): CrmError {
  return new CrmError(message, code, 409);
}

export function crmBadRequest(message: string, code = "VALIDATION_ERROR"): CrmError {
  return new CrmError(message, code, 400);
}
