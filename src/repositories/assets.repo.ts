import { sha256Hex } from "../shared/ids";
import {
  asObject,
  getString,
  stringifyJson,
  type JsonObject,
} from "../shared/record";

export type ZoneAsset = {
  id: string;
  profileId: string;
  accountId: string;
  name: string;
  status: string | null;
  planName: string | null;
  createdOn: string | null;
  modifiedOn: string | null;
  raw: unknown;
};

export type WorkerAsset = {
  id: string;
  profileId: string;
  accountId: string;
  name: string;
  createdOn: string | null;
  modifiedOn: string | null;
  raw: unknown;
};

export type PagesProjectAsset = {
  id: string;
  profileId: string;
  accountId: string;
  name: string;
  subdomain: string | null;
  productionBranch: string | null;
  latestDeploymentUrl: string | null;
  raw: unknown;
};

export type PagesDomainAsset = {
  id: string;
  profileId: string;
  accountId: string;
  projectName: string;
  domainName: string;
  status: string | null;
  raw: unknown;
};

export type R2BucketAsset = {
  id: string;
  profileId: string;
  accountId: string;
  name: string;
  location: string | null;
  createdAt: string | null;
  raw: unknown;
};

export type D1DatabaseAsset = {
  id: string;
  profileId: string;
  accountId: string;
  name: string;
  uuid: string | null;
  createdAt: string | null;
  raw: unknown;
};

export type KvNamespaceAsset = {
  id: string;
  profileId: string;
  accountId: string;
  title: string;
  raw: unknown;
};

type ResourceTable =
  | "zones"
  | "workers"
  | "pages_projects"
  | "pages_domains"
  | "r2_buckets"
  | "d1_databases"
  | "kv_namespaces";

export class AssetsRepository {
  constructor(private readonly db: D1Database) {}

  async upsertAccount(input: {
    id: string;
    profileId: string;
    name?: string | null;
    type?: string | null;
    raw?: unknown;
  }): Promise<void> {
    const now = new Date().toISOString();
    await this.db
      .prepare(
        `INSERT INTO cf_accounts (
          id, profile_id, name, type, raw_json, first_seen_at, last_seen_at, deleted_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL)
        ON CONFLICT(id) DO UPDATE SET
          profile_id = excluded.profile_id,
          name = excluded.name,
          type = excluded.type,
          raw_json = excluded.raw_json,
          last_seen_at = excluded.last_seen_at,
          deleted_at = NULL`,
      )
      .bind(
        input.id,
        input.profileId,
        input.name ?? null,
        input.type ?? null,
        input.raw === undefined ? null : stringifyJson(input.raw),
        now,
        now,
      )
      .run();
  }

  async upsertZone(zone: ZoneAsset): Promise<void> {
    const now = new Date().toISOString();
    await this.db
      .prepare(
        `INSERT INTO zones (
          id, profile_id, account_id, name, status, plan_name, created_on,
          modified_on, raw_json, first_seen_at, last_seen_at, deleted_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
        ON CONFLICT(id) DO UPDATE SET
          profile_id = excluded.profile_id,
          account_id = excluded.account_id,
          name = excluded.name,
          status = excluded.status,
          plan_name = excluded.plan_name,
          created_on = excluded.created_on,
          modified_on = excluded.modified_on,
          raw_json = excluded.raw_json,
          last_seen_at = excluded.last_seen_at,
          deleted_at = NULL`,
      )
      .bind(
        zone.id,
        zone.profileId,
        zone.accountId,
        zone.name,
        zone.status,
        zone.planName,
        zone.createdOn,
        zone.modifiedOn,
        stringifyJson(zone.raw),
        now,
        now,
      )
      .run();
  }

  async upsertWorker(worker: WorkerAsset): Promise<void> {
    const now = new Date().toISOString();
    await this.db
      .prepare(
        `INSERT INTO workers (
          id, profile_id, account_id, name, created_on, modified_on, raw_json,
          first_seen_at, last_seen_at, deleted_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
        ON CONFLICT(id) DO UPDATE SET
          profile_id = excluded.profile_id,
          account_id = excluded.account_id,
          name = excluded.name,
          created_on = excluded.created_on,
          modified_on = excluded.modified_on,
          raw_json = excluded.raw_json,
          last_seen_at = excluded.last_seen_at,
          deleted_at = NULL`,
      )
      .bind(
        worker.id,
        worker.profileId,
        worker.accountId,
        worker.name,
        worker.createdOn,
        worker.modifiedOn,
        stringifyJson(worker.raw),
        now,
        now,
      )
      .run();
  }

  async upsertPagesProject(project: PagesProjectAsset): Promise<void> {
    const now = new Date().toISOString();
    await this.db
      .prepare(
        `INSERT INTO pages_projects (
          id, profile_id, account_id, name, subdomain, production_branch,
          latest_deployment_url, raw_json, first_seen_at, last_seen_at, deleted_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
        ON CONFLICT(id) DO UPDATE SET
          profile_id = excluded.profile_id,
          account_id = excluded.account_id,
          name = excluded.name,
          subdomain = excluded.subdomain,
          production_branch = excluded.production_branch,
          latest_deployment_url = excluded.latest_deployment_url,
          raw_json = excluded.raw_json,
          last_seen_at = excluded.last_seen_at,
          deleted_at = NULL`,
      )
      .bind(
        project.id,
        project.profileId,
        project.accountId,
        project.name,
        project.subdomain,
        project.productionBranch,
        project.latestDeploymentUrl,
        stringifyJson(project.raw),
        now,
        now,
      )
      .run();
  }

  async upsertPagesDomain(domain: PagesDomainAsset): Promise<void> {
    const now = new Date().toISOString();
    await this.db
      .prepare(
        `INSERT INTO pages_domains (
          id, profile_id, account_id, project_name, domain_name, status,
          raw_json, first_seen_at, last_seen_at, deleted_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
        ON CONFLICT(id) DO UPDATE SET
          profile_id = excluded.profile_id,
          account_id = excluded.account_id,
          project_name = excluded.project_name,
          domain_name = excluded.domain_name,
          status = excluded.status,
          raw_json = excluded.raw_json,
          last_seen_at = excluded.last_seen_at,
          deleted_at = NULL`,
      )
      .bind(
        domain.id,
        domain.profileId,
        domain.accountId,
        domain.projectName,
        domain.domainName,
        domain.status,
        stringifyJson(domain.raw),
        now,
        now,
      )
      .run();
  }

  async upsertR2Bucket(bucket: R2BucketAsset): Promise<void> {
    const now = new Date().toISOString();
    await this.db
      .prepare(
        `INSERT INTO r2_buckets (
          id, profile_id, account_id, name, location, created_at, raw_json,
          first_seen_at, last_seen_at, deleted_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
        ON CONFLICT(id) DO UPDATE SET
          profile_id = excluded.profile_id,
          account_id = excluded.account_id,
          name = excluded.name,
          location = excluded.location,
          created_at = excluded.created_at,
          raw_json = excluded.raw_json,
          last_seen_at = excluded.last_seen_at,
          deleted_at = NULL`,
      )
      .bind(
        bucket.id,
        bucket.profileId,
        bucket.accountId,
        bucket.name,
        bucket.location,
        bucket.createdAt,
        stringifyJson(bucket.raw),
        now,
        now,
      )
      .run();
  }

  async upsertD1Database(database: D1DatabaseAsset): Promise<void> {
    const now = new Date().toISOString();
    await this.db
      .prepare(
        `INSERT INTO d1_databases (
          id, profile_id, account_id, name, uuid, created_at, raw_json,
          first_seen_at, last_seen_at, deleted_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
        ON CONFLICT(id) DO UPDATE SET
          profile_id = excluded.profile_id,
          account_id = excluded.account_id,
          name = excluded.name,
          uuid = excluded.uuid,
          created_at = excluded.created_at,
          raw_json = excluded.raw_json,
          last_seen_at = excluded.last_seen_at,
          deleted_at = NULL`,
      )
      .bind(
        database.id,
        database.profileId,
        database.accountId,
        database.name,
        database.uuid,
        database.createdAt,
        stringifyJson(database.raw),
        now,
        now,
      )
      .run();
  }

  async upsertKvNamespace(namespace: KvNamespaceAsset): Promise<void> {
    const now = new Date().toISOString();
    await this.db
      .prepare(
        `INSERT INTO kv_namespaces (
          id, profile_id, account_id, title, raw_json, first_seen_at, last_seen_at,
          deleted_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL)
        ON CONFLICT(id) DO UPDATE SET
          profile_id = excluded.profile_id,
          account_id = excluded.account_id,
          title = excluded.title,
          raw_json = excluded.raw_json,
          last_seen_at = excluded.last_seen_at,
          deleted_at = NULL`,
      )
      .bind(
        namespace.id,
        namespace.profileId,
        namespace.accountId,
        namespace.title,
        stringifyJson(namespace.raw),
        now,
        now,
      )
      .run();
  }

  async markMissingDeleted(
    table: ResourceTable,
    profileId: string,
    syncStartedAt: string,
  ): Promise<void> {
    await this.db
      .prepare(
        `UPDATE ${table}
         SET deleted_at = ?
         WHERE profile_id = ?
           AND deleted_at IS NULL
           AND last_seen_at < ?`,
      )
      .bind(new Date().toISOString(), profileId, syncStartedAt)
      .run();
  }

  async listZonesForProfile(profileId: string): Promise<Array<{ id: string; name: string }>> {
    const result = await this.db
      .prepare(
        "SELECT id, name FROM zones WHERE profile_id = ? AND deleted_at IS NULL ORDER BY name",
      )
      .bind(profileId)
      .all<{ id: string; name: string }>();
    return result.results;
  }

  async overview(): Promise<Record<string, number>> {
    const tables = [
      ["profiles", "profiles"],
      ["zones", "zones"],
      ["workers", "workers"],
      ["pages_projects", "pagesProjects"],
      ["pages_domains", "pagesDomains"],
      ["r2_buckets", "r2Buckets"],
      ["d1_databases", "d1Databases"],
      ["kv_namespaces", "kvNamespaces"],
      ["issues", "openIssues"],
    ] as const;
    const output: Record<string, number> = {};

    for (const [table, key] of tables) {
      const where = table === "profiles"
        ? ""
        : table === "issues"
          ? " WHERE status = 'open'"
          : " WHERE deleted_at IS NULL";
      const row = await this.db
        .prepare(`SELECT COUNT(*) AS count FROM ${table}${where}`)
        .first<{ count: number }>();
      output[key] = row?.count ?? 0;
    }

    return output;
  }
}

export async function zoneFromCf(
  raw: JsonObject,
  profileId: string,
  fallbackAccountId: string,
): Promise<ZoneAsset | null> {
  const id = getString(raw, "id");
  const name = getString(raw, "name");
  if (!id || !name) return null;
  const account = asObject(raw.account);
  const plan = asObject(raw.plan);
  return {
    id,
    profileId,
    accountId: getString(account, "id") ?? fallbackAccountId,
    name,
    status: getString(raw, "status"),
    planName: getString(plan, "name"),
    createdOn: getString(raw, "created_on"),
    modifiedOn: getString(raw, "modified_on"),
    raw,
  };
}

export async function workerFromCf(
  raw: JsonObject,
  profileId: string,
  accountId: string,
): Promise<WorkerAsset | null> {
  const name = getString(raw, "id") ?? getString(raw, "name");
  if (!name) return null;
  return {
    id: `worker_${await sha256Hex(`${accountId}:${name}`)}`,
    profileId,
    accountId,
    name,
    createdOn: getString(raw, "created_on") ?? getString(raw, "createdOn"),
    modifiedOn: getString(raw, "modified_on") ?? getString(raw, "modifiedOn"),
    raw,
  };
}

export async function pagesProjectFromCf(
  raw: JsonObject,
  profileId: string,
  accountId: string,
): Promise<PagesProjectAsset | null> {
  const name = getString(raw, "name");
  if (!name) return null;
  const latestDeployment = asObject(raw.latest_deployment);
  return {
    id: getString(raw, "id") ?? `pages_${await sha256Hex(`${accountId}:${name}`)}`,
    profileId,
    accountId,
    name,
    subdomain: getString(raw, "subdomain"),
    productionBranch: getString(raw, "production_branch"),
    latestDeploymentUrl:
      getString(raw, "latest_deployment_url") ?? getString(latestDeployment, "url"),
    raw,
  };
}

export async function pagesDomainFromCf(
  rawValue: unknown,
  profileId: string,
  accountId: string,
  projectName: string,
): Promise<PagesDomainAsset | null> {
  const raw = typeof rawValue === "string" ? { name: rawValue } : asObject(rawValue);
  const domainName = getString(raw, "name") ?? getString(raw, "domain_name");
  if (!domainName) return null;
  return {
    id: `pages_domain_${await sha256Hex(`${accountId}:${projectName}:${domainName}`)}`,
    profileId,
    accountId,
    projectName,
    domainName,
    status: getString(raw, "status"),
    raw,
  };
}

export async function r2BucketFromCf(
  raw: JsonObject,
  profileId: string,
  accountId: string,
): Promise<R2BucketAsset | null> {
  const name = getString(raw, "name");
  if (!name) return null;
  return {
    id: `r2_${await sha256Hex(`${accountId}:${name}`)}`,
    profileId,
    accountId,
    name,
    location:
      getString(raw, "location") ??
      getString(raw, "location_hint") ??
      getString(raw, "jurisdiction"),
    createdAt: getString(raw, "creation_date") ?? getString(raw, "created_at"),
    raw,
  };
}

export async function d1DatabaseFromCf(
  raw: JsonObject,
  profileId: string,
  accountId: string,
): Promise<D1DatabaseAsset | null> {
  const uuid = getString(raw, "uuid") ?? getString(raw, "id");
  const name = getString(raw, "name");
  if (!name && !uuid) return null;
  return {
    id: uuid ?? `d1_${await sha256Hex(`${accountId}:${name}`)}`,
    profileId,
    accountId,
    name: name ?? uuid ?? "unknown",
    uuid,
    createdAt: getString(raw, "created_at") ?? getString(raw, "created_on"),
    raw,
  };
}

export function kvNamespaceFromCf(
  raw: JsonObject,
  profileId: string,
  accountId: string,
): KvNamespaceAsset | null {
  const id = getString(raw, "id");
  const title = getString(raw, "title") ?? getString(raw, "name");
  if (!id || !title) return null;
  return {
    id,
    profileId,
    accountId,
    title,
    raw,
  };
}
