import { IssuesRepository } from "../repositories/issues.repo";
import { ProfileRepository } from "../repositories/profiles.repo";
import { SyncRepository } from "../repositories/sync.repo";
import { SearchIndexer } from "../search/search-indexer";
import { RelationBuilder } from "./relation-builder";
import { syncAssetsForProfile } from "./asset-scanner";
import { runAndStorePermissionChecks } from "./permission-checker";

export async function syncProfile(
  env: Env,
  profileId: string,
  syncJobId: string,
): Promise<void> {
  const sync = new SyncRepository(env.DB);
  const profiles = new ProfileRepository(env.DB);

  try {
    const checks = await runAndStorePermissionChecks(env, profileId);
    const issues = new IssuesRepository(env.DB);
    const hasPermissionErrors = checks.some(
      (check) =>
        check.status !== "ok" && check.status !== "empty_resource",
    );
    for (const check of checks) {
      if (check.status === "ok" || check.status === "empty_resource") continue;
      await issues.add({
        profileId,
        issueType: check.status,
        severity: check.status === "token_invalid" ? "error" : "warning",
        resourceType: "permission_check",
        resourceId: check.checkKey,
        title: `Permission check failed: ${check.checkKey}`,
        message: check.message ?? `Cloudflare check returned ${check.status}`,
        raw: check,
      });
    }
    const assetSummary = await syncAssetsForProfile(env, profileId, syncJobId);
    await new SearchIndexer(env.DB).rebuildForProfile(profileId);
    await new RelationBuilder(env.DB).rebuildForProfile(profileId);

    const hasErrors = hasPermissionErrors || assetSummary.errors > 0;
    const finishedAt = new Date().toISOString();

    await profiles.updateStatus(
      profileId,
      hasErrors ? "permission_error" : "ok",
      finishedAt,
    );
    await sync.finishJob(syncJobId, hasErrors ? "partial_success" : "success", {
      phase: "asset-sync",
      checks,
      assets: assetSummary,
    });
  } catch (error) {
    await profiles.updateStatus(profileId, "sync_error");
    await sync.recordError({
      syncJobId,
      profileId,
      resourceType: "profile",
      operation: "sync_profile",
      message: error instanceof Error ? error.message : "Unknown sync error",
    });
    await sync.finishJob(syncJobId, "failed");
    throw error;
  }
}
