import { Hono } from "hono";
import { z } from "zod";
import { encryptToken } from "../crypto/token-crypto";
import { ProfileRepository } from "../repositories/profiles.repo";
import { runAndStorePermissionChecks } from "../scanner/permission-checker";
import { enqueueProfileSync } from "../scanner/sync-queue";

type AppBindings = {
  Bindings: Env;
};

const createProfileSchema = z.object({
  name: z.string().min(1),
  accountId: z.string().min(1),
  apiToken: z.string().min(10),
  emailHint: z.string().email().optional().nullable(),
  note: z.string().optional().nullable(),
});

const updateProfileSchema = z.object({
  enabled: z.boolean().optional(),
});

export const profilesRoute = new Hono<AppBindings>();

profilesRoute.get("/", async (c) => {
  const profiles = await new ProfileRepository(c.env.DB).list();
  return c.json({ data: profiles });
});

profilesRoute.post("/", async (c) => {
  const payload = createProfileSchema.parse(await c.req.json());
  const encryptedToken = await encryptToken(
    payload.apiToken,
    c.env.APP_MASTER_KEY_BASE64,
  );
  const profile = await new ProfileRepository(c.env.DB).create({
    name: payload.name,
    accountId: payload.accountId,
    emailHint: payload.emailHint ?? null,
    note: payload.note ?? null,
    encryptedToken,
  });

  return c.json({ data: profile }, 201);
});

profilesRoute.get("/:id", async (c) => {
  const row = await new ProfileRepository(c.env.DB).get(c.req.param("id"));
  if (!row) return c.json({ error: "Profile not found" }, 404);

  return c.json({
    data: {
      id: row.id,
      name: row.name,
      accountId: row.account_id,
      emailHint: row.email_hint,
      note: row.note,
      tokenHint: row.token_hint ? `****${row.token_hint}` : null,
      enabled: row.enabled === 1,
      status: row.status,
      lastSyncAt: row.last_sync_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    },
  });
});

profilesRoute.patch("/:id", async (c) => {
  const payload = updateProfileSchema.parse(await c.req.json());
  if (payload.enabled === undefined) {
    return c.json({ error: "No supported fields provided" }, 400);
  }

  const profile = await new ProfileRepository(c.env.DB).updateEnabled(
    c.req.param("id"),
    payload.enabled,
  );
  return c.json({ data: profile });
});

profilesRoute.post("/:id/test", async (c) => {
  const checks = await runAndStorePermissionChecks(c.env, c.req.param("id"));
  return c.json({ data: checks });
});

profilesRoute.post("/:id/sync", async (c) => {
  const profileId = c.req.param("id");
  await new ProfileRepository(c.env.DB).getRequired(profileId);
  const syncJobId = await enqueueProfileSync(c.env, profileId);

  return c.json({ data: { syncJobId, status: "queued" } }, 202);
});

