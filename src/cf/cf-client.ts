import type { JsonObject } from "../shared/record";
import { CloudflareApiError, classifyHttpStatus } from "./errors";

export type CloudflareClientEnv = {
  CLOUDFLARE_API_BASE_URL: string;
  CF_API_MIN_DELAY_MS: string;
  CF_API_MAX_RETRIES: string;
};

export type CloudflareMessage = {
  code?: number | string;
  message: string;
};

export type CloudflareResponse<T> = {
  success: boolean;
  errors: CloudflareMessage[];
  messages: CloudflareMessage[];
  result: T;
  result_info?: {
    page?: number;
    per_page?: number;
    total_pages?: number;
    count?: number;
    total_count?: number;
  };
};

export type CfRecord = JsonObject;

export class CloudflareClient {
  constructor(
    private readonly env: CloudflareClientEnv,
    private readonly token: string,
  ) {}

  verifyToken(): Promise<CfRecord> {
    return this.request<CfRecord>("/user/tokens/verify");
  }

  listZones(): Promise<CfRecord[]> {
    return this.listAll<CfRecord>("/zones");
  }

  listWorkerScripts(accountId: string): Promise<CfRecord[]> {
    return this.listAll<CfRecord>(
      `/accounts/${encodeURIComponent(accountId)}/workers/scripts`,
    );
  }

  listPagesProjects(accountId: string): Promise<CfRecord[]> {
    return this.listAll<CfRecord>(
      `/accounts/${encodeURIComponent(accountId)}/pages/projects`,
      { includePerPage: false },
    );
  }

  listPagesDomains(accountId: string, projectName: string): Promise<CfRecord[]> {
    return this.listAll<CfRecord>(
      `/accounts/${encodeURIComponent(accountId)}/pages/projects/${encodeURIComponent(
        projectName,
      )}/domains`,
      { includePerPage: false },
    );
  }

  listR2Buckets(accountId: string): Promise<CfRecord[]> {
    return this.request<{ buckets?: unknown }>(
      `/accounts/${encodeURIComponent(accountId)}/r2/buckets`,
    ).then((result) => toRecordArray(result.buckets));
  }

  listD1Databases(accountId: string): Promise<CfRecord[]> {
    return this.listAll<CfRecord>(
      `/accounts/${encodeURIComponent(accountId)}/d1/database`,
    );
  }

  listKvNamespaces(accountId: string): Promise<CfRecord[]> {
    return this.listAll<CfRecord>(
      `/accounts/${encodeURIComponent(accountId)}/storage/kv/namespaces`,
    );
  }

  private async listAll<T extends CfRecord>(
    path: string,
    options: { includePerPage?: boolean } = {},
  ): Promise<T[]> {
    const results: T[] = [];
    let page = 1;
    let totalPages = 1;

    do {
      const separator = path.includes("?") ? "&" : "?";
      const params = options.includePerPage === false
        ? `page=${page}`
        : `page=${page}&per_page=50`;
      const response = await this.request<unknown>(
        `${path}${separator}${params}`,
      );
      results.push(...toRecordArray(response) as T[]);

      const lastMeta = this.lastResultInfo;
      totalPages = lastMeta?.total_pages ?? page;
      page += 1;
    } while (page <= totalPages);

    return results;
  }

  private lastResultInfo: CloudflareResponse<unknown>["result_info"] | undefined;

  private async request<T>(path: string): Promise<T> {
    const maxRetries = parseInteger(this.env.CF_API_MAX_RETRIES, 3);
    const minDelayMs = parseInteger(this.env.CF_API_MIN_DELAY_MS, 250);
    let attempt = 0;

    while (true) {
      try {
        if (attempt > 0 || minDelayMs > 0) {
          await sleep(attempt > 0 ? minDelayMs * 2 ** (attempt - 1) : minDelayMs);
        }

        const response = await fetch(this.urlFor(path), {
          headers: {
            authorization: `Bearer ${this.token}`,
            "content-type": "application/json",
          },
        });

        if (response.status === 429 && attempt < maxRetries) {
          attempt += 1;
          await sleep(retryAfterMs(response) ?? minDelayMs * 2 ** attempt);
          continue;
        }

        const body = await readJson(response);
        if (!response.ok) {
          throw responseError(response.status, body);
        }

        const parsed = body as CloudflareResponse<T>;
        this.lastResultInfo = parsed.result_info;

        if (!parsed.success) {
          const firstError = parsed.errors[0];
          throw new CloudflareApiError(
            firstError?.message ?? "Cloudflare API returned success=false",
            classifyHttpStatus(response.status),
            response.status,
            firstError?.code === undefined ? undefined : String(firstError.code),
            parsed,
          );
        }

        return parsed.result;
      } catch (error) {
        if (error instanceof CloudflareApiError) {
          if (
            error.kind === "cloudflare_error" &&
            attempt < maxRetries &&
            (error.httpStatus ?? 0) >= 500
          ) {
            attempt += 1;
            continue;
          }
          throw error;
        }

        if (attempt < maxRetries) {
          attempt += 1;
          continue;
        }

        throw new CloudflareApiError(
          error instanceof Error ? error.message : "Network error",
          "network_error",
        );
      }
    }
  }

  private urlFor(path: string): string {
    const base = this.env.CLOUDFLARE_API_BASE_URL.replace(/\/$/, "");
    return `${base}${path.startsWith("/") ? path : `/${path}`}`;
  }
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch (error) {
    throw new CloudflareApiError(
      error instanceof Error ? error.message : "Could not parse JSON response",
      "parse_error",
      response.status,
    );
  }
}

function responseError(status: number, body: unknown): CloudflareApiError {
  const parsed = body as Partial<CloudflareResponse<unknown>>;
  const firstError = parsed.errors?.[0];
  return new CloudflareApiError(
    firstError?.message ?? `Cloudflare API request failed with ${status}`,
    classifyHttpStatus(status),
    status,
    firstError?.code === undefined ? undefined : String(firstError.code),
    body,
  );
}

function parseInteger(value: string, fallback: number): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function retryAfterMs(response: Response): number | null {
  const value = response.headers.get("retry-after");
  if (!value) return null;
  const seconds = Number.parseInt(value, 10);
  return Number.isFinite(seconds) ? seconds * 1000 : null;
}

function toRecordArray(value: unknown): CfRecord[] {
  if (!Array.isArray(value)) {
    throw new CloudflareApiError(
      "Cloudflare API response result was not a list",
      "parse_error",
    );
  }
  return value.filter(isRecord);
}

function isRecord(value: unknown): value is CfRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
