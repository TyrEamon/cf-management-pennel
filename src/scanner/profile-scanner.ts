import { ProfileRepository } from "../repositories/profiles.repo";
import { SyncRepository } from "../repositories/sync.repo";
import { SearchIndexer } from "../search/search-indexer";
import { RelationBuilder } from "./relation-builder";
import { syncAssetsForProfile } from "./asset-scanner";

export async function syncProfile(
  env: Env,
  profileId: string,
  syncJobId: string,
): Promise<void> {
  const sync = new SyncRepository(env.DB);
  const profiles = new ProfileRepository(env.DB);

  try {
    const assetSummary = await syncAssetsForProfile(env, profileId, syncJobId);
    await new SearchIndexer(env.DB).rebuildForProfile(profileId);
    await new RelationBuilder(env.DB).rebuildForProfile(profileId);

    const hasErrors = assetSummary.errors > 0;
    const finishedAt = new Date().toISOString();

    await profiles.updateStatus(
      profileId,
      hasErrors ? "permission_error" : "ok",
      finishedAt,
    );
    await sync.finishJob(syncJobId, hasErrors ? "partial_success" : "success", {
      phase: "asset-sync",
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
