export class AppError extends Error {
  constructor(message, code = "INVALID_REQUEST", status = 400) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = status;
  }
}
export function invariant(
  condition,
  message,
  code = "EVIDENCE_INTEGRITY",
  status = 422,
) {
  if (!condition) throw new AppError(message, code, status);
}
