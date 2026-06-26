type AssetLinkRow = {
  id: string;
  profile_id: string;
  profile_name: string | null;
  source_type: string;
  source_id: string;
  target_type: string;
  target_id: string;
  relation: string;
  confidence: number;
  reason: string | null;
  updated_at: string;
};

type GraphNode = {
  key: string;
  id: string;
  type: string;
  label: string;
  subtitle: string | null;
  profileId: string | null;
  profileName: string | null;
};

type GraphEdge = {
  id: string;
  source: string;
  target: string;
  sourceType: string;
  sourceId: string;
  targetType: string;
  targetId: string;
  relation: string;
  confidence: number;
  reason: string | null;
  profileId: string;
  profileName: string | null;
  updatedAt: string;
};

export type AssetGraph = {
  nodes: GraphNode[];
  edges: GraphEdge[];
};

type ResourceConfig = {
  table: string;
  labelColumn: string;
  subtitleExpression: string;
};

const resourceConfigs: Record<string, ResourceConfig> = {
  zone: {
    table: "zones",
    labelColumn: "name",
    subtitleExpression: "'Zone'",
  },
  worker: {
    table: "workers",
    labelColumn: "name",
    subtitleExpression: "'Worker script'",
  },
  pages_project: {
    table: "pages_projects",
    labelColumn: "name",
    subtitleExpression: "COALESCE(subdomain, 'Pages project')",
  },
  pages_domain: {
    table: "pages_domains",
    labelColumn: "domain_name",
    subtitleExpression: "'Pages: ' || project_name",
  },
  r2_bucket: {
    table: "r2_buckets",
    labelColumn: "name",
    subtitleExpression: "'R2 bucket'",
  },
  d1_database: {
    table: "d1_databases",
    labelColumn: "name",
    subtitleExpression: "COALESCE(uuid, 'D1 database')",
  },
  kv_namespace: {
    table: "kv_namespaces",
    labelColumn: "title",
    subtitleExpression: "'KV namespace'",
  },
};

export class AssetGraphRepository {
  constructor(private readonly db: D1Database) {}

  async graph(input: {
    profileId?: string | null;
    domain?: string | null;
    limit?: number;
  } = {}): Promise<AssetGraph> {
    const links = input.domain
      ? await this.linksForDomain(input.domain, input.profileId, input.limit)
      : await this.links(input.profileId, input.limit);

    return this.toGraph(links);
  }

  async graphForResource(
    resourceType: string,
    resourceId: string,
    limit = 120,
  ): Promise<AssetGraph> {
    const result = await this.db
      .prepare(
        `SELECT asset_links.*, profiles.name AS profile_name
         FROM asset_links
         LEFT JOIN profiles ON profiles.id = asset_links.profile_id
         WHERE (source_type = ? AND source_id = ?)
            OR (target_type = ? AND target_id = ?)
         ORDER BY confidence DESC, updated_at DESC
         LIMIT ?`,
      )
      .bind(resourceType, resourceId, resourceType, resourceId, limit)
      .all<AssetLinkRow>();

    return this.toGraph(result.results);
  }

  private async links(
    profileId?: string | null,
    limit = 200,
  ): Promise<AssetLinkRow[]> {
    const cappedLimit = limitForGraph(limit);
    if (profileId) {
      const result = await this.db
        .prepare(
          `SELECT asset_links.*, profiles.name AS profile_name
           FROM asset_links
           LEFT JOIN profiles ON profiles.id = asset_links.profile_id
           WHERE asset_links.profile_id = ?
           ORDER BY confidence DESC, updated_at DESC
           LIMIT ?`,
        )
        .bind(profileId, cappedLimit)
        .all<AssetLinkRow>();
      return result.results;
    }

    const result = await this.db
      .prepare(
        `SELECT asset_links.*, profiles.name AS profile_name
         FROM asset_links
         LEFT JOIN profiles ON profiles.id = asset_links.profile_id
         ORDER BY confidence DESC, updated_at DESC
         LIMIT ?`,
      )
      .bind(cappedLimit)
      .all<AssetLinkRow>();
    return result.results;
  }

  private async linksForDomain(
    domain: string,
    profileId?: string | null,
    limit = 200,
  ): Promise<AssetLinkRow[]> {
    const normalized = domain.trim().toLowerCase();
    const like = `%${normalized}%`;
    const cappedLimit = limitForGraph(limit);
    const profileClause = profileId ? "AND profile_id = ?" : "";
    const seedValues = [normalized, like, normalized, like];
    const binds: Array<string | number> = profileId
      ? [...seedValues.flatMap((value) => [value, profileId]), cappedLimit]
      : [...seedValues, cappedLimit];

    const result = await this.db
      .prepare(
        `SELECT asset_links.*, profiles.name AS profile_name
         FROM asset_links
         LEFT JOIN profiles ON profiles.id = asset_links.profile_id
         WHERE source_id IN (
           SELECT id FROM zones WHERE lower(name) = ? ${profileClause}
           UNION SELECT id FROM pages_domains WHERE lower(domain_name) LIKE ? ${profileClause}
         )
         OR target_id IN (
           SELECT id FROM zones WHERE lower(name) = ? ${profileClause}
           UNION SELECT id FROM pages_domains WHERE lower(domain_name) LIKE ? ${profileClause}
         )
         ORDER BY confidence DESC, updated_at DESC
         LIMIT ?`,
      )
      .bind(...binds)
      .all<AssetLinkRow>();
    return result.results;
  }

  private async toGraph(links: AssetLinkRow[]): Promise<AssetGraph> {
    const nodeKeys = new Map<string, Set<string>>();
    for (const link of links) {
      addNodeId(nodeKeys, link.source_type, link.source_id);
      addNodeId(nodeKeys, link.target_type, link.target_id);
    }

    const nodes = await this.loadNodes(nodeKeys);
    const nodeMap = new Map(nodes.map((node) => [node.key, node]));

    for (const link of links) {
      const sourceKey = graphKey(link.source_type, link.source_id);
      const targetKey = graphKey(link.target_type, link.target_id);
      if (!nodeMap.has(sourceKey)) {
        nodeMap.set(sourceKey, fallbackNode(link.source_type, link.source_id, link.profile_id, link.profile_name));
      }
      if (!nodeMap.has(targetKey)) {
        nodeMap.set(targetKey, fallbackNode(link.target_type, link.target_id, link.profile_id, link.profile_name));
      }
    }

    return {
      nodes: [...nodeMap.values()].sort((a, b) => a.type.localeCompare(b.type) || a.label.localeCompare(b.label)),
      edges: links.map((link) => ({
        id: link.id,
        source: graphKey(link.source_type, link.source_id),
        target: graphKey(link.target_type, link.target_id),
        sourceType: link.source_type,
        sourceId: link.source_id,
        targetType: link.target_type,
        targetId: link.target_id,
        relation: link.relation,
        confidence: link.confidence,
        reason: link.reason,
        profileId: link.profile_id,
        profileName: link.profile_name,
        updatedAt: link.updated_at,
      })),
    };
  }

  private async loadNodes(nodeKeys: Map<string, Set<string>>): Promise<GraphNode[]> {
    const nodes: GraphNode[] = [];
    for (const [type, ids] of nodeKeys.entries()) {
      const config = resourceConfigs[type];
      if (!config || ids.size === 0) continue;
      const idList = [...ids];
      const placeholders = idList.map(() => "?").join(", ");
      const result = await this.db
        .prepare(
          `SELECT ${config.table}.id,
                  ${config.table}.profile_id,
                  profiles.name AS profile_name,
                  ${config.table}.${config.labelColumn} AS label,
                  ${config.subtitleExpression} AS subtitle
           FROM ${config.table}
           LEFT JOIN profiles ON profiles.id = ${config.table}.profile_id
           WHERE ${config.table}.id IN (${placeholders})`,
        )
        .bind(...idList)
        .all<{
          id: string;
          profile_id: string;
          profile_name: string | null;
          label: string;
          subtitle: string | null;
        }>();

      for (const row of result.results) {
        nodes.push({
          key: graphKey(type, row.id),
          id: row.id,
          type,
          label: row.label,
          subtitle: row.subtitle,
          profileId: row.profile_id,
          profileName: row.profile_name,
        });
      }
    }
    return nodes;
  }
}

function addNodeId(map: Map<string, Set<string>>, type: string, id: string): void {
  if (!map.has(type)) map.set(type, new Set());
  map.get(type)?.add(id);
}

function graphKey(type: string, id: string): string {
  return `${type}:${id}`;
}

function fallbackNode(
  type: string,
  id: string,
  profileId: string | null,
  profileName: string | null,
): GraphNode {
  return {
    key: graphKey(type, id),
    id,
    type,
    label: id,
    subtitle: humanType(type),
    profileId,
    profileName,
  };
}

function humanType(type: string): string {
  return type.replace(/_/g, " ");
}

function limitForGraph(value = 200): number {
  if (!Number.isFinite(value)) return 200;
  return Math.max(1, Math.min(Math.trunc(value), 500));
}
