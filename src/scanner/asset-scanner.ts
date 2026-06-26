import { CloudflareClient, type CfRecord } from "../cf/cf-client";
import { CloudflareApiError } from "../cf/errors";
import { decryptToken } from "../crypto/token-crypto";
import {
  AssetsRepository,
  d1DatabaseFromCf,
  dnsFromCf,
  kvNamespaceFromCf,
  pagesDomainFromCf,
  pagesProjectFromCf,
  r2BucketFromCf,
  workerFromCf,
  workerRouteFromCf,
  zoneFromCf,
} from "../repositories/assets.repo";
import { ProfileRepository } from "../repositories/profiles.repo";
import { SyncRepository } from "../repositories/sync.repo";
import { asObject, getString } from "../shared/record";
import type { ProfileRow } from "../types";

export type AssetSyncSummary = {
  zones: number;
  dnsRecords: number;
  workers: number;
  workerRoutes: number;
  pagesProjects: number;
  pagesDomains: number;
  r2Buckets: number;
  d1Databases: number;
  kvNamespaces: number;
  errors: number;
};

type ScannerContext = {
  env: Env;
  syncJobId: string;
  profile: ProfileRow;
  client: CloudflareClient;
  assets: AssetsRepository;
  sync: SyncRepository;
  summary: AssetSyncSummary;
};

type ZoneRef = {
  id: string;
  name: string;
};

export async function syncAssetsForProfile(
  env: Env,
  profileId: string,
  syncJobId: string,
): Promise<AssetSyncSummary> {
  const profile = await new ProfileRepository(env.DB).getRequired(profileId);
  const token = await decryptToken(
    {
      ciphertext: profile.token_ciphertext,
      iv: profile.token_iv,
      authTag: profile.token_auth_tag,
    },
    env.APP_MASTER_KEY_BASE64,
  );

  const context: ScannerContext = {
    env,
    syncJobId,
    profile,
    client: new CloudflareClient(env, token),
    assets: new AssetsRepository(env.DB),
    sync: new SyncRepository(env.DB),
    summary: emptySummary(),
  };

  await context.assets.upsertAccount({
    id: profile.account_id,
    profileId: profile.id,
    name: profile.name,
    raw: { source: "profile" },
  });

  let zones: ZoneRef[] = [];
  await runModule(context, "zones", "zones.list", async () => {
    zones = await syncZones(context);
  });

  if (zones.length > 0) {
    await runModule(context, "dns_records", "dns.list", async () => {
      await syncDnsRecords(context, zones);
    });
    await runModule(context, "worker_routes", "workers.routes.list", async () => {
      await syncWorkerRoutes(context, zones);
    });
  }

  await runModule(context, "workers", "workers.scripts.list", async () => {
    await syncWorkers(context);
  });
  await runModule(context, "pages_projects", "pages.projects.list", async () => {
    await syncPages(context);
  });
  await runModule(context, "r2_buckets", "r2.buckets.list", async () => {
    await syncR2(context);
  });
  await runModule(context, "d1_databases", "d1.databases.list", async () => {
    await syncD1(context);
  });
  await runModule(context, "kv_namespaces", "kv.namespaces.list", async () => {
    await syncKv(context);
  });

  return context.summary;
}

async function syncZones(context: ScannerContext): Promise<ZoneRef[]> {
  const syncStartedAt = new Date().toISOString();
  const rawZones = await context.client.listZones();
  const zones: ZoneRef[] = [];

  for (const rawZone of rawZones) {
    const zone = await zoneFromCf(
      asObject(rawZone),
      context.profile.id,
      context.profile.account_id,
    );
    if (!zone) continue;
    if (zone.accountId !== context.profile.account_id) continue;

    await context.assets.upsertZone(zone);
    await upsertAccountFromZone(context, rawZone);
    zones.push({ id: zone.id, name: zone.name });
    context.summary.zones += 1;
  }

  await context.assets.markMissingDeleted("zones", context.profile.id, syncStartedAt);
  return zones;
}

async function syncDnsRecords(context: ScannerContext, zones: ZoneRef[]): Promise<void> {
  const syncStartedAt = new Date().toISOString();
  for (const zone of zones) {
    const records = await context.client.listDnsRecords(zone.id);
    for (const rawRecord of records) {
      const record = dnsFromCf(
        asObject(rawRecord),
        context.profile.id,
        context.profile.account_id,
        zone.id,
        zone.name,
      );
      if (!record) continue;
      await context.assets.upsertDnsRecord(record);
      context.summary.dnsRecords += 1;
    }
  }
  await context.assets.markMissingDeleted(
    "dns_records",
    context.profile.id,
    syncStartedAt,
  );
}

async function syncWorkerRoutes(context: ScannerContext, zones: ZoneRef[]): Promise<void> {
  const syncStartedAt = new Date().toISOString();
  for (const zone of zones) {
    const routes = await context.client.listWorkerRoutes(zone.id);
    for (const rawRoute of routes) {
      const route = await workerRouteFromCf(
        asObject(rawRoute),
        context.profile.id,
        context.profile.account_id,
        zone.id,
        zone.name,
      );
      if (!route) continue;
      await context.assets.upsertWorkerRoute(route);
      context.summary.workerRoutes += 1;
    }
  }
  await context.assets.markMissingDeleted(
    "worker_routes",
    context.profile.id,
    syncStartedAt,
  );
}

async function syncWorkers(context: ScannerContext): Promise<void> {
  const syncStartedAt = new Date().toISOString();
  const workers = await context.client.listWorkerScripts(context.profile.account_id);
  for (const rawWorker of workers) {
    const worker = await workerFromCf(
      asObject(rawWorker),
      context.profile.id,
      context.profile.account_id,
    );
    if (!worker) continue;
    await context.assets.upsertWorker(worker);
    context.summary.workers += 1;
  }
  await context.assets.markMissingDeleted(
    "workers",
    context.profile.id,
    syncStartedAt,
  );
}

async function syncPages(context: ScannerContext): Promise<void> {
  const projectsStartedAt = new Date().toISOString();
  const domainsStartedAt = new Date().toISOString();
  const projects = await context.client.listPagesProjects(context.profile.account_id);
  const projectNames: string[] = [];

  for (const rawProject of projects) {
    const project = await pagesProjectFromCf(
      asObject(rawProject),
      context.profile.id,
      context.profile.account_id,
    );
    if (!project) continue;
    await context.assets.upsertPagesProject(project);
    projectNames.push(project.name);
    context.summary.pagesProjects += 1;
  }

  await context.assets.markMissingDeleted(
    "pages_projects",
    context.profile.id,
    projectsStartedAt,
  );

  for (const projectName of projectNames) {
    try {
      const domains = await context.client.listPagesDomains(
        context.profile.account_id,
        projectName,
      );
      for (const rawDomain of domains) {
        const domain = await pagesDomainFromCf(
          rawDomain,
          context.profile.id,
          context.profile.account_id,
          projectName,
        );
        if (!domain) continue;
        await context.assets.upsertPagesDomain(domain);
        context.summary.pagesDomains += 1;
      }
    } catch (error) {
      context.summary.errors += 1;
      await context.sync.recordError({
        syncJobId: context.syncJobId,
        profileId: context.profile.id,
        resourceType: "pages_domains",
        resourceId: projectName,
        operation: "pages.domains.list",
        ...errorInfo(error),
      });
    }
  }

  await context.assets.markMissingDeleted(
    "pages_domains",
    context.profile.id,
    domainsStartedAt,
  );
}

async function syncR2(context: ScannerContext): Promise<void> {
  const syncStartedAt = new Date().toISOString();
  const buckets = await context.client.listR2Buckets(context.profile.account_id);
  for (const rawBucket of buckets) {
    const bucket = await r2BucketFromCf(
      asObject(rawBucket),
      context.profile.id,
      context.profile.account_id,
    );
    if (!bucket) continue;
    await context.assets.upsertR2Bucket(bucket);
    context.summary.r2Buckets += 1;
  }
  await context.assets.markMissingDeleted(
    "r2_buckets",
    context.profile.id,
    syncStartedAt,
  );
}

async function syncD1(context: ScannerContext): Promise<void> {
  const syncStartedAt = new Date().toISOString();
  const databases = await context.client.listD1Databases(context.profile.account_id);
  for (const rawDatabase of databases) {
    const database = await d1DatabaseFromCf(
      asObject(rawDatabase),
      context.profile.id,
      context.profile.account_id,
    );
    if (!database) continue;
    await context.assets.upsertD1Database(database);
    context.summary.d1Databases += 1;
  }
  await context.assets.markMissingDeleted(
    "d1_databases",
    context.profile.id,
    syncStartedAt,
  );
}

async function syncKv(context: ScannerContext): Promise<void> {
  const syncStartedAt = new Date().toISOString();
  const namespaces = await context.client.listKvNamespaces(context.profile.account_id);
  for (const rawNamespace of namespaces) {
    const namespace = kvNamespaceFromCf(
      asObject(rawNamespace),
      context.profile.id,
      context.profile.account_id,
    );
    if (!namespace) continue;
    await context.assets.upsertKvNamespace(namespace);
    context.summary.kvNamespaces += 1;
  }
  await context.assets.markMissingDeleted(
    "kv_namespaces",
    context.profile.id,
    syncStartedAt,
  );
}

async function upsertAccountFromZone(
  context: ScannerContext,
  rawZone: CfRecord,
): Promise<void> {
  const account = asObject(rawZone.account);
  const accountId = getString(account, "id");
  if (!accountId) return;
  await context.assets.upsertAccount({
    id: accountId,
    profileId: context.profile.id,
    name: getString(account, "name"),
    raw: account,
  });
}

async function runModule(
  context: ScannerContext,
  resourceType: string,
  operation: string,
  fn: () => Promise<void>,
): Promise<void> {
  try {
    await fn();
  } catch (error) {
    context.summary.errors += 1;
    await context.sync.recordError({
      syncJobId: context.syncJobId,
      profileId: context.profile.id,
      resourceType,
      operation,
      ...errorInfo(error),
    });
  }
}

function errorInfo(error: unknown): {
  httpStatus?: number;
  errorCode?: string;
  message: string;
  rawJson?: unknown;
} {
  if (error instanceof CloudflareApiError) {
    const output: {
      httpStatus?: number;
      errorCode?: string;
      message: string;
      rawJson?: unknown;
    } = { message: error.message };
    if (error.httpStatus !== undefined) output.httpStatus = error.httpStatus;
    if (error.errorCode !== undefined) output.errorCode = error.errorCode;
    if (error.rawJson !== undefined) output.rawJson = error.rawJson;
    return output;
  }

  return {
    message: error instanceof Error ? error.message : "Unknown scanner error",
  };
}

function emptySummary(): AssetSyncSummary {
  return {
    zones: 0,
    dnsRecords: 0,
    workers: 0,
    workerRoutes: 0,
    pagesProjects: 0,
    pagesDomains: 0,
    r2Buckets: 0,
    d1Databases: 0,
    kvNamespaces: 0,
    errors: 0,
  };
}

