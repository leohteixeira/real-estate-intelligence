export function publicRequestId(value: string | null | undefined): string | undefined {
  return value && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
    ? value
    : undefined;
}

export class ApiReadError extends Error {
  readonly status: number;
  readonly requestId: string | undefined;
  constructor(
    status: number,
    message = 'The public contract could not be read.',
    requestId?: string,
  ) {
    super(message);
    this.status = status;
    this.name = 'ApiReadError';
    this.requestId = publicRequestId(requestId);
  }
}
