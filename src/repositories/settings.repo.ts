type SettingRow = {
  value_json: string;
};

export class SettingsRepository {
  constructor(private readonly db: D1Database) {}

  async getJson<T>(key: string): Promise<T | null> {
    const row = await this.db
      .prepare("SELECT value_json FROM app_settings WHERE setting_key = ?")
      .bind(key)
      .first<SettingRow>();

    if (!row) return null;

    try {
      return JSON.parse(row.value_json) as T;
    } catch {
      return null;
    }
  }

  async putJson(key: string, value: unknown): Promise<void> {
    const now = new Date().toISOString();
    await this.db
      .prepare(
        `INSERT INTO app_settings (setting_key, value_json, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(setting_key) DO UPDATE SET
           value_json = excluded.value_json,
           updated_at = excluded.updated_at`,
      )
      .bind(key, JSON.stringify(value), now)
      .run();
  }
}
