import { Hono } from "hono";
import { SearchRepository } from "../repositories/search.repo";

type AppBindings = {
  Bindings: Env;
};

export const searchRoute = new Hono<AppBindings>();

searchRoute.get("/", async (c) => {
  const query = c.req.query("q") ?? "";
  const results = await new SearchRepository(c.env.DB).search(query);
  return c.json({ data: results });
});

