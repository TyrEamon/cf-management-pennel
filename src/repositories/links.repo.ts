import { sha256Hex } from "../shared/ids";

export class LinksRepository {
  constructor(private readonly db: D1Database) {}

  async clearProfile(profileId: string): Promise<void> {
    await this.db
      .prepare("DELETE FROM asset_links WHERE profile_id = ?")
      .bind(profileId)
      .run();
  }

  async add(input: {
    profileId: string;
    sourceType: string;
    sourceId: string;
    targetType: string;
    targetId: string;
    relation: string;
    confidence: number;
    reason?: string | null;
  }): Promise<void> {
    const now = new Date().toISOString();
    const id = `link_${await sha256Hex(
      [
        input.profileId,
        input.sourceType,
        input.sourceId,
        input.targetType,
        input.targetId,
        input.relation,
      ].join(":"),
    )}`;

    await this.db
      .prepare(
        `INSERT INTO asset_links (
          id, profile_id, source_type, source_id, target_type, target_id,
          relation, confidence, reason, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          confidence = excluded.confidence,
          reason = excluded.reason,
          updated_at = excluded.updated_at`,
      )
      .bind(
        id,
        input.profileId,
        input.sourceType,
        input.sourceId,
        input.targetType,
        input.targetId,
        input.relation,
        input.confidence,
        input.reason ?? null,
        now,
        now,
      )
      .run();
  }
}

