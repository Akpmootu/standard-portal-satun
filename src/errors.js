export class PortalError extends Error {
  constructor(code, status = 503) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

export function fail(condition, code, status = 503) {
  if (!condition) throw new PortalError(code, status);
}
