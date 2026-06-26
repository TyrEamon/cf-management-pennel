import { sha256Hex } from "../shared/ids";
import { stringifyJson } from "../shared/record";

export class IssuesRepository {
  constructor(private readonly db: D1Database) {}

  async clearGeneratedForProfile(profileId: string): Promise<void> {
    await this.db
      .prepare("DELETE FROM issues WHERE profile_id = ?")
      .bind(profileId)
      .run();
  }

  async add(input: {
    profileId: string;
    issueType: string;
    severity: "info" | "warning" | "error";
    resourceType?: string | null;
    resourceId?: string | null;
    title: string;
    message: string;
    raw?: unknown;
  }): Promise<void> {
    const now = new Date().toISOString();
    const id = `issue_${await sha256Hex(
      [
        input.profileId,
        input.issueType,
        input.resourceType ?? "",
        input.resourceId ?? "",
        input.title,
      ].join(":"),
    )}`;

    await this.db
      .prepare(
        `INSERT INTO issues (
          id, profile_id, issue_type, severity, resource_type, resource_id,
          title, message, status, raw_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          severity = excluded.severity,
          title = excluded.title,
          message = excluded.message,
          raw_json = excluded.raw_json,
          status = 'open',
          updated_at = excluded.updated_at`,
      )
      .bind(
        id,
        input.profileId,
        input.issueType,
        input.severity,
        input.resourceType ?? null,
        input.resourceId ?? null,
        input.title,
        input.message,
        input.raw === undefined ? null : stringifyJson(input.raw),
        now,
        now,
      )
      .run();
  }

  async listOpen(limit = 100): Promise<unknown[]> {
    const result = await this.db
      .prepare(
        `SELECT issues.*, profiles.name AS profile_name
         FROM issues
         LEFT JOIN profiles ON profiles.id = issues.profile_id
         WHERE issues.status = 'open'
         ORDER BY
          CASE issues.severity WHEN 'error' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END,
          issues.updated_at DESC
         LIMIT ?`,
      )
      .bind(limit)
      .all();
    return result.results;
  }
}

