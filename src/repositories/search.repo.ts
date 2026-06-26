import type { SearchResultRow } from "../types";

export class SearchRepository {
  constructor(private readonly db: D1Database) {}

  async search(query: string, limit = 100): Promise<SearchResultRow[]> {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return [];

    const result = await this.db
      .prepare(
        `SELECT id, profile_id, resource_type, resource_id, title, subtitle, updated_at
         FROM search_index
         WHERE lower(search_text) LIKE ?
         ORDER BY resource_type ASC, title ASC
         LIMIT ?`,
      )
      .bind(`%${normalized}%`, limit)
      .all<SearchResultRow>();

    return result.results;
  }
}

