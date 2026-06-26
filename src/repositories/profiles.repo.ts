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

