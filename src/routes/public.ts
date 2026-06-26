import { Hono } from "hono";
import { AssetsRepository } from "../repositories/assets.repo";
import { ProfileSummariesRepository } from "../repositories/profile-summaries.repo";

type AppBindings = {
  Bindings: Env;
};

export const publicRoute = new Hono<AppBindings>();

/**
 * 公开概览：无需登录，只返回可安全公开的汇总数据。
 * 账号名打码，不含 Account ID、备注、邮箱，也不含任何具体资源明细。
 */
publicRoute.get("/overview", async (c) => {
  const [overview, summaries] = await Promise.all([
    new AssetsRepository(c.env.DB).overview(),
    new ProfileSummariesRepository(c.env.DB).list(),
  ]);

  const accounts = summaries.map((p) => ({
    maskedName: maskName(p.name),
    enabled: p.enabled,
    domainTotal: p.domainTotal,
    workers: p.counts.workers,
    pagesProjects: p.counts.pagesProjects,
    dnsRecords: p.counts.dnsRecords,
    totalAssets: p.totalAssets,
    hasIssues: p.counts.openIssues > 0,
  }));

  return c.json({ data: { overview, accounts } });
});

function maskName(name: string): string {
  const t = (name ?? "").trim();
  if (!t) return "账号";
  if (t.length === 1) return `${t}••`;
  return `${t.slice(0, 1)}${"•".repeat(Math.min(t.length - 1, 4))}`;
}
