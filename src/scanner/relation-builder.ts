import { IssuesRepository } from "../repositories/issues.repo";
import { LinksRepository } from "../repositories/links.repo";
import { sha256Hex } from "../shared/ids";

type ZoneRow = { id: string; name: string };
type DnsRow = { id: string; name: string; type: string; content: string | null; zone_id: string; zone_name: string };
type RouteRow = { id: string; pattern: string; script_name: string | null; zone_id: string; zone_name: string };
type WorkerRow = { id: string; name: string };
type PagesProjectRow = { id: string; name: string; subdomain: string | null };
type PagesDomainRow = { id: string; project_name: string; domain_name: string };

export class RelationBuilder {
  constructor(private readonly db: D1Database) {}

  async rebuildForProfile(profileId: string): Promise<void> {
    const links = new LinksRepository(this.db);
    const issues = new IssuesRepository(this.db);
    await links.clearProfile(profileId);
    await issues.clearGeneratedForProfile(profileId);

    const zones = await this.list<ZoneRow>(
      "SELECT id, name FROM zones WHERE profile_id = ? AND deleted_at IS NULL",
      profileId,
    );
    const dnsRecords = await this.list<DnsRow>(
      `SELECT id, name, type, content, zone_id, zone_name
       FROM dns_records WHERE profile_id = ? AND deleted_at IS NULL`,
      profileId,
    );
    const routes = await this.list<RouteRow>(
      `SELECT id, pattern, script_name, zone_id, zone_name
       FROM worker_routes WHERE profile_id = ? AND deleted_at IS NULL`,
      profileId,
    );
    const workers = await this.list<WorkerRow>(
      "SELECT id, name FROM workers WHERE profile_id = ? AND deleted_at IS NULL",
      profileId,
    );
    const pagesProjects = await this.list<PagesProjectRow>(
      "SELECT id, name, subdomain FROM pages_projects WHERE profile_id = ? AND deleted_at IS NULL",
      profileId,
    );
    const pagesDomains = await this.list<PagesDomainRow>(
      "SELECT id, project_name, domain_name FROM pages_domains WHERE profile_id = ? AND deleted_at IS NULL",
      profileId,
    );

    const workerByName = new Map(workers.map((worker) => [worker.name, worker]));
    const pagesByName = new Map(pagesProjects.map((project) => [project.name, project]));
    const pagesBySubdomain = new Map(
      pagesProjects
        .filter((project) => project.subdomain)
        .map((project) => [project.subdomain as string, project]),
    );
    const dnsByName = new Map(dnsRecords.map((record) => [record.name, record]));
    const dnsByLowerName = new Map(dnsRecords.map((record) => [record.name.toLowerCase(), record]));

    for (const zone of zones) {
      const zoneDns = dnsRecords.filter((record) => record.zone_id === zone.id);
      for (const record of zoneDns) {
        await links.add({
          profileId,
          sourceType: "zone",
          sourceId: zone.id,
          targetType: "dns_record",
          targetId: record.id,
          relation: "contains",
          confidence: 1,
          reason: "DNS record belongs to this Cloudflare zone.",
        });
      }
    }

    for (const route of routes) {
      await links.add({
        profileId,
        sourceType: "zone",
        sourceId: route.zone_id,
        targetType: "worker_route",
        targetId: route.id,
        relation: "served_by",
        confidence: 0.95,
        reason: "Worker route is configured on this zone.",
      });

      if (route.script_name) {
        const worker = workerByName.get(route.script_name);
        if (worker) {
          await links.add({
            profileId,
            sourceType: "worker_route",
            sourceId: route.id,
            targetType: "worker",
            targetId: worker.id,
            relation: "served_by",
            confidence: 1,
            reason: "Worker route script name matches a Worker script.",
          });
        } else {
          await issues.add({
            profileId,
            issueType: "route_missing_worker",
            severity: "warning",
            resourceType: "worker_route",
            resourceId: route.id,
            title: "Worker Route points to a missing Worker",
            message: `${route.pattern} references ${route.script_name}, but the Worker was not found in this account scan.`,
            raw: route,
          });
        }
      }

      const routeHost = hostFromWorkerRoutePattern(route.pattern);
      if (routeHost) {
        const matchedDns = dnsForRouteHost(routeHost, dnsByLowerName);
        if (matchedDns) {
          await links.add({
            profileId,
            sourceType: "dns_record",
            sourceId: matchedDns.id,
            targetType: "worker_route",
            targetId: route.id,
            relation: "served_by",
            confidence: routeHost.includes("*") ? 0.8 : 0.9,
            reason: "DNS record name matches the Worker route hostname.",
          });
        }
      }
    }

    for (const domain of pagesDomains) {
      const project = pagesByName.get(domain.project_name);
      if (project) {
        await links.add({
          profileId,
          sourceType: "pages_domain",
          sourceId: domain.id,
          targetType: "pages_project",
          targetId: project.id,
          relation: "bound_to",
          confidence: 1,
          reason: "Pages Custom Domains API returned this binding.",
        });
      }

      const dnsRecord = dnsByName.get(domain.domain_name);
      if (dnsRecord) {
        await links.add({
          profileId,
          sourceType: "pages_domain",
          sourceId: domain.id,
          targetType: "dns_record",
          targetId: dnsRecord.id,
          relation: "has_dns",
          confidence: 0.9,
          reason: "Pages custom domain has a DNS record with the same hostname.",
        });
      } else {
        await issues.add({
          profileId,
          issueType: "pages_domain_dns_missing",
          severity: "info",
          resourceType: "pages_domain",
          resourceId: domain.id,
          title: "Pages domain has no matching DNS record in scan",
          message: `${domain.domain_name} is bound to Pages project ${domain.project_name}, but no matching DNS record was found in this Cloudflare account.`,
          raw: domain,
        });
      }
    }

    for (const record of dnsRecords) {
      const content = record.content ?? "";
      if (record.type === "CNAME" && content.endsWith(".pages.dev")) {
        const projectName = content.replace(/\.pages\.dev\.?$/i, "");
        const project = pagesByName.get(projectName) ?? pagesBySubdomain.get(content);
        if (project) {
          await links.add({
            profileId,
            sourceType: "dns_record",
            sourceId: record.id,
            targetType: "pages_project",
            targetId: project.id,
            relation: "probably_bound_to",
            confidence: 0.75,
            reason: "DNS CNAME points to a pages.dev hostname.",
          });
        } else {
          await issues.add({
            profileId,
            issueType: "cname_pages_project_missing",
            severity: "warning",
            resourceType: "dns_record",
            resourceId: record.id,
            title: "CNAME points to pages.dev but project was not found",
            message: `${record.name} points to ${content}, but no matching Pages project was found in this account scan.`,
            raw: record,
          });
        }
      }

      if (record.type === "CNAME" && content.includes(".cfargotunnel.com")) {
        await links.add({
          profileId,
          sourceType: "dns_record",
          sourceId: record.id,
          targetType: "tunnel_hint",
          targetId: `tunnel_${await sha256Hex(content)}`,
          relation: "possibly_tunnel",
          confidence: 0.8,
          reason: "DNS CNAME points to a Cloudflare Tunnel hostname.",
        });
      }
    }
  }

  private async list<T>(sql: string, profileId: string): Promise<T[]> {
    const result = await this.db.prepare(sql).bind(profileId).all<T>();
    return result.results;
  }
}

export function hostFromWorkerRoutePattern(pattern: string): string | null {
  const trimmed = pattern.trim().toLowerCase();
  if (!trimmed) return null;
  const withoutScheme = trimmed.replace(/^https?:\/\//, "");
  const host = withoutScheme.split("/")[0]?.replace(/:\d+$/, "");
  return host || null;
}

function dnsForRouteHost(
  routeHost: string,
  dnsByLowerName: Map<string, DnsRow>,
): DnsRow | null {
  if (!routeHost.includes("*")) {
    return dnsByLowerName.get(routeHost) ?? null;
  }

  const suffix = routeHost.replace(/^\*\./, "").replace(/\*/g, "");
  for (const [name, record] of dnsByLowerName.entries()) {
    if (name === suffix || name.endsWith(`.${suffix}`)) return record;
  }
  return null;
}
