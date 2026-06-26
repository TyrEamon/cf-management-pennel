import { Hono } from "hono";
import { SettingsRepository } from "../repositories/settings.repo";
import {
  APPEARANCE_SETTING_KEY,
  appearanceSchema,
  normalizeAppearance,
} from "../settings/appearance";

type AppBindings = {
  Bindings: Env;
};

export const settingsRoute = new Hono<AppBindings>();

settingsRoute.get("/appearance", async (c) => {
  const stored = await new SettingsRepository(c.env.DB).getJson<unknown>(
    APPEARANCE_SETTING_KEY,
  );
  return c.json({ data: normalizeAppearance(stored) });
});

settingsRoute.put("/appearance", async (c) => {
  const payload = appearanceSchema.parse(await c.req.json());
  await new SettingsRepository(c.env.DB).putJson(APPEARANCE_SETTING_KEY, payload);
  return c.json({ data: payload });
});
