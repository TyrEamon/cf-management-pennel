import { CloudflareClient, type CfRecord } from "../cf/cf-client";
import { CloudflareApiError, type CloudflareErrorKind } from "../cf/errors";
import { decryptToken } from "../crypto/token-crypto";
import { PermissionChecksRepository } from "../repositories/permission-checks.repo";
import { ProfileRepository } from "../repositories/profiles.repo";
import { getString } from "../shared/record";
import type { PermissionCheckResult, PermissionStatus, ProfileRow } from "../types";

export async function runAndStorePermissionChecks(
  env: Env,
  profileId: string,
): Promise<PermissionCheckResult[]> {
  const profiles = new ProfileRepository(env.DB);
  const profile = await profiles.getRequired(profileId);
  const checks = await runPermissionChecks(env, profile);
  await new PermissionChecksRepository(env.DB).replaceForProfile(
    profileId,
    checks,
  );

  const hasTokenInvalid = checks.some((check) => check.status === "token_invalid");
  const hasPermissionError = checks.some(
    (check) => check.status === "permission_denied",
  );

  await profiles.updateStatus(
    profileId,
    hasTokenInvalid ? "token_invalid" : hasPermissionError ? "permission_error" : "ok",
  );

  return checks;
}

export async function runPermissionChecks(
  env: Env,
  profile: ProfileRow,
): Promise<PermissionCheckResult[]> {
  const token = await decryptToken(
    {
      ciphertext: profile.token_ciphertext,
      iv: profile.token_iv,
      authTag: profile.token_auth_tag,
    },
    env.APP_MASTER_KEY_BASE64,
  );
  const client = new CloudflareClient(env, token);
  const checks: PermissionCheckResult[] = [];
  let pagesProjects: CfRecord[] = [];

  checks.push(
    await check("token.verify", async () => {
      await client.verifyToken();
    }),
  );

  checks.push(
    await check("zones.list", async () => {
      const zones = await client.listZones();
      return zones.length === 0 ? "empty_resource" : "ok";
    }),
  );

  checks.push(
    await check("workers.scripts.list", async () => {
      const workers = await client.listWorkerScripts(profile.account_id);
      return workers.length === 0 ? "empty_resource" : "ok";
    }),
  );

  checks.push(
    await check("pages.projects.list", async () => {
      pagesProjects = await client.listPagesProjects(profile.account_id);
      return pagesProjects.length === 0 ? "empty_resource" : "ok";
    }),
  );

  const firstProjectName = getString(pagesProjects[0] ?? {}, "name");
  if (firstProjectName) {
    checks.push(
      await check("pages.domains.list", async () => {
        const domains = await client.listPagesDomains(
          profile.account_id,
          firstProjectName,
        );
        return domains.length === 0 ? "empty_resource" : "ok";
      }),
    );
  } else {
    checks.push(empty("pages.domains.list", "No Pages projects available"));
  }

  checks.push(
    await check("r2.buckets.list", async () => {
      const buckets = await client.listR2Buckets(profile.account_id);
      return buckets.length === 0 ? "empty_resource" : "ok";
    }),
  );

  checks.push(
    await check("d1.databases.list", async () => {
      const databases = await client.listD1Databases(profile.account_id);
      return databases.length === 0 ? "empty_resource" : "ok";
    }),
  );

  checks.push(
    await check("kv.namespaces.list", async () => {
      const namespaces = await client.listKvNamespaces(profile.account_id);
      return namespaces.length === 0 ? "empty_resource" : "ok";
    }),
  );

  return checks;
}

async function check(
  checkKey: string,
  fn: () => Promise<PermissionStatus | void>,
): Promise<PermissionCheckResult> {
  try {
    const status = (await fn()) ?? "ok";
    return { checkKey, status };
  } catch (error) {
    if (error instanceof CloudflareApiError) {
      const result: PermissionCheckResult = {
        checkKey,
        status: toPermissionStatus(error.kind),
        message: error.message,
      };
      if (error.httpStatus !== undefined) result.httpStatus = error.httpStatus;
      if (error.errorCode !== undefined) result.errorCode = error.errorCode;
      if (error.rawJson !== undefined) result.rawJson = error.rawJson;
      return result;
    }

    return {
      checkKey,
      status: "network_error",
      message: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

function empty(checkKey: string, message: string): PermissionCheckResult {
  return {
    checkKey,
    status: "empty_resource",
    message,
  };
}

function toPermissionStatus(kind: CloudflareErrorKind): PermissionStatus {
  switch (kind) {
    case "token_invalid":
      return "token_invalid";
    case "permission_denied":
      return "permission_denied";
    case "rate_limited":
      return "rate_limited";
    case "not_found":
    case "cloudflare_error":
    case "parse_error":
    case "unknown_error":
      return "api_error";
    case "network_error":
      return "network_error";
  }
}
