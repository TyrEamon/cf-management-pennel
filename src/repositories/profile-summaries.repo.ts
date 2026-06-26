type ResourceTable =
  | "zones"
  | "workers"
  | "pages_projects"
  | "pages_domains"
  | "r2_buckets"
  | "d1_databases"
  | "kv_namespaces";

type ProfileSummaryRow = {
  id: string;
  name: string;
  account_id: string;
  email_hint: string | null;
  note: string | null;
  token_hint: string | null;
  enabled: number;
  status: string;
  last_sync_at: string | null;
  created_at: string;
  updated_at: string;
  zones: number;
  workers: number;
  pages_projects: number;
  pages_domains: number;
  r2_buckets: number;
  d1_databases: number;
  kv_namespaces: number;
  open_issues: number;
  latest_sync_status: string | null;
  latest_sync_started_at: string | null;
  latest_sync_finished_at: string | null;
};

export type ProfileAssetSummary = {
  id: string;
  name: string;
  accountId: string;
  emailHint: string | null;
  note: string | null;
  tokenHint: string | null;
  enabled: boolean;
  status: string;
  lastSyncAt: string | null;
  createdAt: string;
  updatedAt: string;
  counts: {
    zones: number;
    workers: number;
    pagesProjects: number;
    pagesDomains: number;
    r2Buckets: number;
    d1Databases: number;
    kvNamespaces: number;
    openIssues: number;
  };
  domainTotal: number;
  projectTotal: number;
  totalAssets: number;
  latestSyncStatus: string | null;
  latestSyncStartedAt: string | null;
  latestSyncFinishedAt: string | null;
};

export class ProfileSummariesRepository {
  constructor(private readonly db: D1Database) {}

  async list(): Promise<ProfileAssetSummary[]> {
    const result = await this.db
      .prepare(
        `SELECT
          profiles.id,
          profiles.name,
          profiles.account_id,
          profiles.email_hint,
          profiles.note,
          profiles.token_hint,
          profiles.enabled,
          profiles.status,
          profiles.last_sync_at,
          profiles.created_at,
          profiles.updated_at,
          COALESCE(zones.count, 0) AS zones,
          COALESCE(workers.count, 0) AS workers,
          COALESCE(pages_projects.count, 0) AS pages_projects,
          COALESCE(pages_domains.count, 0) AS pages_domains,
          COALESCE(r2_buckets.count, 0) AS r2_buckets,
          COALESCE(d1_databases.count, 0) AS d1_databases,
          COALESCE(kv_namespaces.count, 0) AS kv_namespaces,
          COALESCE(open_issues.count, 0) AS open_issues,
          latest_sync.status AS latest_sync_status,
          latest_sync.started_at AS latest_sync_started_at,
          latest_sync.finished_at AS latest_sync_finished_at
         FROM profiles
         LEFT JOIN (${resourceCountSql("zones")}) zones ON zones.profile_id = profiles.id
         LEFT JOIN (${resourceCountSql("workers")}) workers ON workers.profile_id = profiles.id
         LEFT JOIN (${resourceCountSql("pages_projects")}) pages_projects ON pages_projects.profile_id = profiles.id
         LEFT JOIN (${resourceCountSql("pages_domains")}) pages_domains ON pages_domains.profile_id = profiles.id
         LEFT JOIN (${resourceCountSql("r2_buckets")}) r2_buckets ON r2_buckets.profile_id = profiles.id
         LEFT JOIN (${resourceCountSql("d1_databases")}) d1_databases ON d1_databases.profile_id = profiles.id
         LEFT JOIN (${resourceCountSql("kv_namespaces")}) kv_namespaces ON kv_namespaces.profile_id = profiles.id
         LEFT JOIN (
           SELECT profile_id, COUNT(*) AS count
           FROM issues
           WHERE status = 'open'
           GROUP BY profile_id
         ) open_issues ON open_issues.profile_id = profiles.id
         LEFT JOIN sync_jobs latest_sync ON latest_sync.id = (
           SELECT id
           FROM sync_jobs
           WHERE profile_id = profiles.id
           ORDER BY started_at DESC
           LIMIT 1
         )
         ORDER BY profiles.created_at DESC`,
      )
      .all<ProfileSummaryRow>();

    return result.results.map(toProfileAssetSummary);
  }
}

function resourceCountSql(table: ResourceTable): string {
  return `SELECT profile_id, COUNT(*) AS count FROM ${table} WHERE deleted_at IS NULL GROUP BY profile_id`;
}

function toProfileAssetSummary(row: ProfileSummaryRow): ProfileAssetSummary {
  const counts = {
    zones: Number(row.zones ?? 0),
    workers: Number(row.workers ?? 0),
    pagesProjects: Number(row.pages_projects ?? 0),
    pagesDomains: Number(row.pages_domains ?? 0),
    r2Buckets: Number(row.r2_buckets ?? 0),
    d1Databases: Number(row.d1_databases ?? 0),
    kvNamespaces: Number(row.kv_namespaces ?? 0),
    openIssues: Number(row.open_issues ?? 0),
  };
  const totalAssets =
    counts.zones +
    counts.workers +
    counts.pagesProjects +
    counts.pagesDomains +
    counts.r2Buckets +
    counts.d1Databases +
    counts.kvNamespaces;

  return {
    id: row.id,
    name: row.name,
    accountId: row.account_id,
    emailHint: row.email_hint,
    note: row.note,
    tokenHint: row.token_hint ? `****${row.token_hint}` : null,
    enabled: row.enabled === 1,
    status: row.status,
    lastSyncAt: row.last_sync_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    counts,
    domainTotal: counts.zones,
    projectTotal: counts.workers + counts.pagesProjects,
    totalAssets,
    latestSyncStatus: row.latest_sync_status,
    latestSyncStartedAt: row.latest_sync_started_at,
    latestSyncFinishedAt: row.latest_sync_finished_at,
  };
}
