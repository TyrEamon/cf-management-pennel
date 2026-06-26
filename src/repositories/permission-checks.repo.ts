import type { PermissionCheckResult } from "../types";
import { newId } from "../shared/ids";
import { stringifyJson } from "../shared/record";

export class PermissionChecksRepository {
  constructor(private readonly db: D1Database) {}

  async replaceForProfile(
    profileId: string,
    checks: PermissionCheckResult[],
  ): Promise<void> {
    await this.db
      .prepare("DELETE FROM profile_permission_checks WHERE profile_id = ?")
      .bind(profileId)
      .run();

    const now = new Date().toISOString();
    for (const check of checks) {
      await this.db
        .prepare(
          `INSERT INTO profile_permission_checks (
            id, profile_id, check_key, status, http_status,
            error_code, message, checked_at, raw_json
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          newId("check"),
          profileId,
          check.checkKey,
          check.status,
          check.httpStatus ?? null,
          check.errorCode ?? null,
          check.message ?? null,
          now,
          check.rawJson === undefined ? null : stringifyJson(check.rawJson),
        )
        .run();
    }
  }

  async listForProfile(profileId: string): Promise<unknown[]> {
    const result = await this.db
      .prepare(
        `SELECT check_key, status, http_status, error_code, message, checked_at
         FROM profile_permission_checks
         WHERE profile_id = ?
         ORDER BY check_key ASC`,
      )
      .bind(profileId)
      .all();

    return result.results;
  }
}

