import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { ZodError } from "zod";
import { adminAuth } from "./auth/admin-auth";
import { assetsRoute } from "./routes/assets";
import { healthRoute } from "./routes/health";
import { issuesRoute } from "./routes/issues";
import { profilesRoute } from "./routes/profiles";
import { publicRoute } from "./routes/public";
import { settingsRoute } from "./routes/settings";
import { searchRoute } from "./routes/search";
import { syncRoute } from "./routes/sync";
import { syncProfile } from "./scanner/profile-scanner";
import { enqueueAllProfileSyncs } from "./scanner/sync-queue";
import type { SyncQueueMessage } from "./types";

type AppBindings = {
  Bindings: Env;
};

const app = new Hono<AppBindings>();

app.route("/api/health", healthRoute);
app.route("/api/public", publicRoute);
app.use("/api/*", adminAuth);
app.route("/api/profiles", profilesRoute);
app.route("/api/sync", syncRoute);
app.route("/api/search", searchRoute);
app.route("/api/assets", assetsRoute);
app.route("/api/issues", issuesRoute);
app.route("/api/settings", settingsRoute);

app.notFound((c) => c.json({ error: "Not found" }, 404));

app.onError((error, c) => {
  if (error instanceof ZodError) {
    return c.json({ error: "Validation failed", details: error.flatten() }, 400);
  }
  if (error instanceof HTTPException) {
    return error.getResponse();
  }

  console.error(
    JSON.stringify({
      level: "error",
      message: error instanceof Error ? error.message : "Unknown error",
    }),
  );
  return c.json({ error: "Internal server error" }, 500);
});

export default {
  fetch: app.fetch,

  async queue(batch, env): Promise<void> {
    for (const message of batch.messages) {
      if (message.body.type === "sync_profile") {
        await syncProfile(env, message.body.profileId, message.body.syncJobId);
      } else if (message.body.type === "sync_all") {
        await enqueueAllProfileSyncs(env);
      }
    }
  },

  async scheduled(_controller, env, ctx): Promise<void> {
    ctx.waitUntil(enqueueAllProfileSyncs(env));
  },
} satisfies ExportedHandler<Env, SyncQueueMessage>;
