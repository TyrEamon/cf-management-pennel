export class SearchIndexer {
  constructor(private readonly db: D1Database) {}

  async rebuildForProfile(profileId: string): Promise<void> {
    await this.db
      .prepare("DELETE FROM search_index WHERE profile_id = ?")
      .bind(profileId)
      .run();

    await this.insertZones(profileId);
    await this.insertWorkers(profileId);
    await this.insertPagesProjects(profileId);
    await this.insertPagesDomains(profileId);
    await this.insertR2(profileId);
    await this.insertD1(profileId);
    await this.insertKv(profileId);
  }

  private async insertZones(profileId: string): Promise<void> {
    await this.db.prepare(
      `INSERT INTO search_index (id, profile_id, resource_type, resource_id, title, subtitle, search_text, updated_at)
       SELECT 'search_zone_' || id, profile_id, 'zone', id, name, account_id,
              lower(name || ' ' || account_id), ?
       FROM zones WHERE profile_id = ? AND deleted_at IS NULL`,
    ).bind(now(), profileId).run();
  }

  private async insertWorkers(profileId: string): Promise<void> {
    await this.db.prepare(
      `INSERT INTO search_index (id, profile_id, resource_type, resource_id, title, subtitle, search_text, updated_at)
       SELECT 'search_worker_' || id, profile_id, 'worker', id, name, account_id,
              lower(name || ' ' || account_id), ?
       FROM workers WHERE profile_id = ? AND deleted_at IS NULL`,
    ).bind(now(), profileId).run();
  }

  private async insertPagesProjects(profileId: string): Promise<void> {
    await this.db.prepare(
      `INSERT INTO search_index (id, profile_id, resource_type, resource_id, title, subtitle, search_text, updated_at)
       SELECT 'search_pages_project_' || id, profile_id, 'pages_project', id, name, coalesce(subdomain, ''),
              lower(name || ' ' || coalesce(subdomain, '') || ' ' || coalesce(latest_deployment_url, '')), ?
       FROM pages_projects WHERE profile_id = ? AND deleted_at IS NULL`,
    ).bind(now(), profileId).run();
  }

  private async insertPagesDomains(profileId: string): Promise<void> {
    await this.db.prepare(
      `INSERT INTO search_index (id, profile_id, resource_type, resource_id, title, subtitle, search_text, updated_at)
       SELECT 'search_pages_domain_' || id, profile_id, 'pages_domain', id, domain_name, project_name,
              lower(domain_name || ' ' || project_name), ?
       FROM pages_domains WHERE profile_id = ? AND deleted_at IS NULL`,
    ).bind(now(), profileId).run();
  }

  private async insertR2(profileId: string): Promise<void> {
    await this.db.prepare(
      `INSERT INTO search_index (id, profile_id, resource_type, resource_id, title, subtitle, search_text, updated_at)
       SELECT 'search_r2_' || id, profile_id, 'r2_bucket', id, name, account_id,
              lower(name || ' ' || account_id), ?
       FROM r2_buckets WHERE profile_id = ? AND deleted_at IS NULL`,
    ).bind(now(), profileId).run();
  }

  private async insertD1(profileId: string): Promise<void> {
    await this.db.prepare(
      `INSERT INTO search_index (id, profile_id, resource_type, resource_id, title, subtitle, search_text, updated_at)
       SELECT 'search_d1_' || id, profile_id, 'd1_database', id, name, coalesce(uuid, account_id),
              lower(name || ' ' || coalesce(uuid, '') || ' ' || account_id), ?
       FROM d1_databases WHERE profile_id = ? AND deleted_at IS NULL`,
    ).bind(now(), profileId).run();
  }

  private async insertKv(profileId: string): Promise<void> {
    await this.db.prepare(
      `INSERT INTO search_index (id, profile_id, resource_type, resource_id, title, subtitle, search_text, updated_at)
       SELECT 'search_kv_' || id, profile_id, 'kv_namespace', id, title, account_id,
              lower(title || ' ' || id || ' ' || account_id), ?
       FROM kv_namespaces WHERE profile_id = ? AND deleted_at IS NULL`,
    ).bind(now(), profileId).run();
  }
}

function now(): string {
  return new Date().toISOString();
}
