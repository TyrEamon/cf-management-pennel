export type CloudflareErrorKind =
  | "token_invalid"
  | "permission_denied"
  | "rate_limited"
  | "not_found"
  | "network_error"
  | "cloudflare_error"
  | "parse_error"
  | "unknown_error";

export class CloudflareApiError extends Error {
  constructor(
    message: string,
    readonly kind: CloudflareErrorKind,
    readonly httpStatus?: number,
    readonly errorCode?: string,
    readonly rawJson?: unknown,
  ) {
    super(message);
    this.name = "CloudflareApiError";
  }
}

export function classifyHttpStatus(status: number): CloudflareErrorKind {
  if (status === 401) return "token_invalid";
  if (status === 403) return "permission_denied";
  if (status === 404) return "not_found";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "cloudflare_error";
  return "unknown_error";
}

