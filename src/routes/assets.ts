import { Hono } from "hono";
import { AssetGraphRepository } from "../repositories/asset-graph.repo";
import { AssetsRepository } from "../repositories/assets.repo";
import { PermissionChecksRepository } from "../repositories/permission-checks.repo";
import { ProfileSummariesRepository } from "../repositories/profile-summaries.repo";

type AppBindings = {
  Bindings: Env;
};

export const assetsRoute = new Hono<AppBindings>();

assetsRoute.get("/overview", async (c) => {
  const [overview, profileSummaries, recentJobs] = await Promise.all([
    new AssetsRepository(c.env.DB).overview(),
    new ProfileSummariesRepository(c.env.DB).list(),
    c.env.DB
      .prepare(
        `SELECT id, profile_id, scope, status, started_at, finished_at, total_errors
         FROM sync_jobs
         ORDER BY started_at DESC
         LIMIT 8`,
      )
      .all(),
  ]);

  return c.json({
    data: {
      overview,
      profileSummaries,
      recentJobs: recentJobs.results,
    },
  });
});

assetsRoute.get("/graph", async (c) => {
  const graph = await new AssetGraphRepository(c.env.DB).graph({
    profileId: c.req.query("profileId") ?? null,
    domain: c.req.query("domain") ?? null,
    limit: Number(c.req.query("limit") ?? 200),
  });
  return c.json({ data: graph });
});

assetsRoute.get("/zones", async (c) => {
  const result = await c.env.DB
    .prepare(
      `SELECT zones.*, profiles.name AS profile_name
       FROM zones
       LEFT JOIN profiles ON profiles.id = zones.profile_id
       WHERE zones.deleted_at IS NULL
       ORDER BY zones.name ASC
       LIMIT 200`,
    )
    .all();
  return c.json({ data: result.results });
});

assetsRoute.get("/zones/:id", async (c) => {
  const zoneId = c.req.param("id");
  const [zone, dnsRecords, workerRoutes, links, graph] = await Promise.all([
    c.env.DB
      .prepare(
        `SELECT zones.*, profiles.name AS profile_name
         FROM zones
         LEFT JOIN profiles ON profiles.id = zones.profile_id
         WHERE zones.id = ? AND zones.deleted_at IS NULL`,
      )
      .bind(zoneId)
      .first(),
    c.env.DB
      .prepare(
        `SELECT dns_records.*, profiles.name AS profile_name
         FROM dns_records
         LEFT JOIN profiles ON profiles.id = dns_records.profile_id
         WHERE dns_records.zone_id = ? AND dns_records.deleted_at IS NULL
         ORDER BY dns_records.name ASC, dns_records.type ASC`,
      )
      .bind(zoneId)
      .all(),
    c.env.DB
      .prepare(
        `SELECT worker_routes.*, profiles.name AS profile_name
         FROM worker_routes
         LEFT JOIN profiles ON profiles.id = worker_routes.profile_id
         WHERE worker_routes.zone_id = ? AND worker_routes.deleted_at IS NULL
         ORDER BY worker_routes.pattern ASC`,
      )
      .bind(zoneId)
      .all(),
    c.env.DB
      .prepare(
        `SELECT asset_links.*
         FROM asset_links
         WHERE source_id = ? OR target_id = ?
         ORDER BY confidence DESC`,
      )
      .bind(zoneId, zoneId)
      .all(),
    new AssetGraphRepository(c.env.DB).graphForResource("zone", zoneId),
  ]);

  if (!zone) return c.json({ error: "Zone not found" }, 404);

  return c.json({
    data: {
      zone,
      dnsRecords: dnsRecords.results,
      workerRoutes: workerRoutes.results,
      links: links.results,
      graph,
    },
  });
});

assetsRoute.get("/profiles/:id", async (c) => {
  const profileId = c.req.param("id");
  const [zones, dnsRecords, workers, workerRoutes, pagesProjects, pagesDomains, r2, d1, kv] =
    await Promise.all([
      list(c.env.DB, "zones", profileId),
      list(c.env.DB, "dns_records", profileId),
      list(c.env.DB, "workers", profileId),
      list(c.env.DB, "worker_routes", profileId),
      list(c.env.DB, "pages_projects", profileId),
      list(c.env.DB, "pages_domains", profileId),
      list(c.env.DB, "r2_buckets", profileId),
      list(c.env.DB, "d1_databases", profileId),
      list(c.env.DB, "kv_namespaces", profileId),
    ]);
  const permissionChecks = await new PermissionChecksRepository(
    c.env.DB,
  ).listForProfile(profileId);

  return c.json({
    data: {
      permissionChecks,
      zones,
      dnsRecords,
      workers,
      workerRoutes,
      pagesProjects,
      pagesDomains,
      r2Buckets: r2,
      d1Databases: d1,
      kvNamespaces: kv,
    },
  });
});

assetsRoute.get("/domains/:name", async (c) => {
  const domain = c.req.param("name").toLowerCase();
  const like = `%${domain}%`;
  const [zones, dnsRecords, workerRoutes, pagesDomains, links, graph] = await Promise.all([
    c.env.DB
      .prepare(
        `SELECT zones.*, profiles.name AS profile_name
         FROM zones
         LEFT JOIN profiles ON profiles.id = zones.profile_id
         WHERE lower(zones.name) = ? AND zones.deleted_at IS NULL`,
      )
      .bind(domain)
      .all(),
    c.env.DB
      .prepare(
        `SELECT dns_records.*, profiles.name AS profile_name
         FROM dns_records
         LEFT JOIN profiles ON profiles.id = dns_records.profile_id
         WHERE lower(dns_records.name) LIKE ? AND dns_records.deleted_at IS NULL
         ORDER BY dns_records.name ASC`,
      )
      .bind(like)
      .all(),
    c.env.DB
      .prepare(
        `SELECT worker_routes.*, profiles.name AS profile_name
         FROM worker_routes
         LEFT JOIN profiles ON profiles.id = worker_routes.profile_id
         WHERE lower(worker_routes.pattern) LIKE ? AND worker_routes.deleted_at IS NULL
         ORDER BY worker_routes.pattern ASC`,
      )
      .bind(like)
      .all(),
    c.env.DB
      .prepare(
        `SELECT pages_domains.*, profiles.name AS profile_name
         FROM pages_domains
         LEFT JOIN profiles ON profiles.id = pages_domains.profile_id
         WHERE lower(pages_domains.domain_name) LIKE ? AND pages_domains.deleted_at IS NULL
         ORDER BY pages_domains.domain_name ASC`,
      )
      .bind(like)
      .all(),
    c.env.DB
      .prepare(
        `SELECT asset_links.*
         FROM asset_links
         WHERE source_id IN (
           SELECT id FROM dns_records WHERE lower(name) LIKE ?
           UNION SELECT id FROM zones WHERE lower(name) = ?
           UNION SELECT id FROM pages_domains WHERE lower(domain_name) LIKE ?
           UNION SELECT id FROM worker_routes WHERE lower(pattern) LIKE ?
         )
         OR target_id IN (
           SELECT id FROM dns_records WHERE lower(name) LIKE ?
           UNION SELECT id FROM zones WHERE lower(name) = ?
           UNION SELECT id FROM pages_domains WHERE lower(domain_name) LIKE ?
           UNION SELECT id FROM worker_routes WHERE lower(pattern) LIKE ?
         )
         ORDER BY confidence DESC`,
      )
      .bind(like, domain, like, like, like, domain, like, like)
      .all(),
    new AssetGraphRepository(c.env.DB).graph({ domain, limit: 160 }),
  ]);

  return c.json({
    data: {
      domain,
      zones: zones.results,
      dnsRecords: dnsRecords.results,
      workerRoutes: workerRoutes.results,
      pagesDomains: pagesDomains.results,
      links: links.results,
      graph,
    },
  });
});

async function list(
  db: D1Database,
  table: string,
  profileId: string,
): Promise<unknown[]> {
  const result = await db
    .prepare(
      `SELECT * FROM ${table}
       WHERE profile_id = ? AND deleted_at IS NULL
       ORDER BY last_seen_at DESC
       LIMIT 200`,
    )
    .bind(profileId)
    .all();
  return result.results;
}
