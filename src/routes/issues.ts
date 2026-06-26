import { Hono } from "hono";
import { IssuesRepository } from "../repositories/issues.repo";

type AppBindings = {
  Bindings: Env;
};

export const issuesRoute = new Hono<AppBindings>();

issuesRoute.get("/", async (c) => {
  const issues = await new IssuesRepository(c.env.DB).listOpen();
  return c.json({ data: issues });
});

