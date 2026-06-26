import { Hono } from "hono";
import { SyncRepository } from "../repositories/sync.repo";
import { enqueueAllProfileSyncs } from "../scanner/sync-queue";

type AppBindings = {
  Bindings: Env;
};

export const syncRoute = new Hono<AppBindings>();

syncRoute.post("/all", async (c) => {
  const syncJobIds = await enqueueAllProfileSyncs(c.env);
  return c.json({ data: { syncJobIds, status: "queued" } }, 202);
});

syncRoute.get("/jobs", async (c) => {
  const jobs = await new SyncRepository(c.env.DB).listJobs();
  return c.json({ data: jobs });
});

syncRoute.get("/jobs/:id/errors", async (c) => {
  const errors = await new SyncRepository(c.env.DB).listErrors(c.req.param("id"));
  return c.json({ data: errors });
});

