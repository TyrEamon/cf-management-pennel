import { ProfileRepository } from "../repositories/profiles.repo";
import { SyncRepository } from "../repositories/sync.repo";
import type { SyncQueueMessage } from "../types";

export async function enqueueProfileSync(
  env: Env,
  profileId: string,
): Promise<string> {
  const sync = new SyncRepository(env.DB);
  const syncJobId = await sync.createJob("single_profile", profileId);
  await env.SYNC_QUEUE.send({
    type: "sync_profile",
    profileId,
    syncJobId,
  } satisfies SyncQueueMessage);
  return syncJobId;
}

export async function enqueueAllProfileSyncs(env: Env): Promise<string[]> {
  const profiles = await new ProfileRepository(env.DB).listEnabled();
  const jobIds: string[] = [];

  for (const profile of profiles) {
    jobIds.push(await enqueueProfileSync(env, profile.id));
  }

  return jobIds;
}

