import { Hono } from "hono";

type AppBindings = {
  Bindings: Env;
};

export const healthRoute = new Hono<AppBindings>();

healthRoute.get("/", (c) =>
  c.json({
    ok: true,
    service: "cf-asset-hub",
    environment: c.env.ENVIRONMENT,
  }),
);

