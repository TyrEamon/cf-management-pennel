import type { EncryptedToken, ProfileRow, PublicProfile } from "../types";
import { newId } from "../shared/ids";
import { maskTokenHint } from "../crypto/token-crypto";

export type CreateProfileInput = {
  name: string;
  accountId: string;
  emailHint?: string | null;
  note?: string | null;
  encryptedToken: EncryptedToken;
};

export type UpdateProfileInput = {
  name?: string;
  accountId?: string;
  emailHint?: string | null;
  note?: string | null;
  encryptedToken?: EncryptedToken;
};

// profile_id 外键关联的所有子表，删除账号时按依赖顺序清理
const CHILD_TABLES = [
  "sync_errors",
  "sync_jobs",
  "profile_permission_checks",
  "cf_accounts",
  "dns_records",
  "worker_routes",
  "zones",
  "workers",
  "pages_domains",
  "pages_projects",
  "r2_buckets",
  "d1_databases",
  "kv_namespaces",
  "asset_links",
  "search_index",
  "issues",
] as const;

export class ProfileRepository {
  constructor(private readonly db: D1Database) {}

  async create(input: CreateProfileInput): Promise<PublicProfile> {
    const id = newId("profile");
    const now = new Date().toISOString();

    await this.db
      .prepare(
        `INSERT INTO profiles (
          id, name, account_id, email_hint, note,
          token_ciphertext, token_iv, token_auth_tag, token_hint,
          enabled, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'unknown', ?, ?)`,
      )
      .bind(
        id,
        input.name,
        input.accountId,
        input.emailHint ?? null,
        input.note ?? null,
        input.encryptedToken.ciphertext,
        input.encryptedToken.iv,
        input.encryptedToken.authTag,
        input.encryptedToken.hint,
        now,
        now,
      )
      .run();

    const row = await this.getRequired(id);
    return toPublicProfile(row);
  }

  async list(): Promise<PublicProfile[]> {
    const result = await this.db
      .prepare("SELECT * FROM profiles ORDER BY created_at DESC")
      .all<ProfileRow>();

    return result.results.map(toPublicProfile);
  }

  async listEnabled(): Promise<ProfileRow[]> {
    const result = await this.db
      .prepare("SELECT * FROM profiles WHERE enabled = 1 ORDER BY created_at ASC")
      .all<ProfileRow>();

    return result.results;
  }

  async get(id: string): Promise<ProfileRow | null> {
    return this.db
      .prepare("SELECT * FROM profiles WHERE id = ?")
      .bind(id)
      .first<ProfileRow>();
  }

  async getRequired(id: string): Promise<ProfileRow> {
    const profile = await this.get(id);
    if (!profile) {
      throw new Error(`Profile not found: ${id}`);
    }
    return profile;
  }

  async updateEnabled(id: string, enabled: boolean): Promise<PublicProfile> {
    const status = enabled ? "unknown" : "disabled";
    await this.db
      .prepare(
        "UPDATE profiles SET enabled = ?, status = ?, updated_at = ? WHERE id = ?",
      )
      .bind(enabled ? 1 : 0, status, new Date().toISOString(), id)
      .run();

    const row = await this.getRequired(id);
    return toPublicProfile(row);
  }

  async updateStatus(
    id: string,
    status: ProfileRow["status"],
    lastSyncAt?: string,
  ): Promise<void> {
    await this.db
      .prepare(
        `UPDATE profiles
         SET status = ?, last_sync_at = COALESCE(?, last_sync_at), updated_at = ?
         WHERE id = ?`,
      )
      .bind(status, lastSyncAt ?? null, new Date().toISOString(), id)
      .run();
  }

  async update(id: string, input: UpdateProfileInput): Promise<PublicProfile> {
    const sets: string[] = [];
    const binds: unknown[] = [];

    if (input.name !== undefined) { sets.push("name = ?"); binds.push(input.name); }
    if (input.accountId !== undefined) { sets.push("account_id = ?"); binds.push(input.accountId); }
    if (input.emailHint !== undefined) { sets.push("email_hint = ?"); binds.push(input.emailHint); }
    if (input.note !== undefined) { sets.push("note = ?"); binds.push(input.note); }
    if (input.encryptedToken) {
      sets.push("token_ciphertext = ?", "token_iv = ?", "token_auth_tag = ?", "token_hint = ?");
      binds.push(
        input.encryptedToken.ciphertext,
        input.encryptedToken.iv,
        input.encryptedToken.authTag,
        input.encryptedToken.hint,
      );
    }

    if (sets.length > 0) {
      sets.push("updated_at = ?");
      binds.push(new Date().toISOString(), id);
      await this.db
        .prepare(`UPDATE profiles SET ${sets.join(", ")} WHERE id = ?`)
        .bind(...binds)
        .run();
    }

    return toPublicProfile(await this.getRequired(id));
  }

  async delete(id: string): Promise<void> {
    const statements = CHILD_TABLES.map((table) =>
      this.db.prepare(`DELETE FROM ${table} WHERE profile_id = ?`).bind(id),
    );
    statements.push(
      this.db.prepare("DELETE FROM profiles WHERE id = ?").bind(id),
    );
    await this.db.batch(statements);
  }
}

export function toPublicProfile(row: ProfileRow): PublicProfile {
  return {
    id: row.id,
    name: row.name,
    accountId: row.account_id,
    emailHint: row.email_hint,
    note: row.note,
    tokenHint: maskTokenHint(row.token_hint),
    enabled: row.enabled === 1,
    status: row.status,
    lastSyncAt: row.last_sync_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

