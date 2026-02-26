export class HttpError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly cause?: unknown;

  constructor(statusCode: number, code: string, message: string, cause?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.cause = cause;
  }
}
