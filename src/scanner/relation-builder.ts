import { IssuesRepository } from "../repositories/issues.repo";
import { LinksRepository } from "../repositories/links.repo";

type PagesProjectRow = { id: string; name: string };
type PagesDomainRow = { id: string; project_name: string };

export class RelationBuilder {
  constructor(private readonly db: D1Database) {}

  async rebuildForProfile(profileId: string): Promise<void> {
    const links = new LinksRepository(this.db);
    const issues = new IssuesRepository(this.db);
    await links.clearProfile(profileId);
    await issues.clearGeneratedForProfile(profileId);

    const pagesProjects = await this.list<PagesProjectRow>(
      "SELECT id, name FROM pages_projects WHERE profile_id = ? AND deleted_at IS NULL",
      profileId,
    );
    const pagesDomains = await this.list<PagesDomainRow>(
      "SELECT id, project_name FROM pages_domains WHERE profile_id = ? AND deleted_at IS NULL",
      profileId,
    );

    const pagesByName = new Map(pagesProjects.map((project) => [project.name, project]));

    for (const domain of pagesDomains) {
      const project = pagesByName.get(domain.project_name);
      if (!project) continue;

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
  }

  private async list<T>(sql: string, profileId: string): Promise<T[]> {
    const result = await this.db.prepare(sql).bind(profileId).all<T>();
    return result.results;
  }
}
