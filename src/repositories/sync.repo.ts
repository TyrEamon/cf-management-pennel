import { newId } from "../shared/ids";
import { stringifyJson } from "../shared/record";

export type SyncScope = "all_profiles" | "single_profile";
export type SyncStatus =
  | "running"
  | "success"
  | "partial_success"
  | "failed"
  | "cancelled";

export class SyncRepository {
  constructor(private readonly db: D1Database) {}

  async createJob(scope: SyncScope, profileId?: string): Promise<string> {
    const id = newId("sync");
    await this.db
      .prepare(
        `INSERT INTO sync_jobs (id, profile_id, scope, status, started_at)
         VALUES (?, ?, ?, 'running', ?)`,
      )
      .bind(id, profileId ?? null, scope, new Date().toISOString())
      .run();

    return id;
  }

  async finishJob(
    id: string,
    status: SyncStatus,
    summary?: unknown,
  ): Promise<void> {
    await this.db
      .prepare(
        `UPDATE sync_jobs
         SET status = ?, finished_at = ?, summary_json = COALESCE(?, summary_json)
         WHERE id = ?`,
      )
      .bind(
        status,
        new Date().toISOString(),
        summary === undefined ? null : stringifyJson(summary),
        id,
      )
      .run();
  }

  async recordError(input: {
    syncJobId: string;
    profileId?: string | null;
    resourceType: string;
    resourceId?: string | null;
    operation: string;
    httpStatus?: number | null;
    errorCode?: string | null;
    message: string;
    rawJson?: unknown;
  }): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO sync_errors (
          id, sync_job_id, profile_id, resource_type, resource_id,
          operation, http_status, error_code, message, raw_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        newId("err"),
        input.syncJobId,
        input.profileId ?? null,
        input.resourceType,
        input.resourceId ?? null,
        input.operation,
        input.httpStatus ?? null,
        input.errorCode ?? null,
        input.message,
        input.rawJson === undefined ? null : stringifyJson(input.rawJson),
        new Date().toISOString(),
      )
      .run();

    await this.db
      .prepare(
        "UPDATE sync_jobs SET total_errors = total_errors + 1 WHERE id = ?",
      )
      .bind(input.syncJobId)
      .run();
  }

  async listJobs(limit = 50): Promise<unknown[]> {
    const result = await this.db
      .prepare("SELECT * FROM sync_jobs ORDER BY started_at DESC LIMIT ?")
      .bind(limit)
      .all();

    return result.results;
  }

  async listErrors(syncJobId: string): Promise<unknown[]> {
    const result = await this.db
      .prepare(
        "SELECT * FROM sync_errors WHERE sync_job_id = ? ORDER BY created_at DESC",
      )
      .bind(syncJobId)
      .all();

    return result.results;
  }
}

