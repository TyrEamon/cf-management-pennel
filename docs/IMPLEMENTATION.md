# Cloudflare Asset Hub 实施文档

版本：v0.3  
日期：2026-06-26  
项目目录：`D:\Desktop\cf-asset-hub`  
依据文档：`docs/PRD.md`、`docs/source-chatgpt-export.md`
当前实施选择：Cloudflare 原生部署优先  
当前阶段：v0.3-CF，关系推断与资产图谱

## 1. 实施目标

本项目第一阶段要解决的不是“管理 Cloudflare”，而是“找到资产在哪”。

v0.1 的实施目标：

- 能添加多个 Cloudflare Profile。
- 每个 Profile 保存 `account_id + api_token`。
- API Token 加密入库。
- 能检测 token 是否有效、关键权限是否可用。
- 能同步 Cloudflare 账号中的核心只读资产。
- 能搜索域名、DNS、Worker、Pages、R2、D1、KV 属于哪个账号。
- 能记录同步过程中的权限缺失、接口失败、限流、网络错误。

v0.1 不做写操作，不改 DNS，不删资源，不迁移项目。

## 2. 推荐实施路线

当前确定采用 Cloudflare 原生部署路线。第一版不再以本地 SQLite CLI 作为主线，而是先搭 Worker + D1 的可部署骨架，再逐步补 Queues、Cron 和 Web UI。

目标架构：

```text
Workers Static Assets
  -> Cloudflare Worker API
  -> Cloudflare D1
  -> Cloudflare Queues
  -> Cloudflare Cron Triggers
  -> Cloudflare API
```

实施顺序：

```text
Phase 0: 初始化 Cloudflare Worker 项目骨架
Phase 1: D1 schema 与 migration
Phase 2: Worker Secrets 与 token 加密模块
Phase 3: Cloudflare API Client
Phase 4: Profile API
Phase 5: 权限检测 API
Phase 6: 手动同步 API
Phase 7: Queues 后台同步
Phase 8: 搜索 API
Phase 9: Web UI
Phase 10: Cron 定时同步
Phase 11: 用量统计
```

v0.1-CF 截止到 Phase 8 即可交付。v0.2-CF 已将前端后台迁移到 Workers Static Assets。v0.3-CF 补齐关系推断、关系图 API 和前端关系图谱视图。Cron 和用量统计可以放后续增强。

仍然保留 CLI 作为可选开发工具，但它不是第一版主线。

## 3. 技术栈

推荐：

```text
Runtime: Cloudflare Workers
Language: TypeScript
Package Manager: pnpm
Backend API: Hono
Database: Cloudflare D1
Background Jobs: Cloudflare Queues
Scheduled Jobs: Cron Triggers
Secrets: Worker Secrets
Deploy Tool: Wrangler
Validation: zod
Encryption: Web Crypto AES-GCM
Logger: pino
Testing: Vitest
Frontend: Workers Static Assets
```

第一版可以不引入 monorepo，保持单 Worker 项目。

## 4. 目录结构

建议目录：

```text
cf-asset-hub/
  docs/
    PRD.md
    IMPLEMENTATION.md
    source-chatgpt-export.md
  data/
    # 本地 D1 模拟数据由 Wrangler 管理，不手写生产数据
  migrations/
    0001_initial.sql
  src/
    config/
      cors.ts
    crypto/
      token-crypto.ts
    d1/
      queries.ts
      schema.ts
    repositories/
      profiles.repo.ts
      assets.repo.ts
      sync.repo.ts
      search.repo.ts
    cf/
      cf-client.ts
      cf-types.ts
      endpoints.ts
      pagination.ts
      errors.ts
    scanner/
      profile-scanner.ts
      permission-checker.ts
      sync-zones.ts
      sync-dns.ts
      sync-workers.ts
      sync-pages.ts
      sync-r2.ts
      sync-d1.ts
      sync-kv.ts
      relation-builder.ts
    search/
      search-service.ts
    routes/
      profiles.ts
      sync.ts
      search.ts
      health.ts
    index.ts
    types.ts
  public/
    index.html
    assets/
      app.css
      app.js
  .env.example
  .dev.vars.example
  .gitignore
  package.json
  tsconfig.json
  wrangler.jsonc
```

v0.1 必须完成：

- `config`
- `crypto`
- `d1`
- `repositories`
- `cf`
- `scanner`
- `search`
- `routes`

v0.2-CF 前端后台已落在 `public/`，由 Workers Static Assets 服务。

v0.3-CF 关系图谱新增：

- `src/repositories/asset-graph.repo.ts`
- `GET /api/assets/graph`
- Relations 前端视图
- Domain Detail 内嵌关系图

## 5. 环境变量

Cloudflare 原生部署分为 vars 和 secrets。

`wrangler.jsonc` 中保存非敏感 vars：

```jsonc
"vars": {
  "ENVIRONMENT": "development",
  "CLOUDFLARE_API_BASE_URL": "https://api.cloudflare.com/client/v4",
  "CF_API_MIN_DELAY_MS": "250",
  "CF_API_MAX_RETRIES": "3"
}
```

Worker Secrets 保存敏感值：

```text
APP_MASTER_KEY_BASE64
ADMIN_API_TOKEN
```

本地开发使用 `.dev.vars`：

```env
APP_MASTER_KEY_BASE64=
ADMIN_API_TOKEN=
LOG_LEVEL=info
```

`APP_MASTER_KEY_BASE64` 生成方式：

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

要求：

- `.dev.vars` 不提交 Git。
- 没有 `APP_MASTER_KEY_BASE64` 时禁止启动。
- master key 长度必须解码后等于 32 bytes。
- 线上通过 `wrangler secret put APP_MASTER_KEY_BASE64` 写入。
- 管理 API 的 `ADMIN_API_TOKEN` 也必须通过 Worker Secret 写入。

## 6. 数据库设计

D1 基于 SQLite，schema 保持 SQLite 兼容。

所有时间字段统一 ISO8601 字符串。

### 6.1 profiles

保存 Cloudflare Profile。

```sql
CREATE TABLE profiles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  account_id TEXT NOT NULL,
  email_hint TEXT,
  note TEXT,
  token_ciphertext TEXT NOT NULL,
  token_iv TEXT NOT NULL,
  token_auth_tag TEXT NOT NULL,
  token_hint TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'unknown',
  last_sync_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

说明：

- `token_hint` 只保存 token 尾部 4-6 位，便于识别。
- 不保存明文 token。
- `status` 可取：`unknown`、`ok`、`permission_error`、`token_invalid`、`sync_error`、`disabled`。

### 6.2 profile_permission_checks

保存最近权限检测结果。

```sql
CREATE TABLE profile_permission_checks (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL,
  check_key TEXT NOT NULL,
  status TEXT NOT NULL,
  http_status INTEGER,
  error_code TEXT,
  message TEXT,
  checked_at TEXT NOT NULL,
  raw_json TEXT,
  FOREIGN KEY (profile_id) REFERENCES profiles(id)
);
```

`check_key` 示例：

```text
token.verify
zones.list
dns.list
workers.scripts.list
workers.routes.list
pages.projects.list
pages.domains.list
r2.buckets.list
d1.databases.list
kv.namespaces.list
```

### 6.3 sync_jobs

每次同步创建一个 job。

```sql
CREATE TABLE sync_jobs (
  id TEXT PRIMARY KEY,
  profile_id TEXT,
  scope TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  total_requests INTEGER NOT NULL DEFAULT 0,
  total_errors INTEGER NOT NULL DEFAULT 0,
  summary_json TEXT,
  FOREIGN KEY (profile_id) REFERENCES profiles(id)
);
```

`scope`：

```text
all_profiles
single_profile
```

`status`：

```text
running
success
partial_success
failed
cancelled
```

### 6.4 sync_errors

记录模块级错误。

```sql
CREATE TABLE sync_errors (
  id TEXT PRIMARY KEY,
  sync_job_id TEXT NOT NULL,
  profile_id TEXT,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  operation TEXT NOT NULL,
  http_status INTEGER,
  error_code TEXT,
  message TEXT NOT NULL,
  raw_json TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (sync_job_id) REFERENCES sync_jobs(id),
  FOREIGN KEY (profile_id) REFERENCES profiles(id)
);
```

### 6.5 cf_accounts

```sql
CREATE TABLE cf_accounts (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL,
  name TEXT,
  type TEXT,
  raw_json TEXT,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  deleted_at TEXT,
  FOREIGN KEY (profile_id) REFERENCES profiles(id)
);
```

### 6.6 zones

```sql
CREATE TABLE zones (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT,
  plan_name TEXT,
  created_on TEXT,
  modified_on TEXT,
  raw_json TEXT,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  deleted_at TEXT,
  FOREIGN KEY (profile_id) REFERENCES profiles(id)
);
```

索引：

```sql
CREATE INDEX idx_zones_profile_id ON zones(profile_id);
CREATE INDEX idx_zones_name ON zones(name);
CREATE INDEX idx_zones_account_id ON zones(account_id);
```

### 6.7 dns_records

```sql
CREATE TABLE dns_records (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  zone_id TEXT NOT NULL,
  zone_name TEXT NOT NULL,
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  content TEXT,
  proxied INTEGER,
  ttl INTEGER,
  priority INTEGER,
  comment TEXT,
  raw_json TEXT,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  deleted_at TEXT,
  FOREIGN KEY (profile_id) REFERENCES profiles(id),
  FOREIGN KEY (zone_id) REFERENCES zones(id)
);
```

索引：

```sql
CREATE INDEX idx_dns_profile_id ON dns_records(profile_id);
CREATE INDEX idx_dns_zone_id ON dns_records(zone_id);
CREATE INDEX idx_dns_name ON dns_records(name);
CREATE INDEX idx_dns_content ON dns_records(content);
```

### 6.8 workers

```sql
CREATE TABLE workers (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  name TEXT NOT NULL,
  created_on TEXT,
  modified_on TEXT,
  raw_json TEXT,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  deleted_at TEXT,
  FOREIGN KEY (profile_id) REFERENCES profiles(id),
  UNIQUE(account_id, name)
);
```

### 6.9 worker_routes

```sql
CREATE TABLE worker_routes (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  zone_id TEXT NOT NULL,
  zone_name TEXT NOT NULL,
  pattern TEXT NOT NULL,
  script_name TEXT,
  raw_json TEXT,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  deleted_at TEXT,
  FOREIGN KEY (profile_id) REFERENCES profiles(id),
  FOREIGN KEY (zone_id) REFERENCES zones(id)
);
```

### 6.10 pages_projects

```sql
CREATE TABLE pages_projects (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  name TEXT NOT NULL,
  subdomain TEXT,
  production_branch TEXT,
  latest_deployment_url TEXT,
  raw_json TEXT,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  deleted_at TEXT,
  FOREIGN KEY (profile_id) REFERENCES profiles(id),
  UNIQUE(account_id, name)
);
```

### 6.11 pages_domains

```sql
CREATE TABLE pages_domains (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  project_name TEXT NOT NULL,
  domain_name TEXT NOT NULL,
  status TEXT,
  raw_json TEXT,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  deleted_at TEXT,
  FOREIGN KEY (profile_id) REFERENCES profiles(id)
);
```

`id` 可用：

```text
sha256(account_id + ":" + project_name + ":" + domain_name)
```

### 6.12 r2_buckets

```sql
CREATE TABLE r2_buckets (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  name TEXT NOT NULL,
  location TEXT,
  created_at TEXT,
  raw_json TEXT,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  deleted_at TEXT,
  FOREIGN KEY (profile_id) REFERENCES profiles(id),
  UNIQUE(account_id, name)
);
```

### 6.13 d1_databases

```sql
CREATE TABLE d1_databases (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  name TEXT NOT NULL,
  uuid TEXT,
  created_at TEXT,
  raw_json TEXT,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  deleted_at TEXT,
  FOREIGN KEY (profile_id) REFERENCES profiles(id)
);
```

### 6.14 kv_namespaces

```sql
CREATE TABLE kv_namespaces (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  title TEXT NOT NULL,
  raw_json TEXT,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  deleted_at TEXT,
  FOREIGN KEY (profile_id) REFERENCES profiles(id)
);
```

### 6.15 asset_links

```sql
CREATE TABLE asset_links (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  relation TEXT NOT NULL,
  confidence REAL NOT NULL,
  reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (profile_id) REFERENCES profiles(id)
);
```

`relation` 示例：

```text
contains
points_to
served_by
bound_to
probably_bound_to
uses
possibly_tunnel
```

### 6.16 search_index

v0.1 可以用普通 SQL `LIKE` 搜索。资源多了再上 SQLite FTS5。

为了实现简单，建议先建统一搜索索引表：

```sql
CREATE TABLE search_index (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  title TEXT NOT NULL,
  subtitle TEXT,
  search_text TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

每次同步完一个资源类型，重建对应的 `search_index`。

## 7. Cloudflare API Client

### 7.1 基础约定

Cloudflare API Base URL：

```text
https://api.cloudflare.com/client/v4
```

所有请求使用：

```http
Authorization: Bearer <API_TOKEN>
Content-Type: application/json
```

不要支持 Global API Key 作为第一版方案。

### 7.2 API Response 统一结构

Cloudflare 常见响应结构：

```ts
type CloudflareResponse<T> = {
  success: boolean
  errors: Array<{ code: number | string; message: string }>
  messages: Array<{ code?: number | string; message: string }>
  result: T
  result_info?: {
    page?: number
    per_page?: number
    total_pages?: number
    count?: number
    total_count?: number
  }
}
```

Client 层负责：

- 自动拼接 base URL。
- 注入 Authorization。
- JSON 解析。
- 非 2xx 转为统一错误。
- `success: false` 转为统一错误。
- 处理分页。
- 处理 429 限流重试。
- 对 token 做日志脱敏。

### 7.3 端点清单

v0.1 需要调用：

| 功能 | 方法与路径 | 说明 |
|---|---|---|
| 验证 token | `GET /user/tokens/verify` | 判断 token 是否有效 |
| 列出 zones | `GET /zones` | 可按返回结果中的 account 过滤 |
| 列出 DNS | `GET /zones/{zone_id}/dns_records` | 按 zone 同步 |
| 列出 Workers | `GET /accounts/{account_id}/workers/scripts` | 按 account 同步 |
| 列出 Worker Routes | `GET /zones/{zone_id}/workers/routes` | 按 zone 同步 |
| 列出 Pages 项目 | `GET /accounts/{account_id}/pages/projects` | 按 account 同步 |
| 列出 Pages 域名 | `GET /accounts/{account_id}/pages/projects/{project_name}/domains` | 按项目同步 |
| 列出 R2 Buckets | `GET /accounts/{account_id}/r2/buckets` | 按 account 同步 |
| 列出 D1 Databases | `GET /accounts/{account_id}/d1/database` | 按 account 同步 |
| 列出 KV Namespaces | `GET /accounts/{account_id}/storage/kv/namespaces` | 按 account 同步 |

注意：

- 端点权限以 Cloudflare API Reference 中每个端点的 `Accepted Permissions` 为准。
- `GET /zones` 不强依赖自动发现账号；Profile 中仍然必须手动保存 `account_id`。
- 如果 `GET /zones` 返回了其他账号的 zone，入库前按 `profile.account_id` 过滤。
- R2 REST API 权限和 S3 API Access Key 是两套使用方式；本项目 v0.1 只做 REST 列表，不做对象读写。

### 7.4 分页实现

封装：

```ts
async function listAll<T>(path: string, params?: Record<string, string>): Promise<T[]>
```

规则：

- 默认 `per_page=50`。
- 如果响应有 `result_info.total_pages`，循环 page。
- 如果响应是 cursor 模式，保留后续扩展。
- 每页请求都记录 `request_count`。
- 任一页失败时抛出模块级错误，由 scanner 记录，不影响其他模块。

### 7.5 限速和重试

Cloudflare API 有全局限制，v0.1 要保守。

建议：

- 串行同步 Profile。
- 同一个 Profile 内资源类型可以先串行。
- 每个请求间隔默认 `250ms`。
- 429 使用指数退避。
- 5xx 最多重试 3 次。
- 401/403 不重试，直接记录权限或 token 错误。
- 404 对部分资源可标记为空或已不存在。

错误分类：

```text
token_invalid
permission_denied
rate_limited
not_found
network_error
cloudflare_error
parse_error
unknown_error
```

## 8. Token 加密实现

### 8.1 加密方式

Cloudflare Worker 环境使用 Web Crypto 的 AES-GCM。

保存字段：

- `token_ciphertext`
- `token_iv`
- `token_auth_tag`
- `token_hint`

实现：

```ts
type EncryptedToken = {
  ciphertext: string
  iv: string
  authTag: string
  hint: string
}
```

要求：

- `iv` 每次随机生成 12 bytes。
- ciphertext、iv、authTag 使用 base64 保存。
- 解密失败时返回明确错误。
- master key 只从 Worker Secret `APP_MASTER_KEY_BASE64` 读取。

### 8.2 日志脱敏

任何日志都不得输出：

- 完整 token
- token ciphertext
- master key

token 只允许显示：

```text
****abcd
```

## 9. CLI 设计

CLI 现在作为可选本地工具，不作为 v0.1-CF 主线。

v0.1-CF 先实现 HTTP API：

```text
GET    /api/health
GET    /api/profiles
POST   /api/profiles
GET    /api/profiles/:id
PATCH  /api/profiles/:id
POST   /api/profiles/:id/test
POST   /api/profiles/:id/sync
POST   /api/sync/all
GET    /api/sync/jobs
GET    /api/sync/jobs/:id/errors
GET    /api/search?q=
GET    /api/issues
```

所有管理 API 先使用 `Authorization: Bearer <ADMIN_API_TOKEN>` 保护。

后续如需 CLI，可封装为调用这些 API：

```bash
cf-asset-hub profile add
cf-asset-hub profile list
cf-asset-hub profile test <profile>
cf-asset-hub profile disable <profile>
cf-asset-hub sync <profile>
cf-asset-hub sync --all
cf-asset-hub search <keyword>
cf-asset-hub status
```

### 9.1 profile add

交互式输入：

```text
Profile name:
Account ID:
API Token:
Note:
```

保存后自动执行 token verify。

### 9.2 profile test

执行权限检测，不修改资产数据。

输出：

```text
Profile: main
token.verify              ok
zones.list                ok
dns.list                  ok
workers.scripts.list      ok
workers.routes.list       ok
pages.projects.list       ok
r2.buckets.list           permission_denied
d1.databases.list         ok
kv.namespaces.list        ok
```

### 9.3 sync

执行资产同步。

输出：

```text
Sync job: 20260626-xxxx
Profile: main
Zones: 12
DNS Records: 183
Workers: 8
Worker Routes: 15
Pages Projects: 4
Pages Domains: 6
R2 Buckets: 2
D1 Databases: 3
KV Namespaces: 5
Status: partial_success
Errors: 1
```

### 9.4 search

搜索示例：

```bash
cf-asset-hub search mtcacg.top
cf-asset-hub search worker-api
cf-asset-hub search images
```

输出字段：

```text
type | name | profile | account_id | related | last_seen_at
```

## 10. 同步器实现

### 10.1 总流程

```text
create sync_job
load enabled profiles
for each profile:
  decrypt token
  verify token
  sync zones
  sync dns by zone
  sync worker routes by zone
  sync worker scripts by account
  sync pages projects by account
  sync pages domains by project
  sync r2 buckets by account
  sync d1 databases by account
  sync kv namespaces by account
  rebuild search index
  build basic asset links
finish sync_job
```

v0.1 初期可以由 HTTP 请求触发同步，并用 `ctx.waitUntil()` 在响应后继续处理短任务。账号数量增加后必须切到 Queues。

Queues 版本流程：

```text
POST /api/profiles/:id/sync
  -> 创建 sync_job
  -> env.SYNC_QUEUE.send({ type: "sync_profile", profileId, syncJobId })
  -> 立即返回 sync_job_id

queue consumer
  -> 按 profile 同步资产
  -> 写 sync_errors
  -> 更新 sync_jobs
```

### 10.2 模块失败规则

每个同步模块必须独立 try/catch。

错误只写入 `sync_errors`，不能直接中断整个 Profile，除非：

- token verify 失败。
- account_id 明显无效。
- token 解密失败。

示例：

```text
syncZones 失败：跳过该 Profile 的 zone 相关同步，但仍可尝试 account 级资源。
syncPages 失败：不影响 R2 / D1 / KV。
syncR2 403：记录权限不足，不影响其他模块。
```

### 10.3 deleted_at 策略

不能简单删除数据库旧数据。

每次同步某资源类型时：

1. 记录本次扫描开始时间 `syncStartedAt`。
2. upsert 扫描到的资源，更新 `last_seen_at`，清空 `deleted_at`。
3. 如果该模块成功完成，则把同 Profile、同资源类型中 `last_seen_at < syncStartedAt` 的记录标记 `deleted_at = now`。
4. 如果该模块失败，不更新 `deleted_at`，避免误判资源被删。

## 11. 权限检测实现

权限检测不是静态判断 token 权限文本，而是实际请求最小列表接口。

检测顺序：

```text
token.verify
zones.list
workers.scripts.list
pages.projects.list
r2.buckets.list
d1.databases.list
kv.namespaces.list
```

DNS 和 Worker Routes 依赖 zone：

```text
先 list zones
如果有 zone，则取第一个 zone 测 dns.list 和 workers.routes.list
如果没有 zone，则状态记为 empty_resource，不是失败
```

Pages domains 依赖 Pages project：

```text
先 list pages projects
如果有 project，则取第一个 project 测 pages.domains.list
如果没有 project，则状态记为 empty_resource
```

状态：

```text
ok
empty_resource
permission_denied
token_invalid
account_mismatch
rate_limited
api_error
network_error
```

## 12. 搜索实现

### 12.1 v0.1 简单搜索

先用 `search_index` 表。

写入规则：

- Zone：`zone.name`
- DNS：`record.name + record.content + record.type`
- Worker：`worker.name`
- Worker Route：`pattern + script_name`
- Pages Project：`name + subdomain + latest_deployment_url`
- Pages Domain：`domain_name + project_name`
- R2：`bucket.name`
- D1：`database.name + uuid`
- KV：`namespace.title + id`

查询：

```sql
SELECT *
FROM search_index
WHERE search_text LIKE '%' || ? || '%'
ORDER BY resource_type, title
LIMIT 100;
```

### 12.2 v0.2 FTS5

资源多了以后再换：

```sql
CREATE VIRTUAL TABLE search_fts USING fts5(
  title,
  subtitle,
  search_text,
  content='search_index',
  content_rowid='rowid'
);
```

## 13. 关系推断实现

v0.1 只做基础关系。

### 13.1 Zone contains DNS

对每个 DNS record 创建：

```text
zone -> dns_record
relation: contains
confidence: 1.0
```

### 13.2 Domain served_by Worker

Worker Route：

```text
example.com/*
api.example.com/*
```

取 pattern 中的 host 部分，与 zone/domain 关联。

创建：

```text
zone/domain -> worker_route
worker_route -> worker
relation: served_by
confidence: 0.95
```

如果 script_name 在 workers 表中找不到：

```text
relation: served_by_missing_worker
confidence: 0.9
```

并生成异常。

### 13.3 Domain bound_to Pages

Pages Domains API 返回的是强关系。

创建：

```text
pages_domain -> pages_project
relation: bound_to
confidence: 1.0
```

如果 DNS 中存在 `*.pages.dev` CNAME，但 Pages Domains 没返回：

```text
dns_record -> pages_project 或 pages.dev hostname
relation: probably_bound_to
confidence: 0.7
```

### 13.4 Domain possibly_tunnel

DNS CNAME content 包含：

```text
.cfargotunnel.com
```

创建：

```text
dns_record -> tunnel_hint
relation: possibly_tunnel
confidence: 0.8
```

v0.1 不接 Tunnel API。

### 13.5 v0.3 关系图谱增强

v0.3-CF 在不改 schema 的前提下增强 `asset_links` 的查询和展示：

- 新增 `dns_record -> worker_route`，当 DNS 名称命中 Worker Route host。
- 新增 `pages_domain -> dns_record`，当 Pages 自定义域名存在同名 DNS 记录。
- 保留 `zone -> dns_record`、`zone -> worker_route`、`worker_route -> worker`、`pages_domain -> pages_project`、`dns_record -> pages_project`、`dns_record -> tunnel_hint`。
- 新增图谱响应结构：

```ts
type AssetGraph = {
  nodes: Array<{
    key: string
    id: string
    type: string
    label: string
    subtitle: string | null
    profileId: string | null
    profileName: string | null
  }>
  edges: Array<{
    id: string
    source: string
    target: string
    relation: string
    confidence: number
    reason: string | null
  }>
}
```

图谱接口：

```text
GET /api/assets/graph
GET /api/assets/graph?domain=example.com
GET /api/assets/graph?profileId=<profile_id>
GET /api/assets/graph?domain=example.com&profileId=<profile_id>
```

## 14. Web UI 预留接口

v0.2 实现 Hono API。

预留 REST 路由：

```text
GET    /api/health
GET    /api/profiles
POST   /api/profiles
GET    /api/profiles/:id
PATCH  /api/profiles/:id
POST   /api/profiles/:id/test
POST   /api/profiles/:id/sync
POST   /api/sync/all
GET    /api/sync/jobs
GET    /api/sync/jobs/:id/errors
GET    /api/search?q=
GET    /api/assets/overview
GET    /api/assets/graph
GET    /api/assets/profiles/:id
GET    /api/assets/zones
GET    /api/assets/zones/:id
GET    /api/assets/domains/:name
GET    /api/issues
```

v0.2 页面：

- 总览
- Profile 管理
- Profile 详情
- 全局搜索
- 域名详情
- 异常列表
- 同步任务列表
- 关系图谱

v0.2/v0.3 前端文件：

```text
public/index.html
public/assets/app.css
public/assets/app.js
```

前端不保存明文 Cloudflare API Token，只在添加 Profile 时提交到 API。Admin API Token 只存在当前浏览器的 `sessionStorage`。

v0.3 前端新增 Relations 视图：

- 支持全局关系图。
- 支持按域名过滤。
- 支持按 Profile 过滤。
- 展示节点分组、边列表、relation、confidence 和 reason。
- Domain Detail 页面内嵌当前域名关系图。

## 14.1 Cloudflare 部署配置

`wrangler.jsonc` 至少需要：

```jsonc
{
  "name": "cf-asset-hub",
  "main": "src/index.ts",
  "compatibility_date": "2026-06-26",
  "compatibility_flags": ["nodejs_compat"],
  "observability": {
    "enabled": true,
    "head_sampling_rate": 1
  },
  "assets": {
    "directory": "./public",
    "not_found_handling": "single-page-application",
    "run_worker_first": ["/api/*"]
  },
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "cf-asset-hub-db",
      "database_id": "<fill-after-create>",
      "migrations_dir": "migrations"
    }
  ],
  "queues": {
    "producers": [
      {
        "binding": "SYNC_QUEUE",
        "queue": "cf-asset-hub-sync"
      }
    ],
    "consumers": [
      {
        "queue": "cf-asset-hub-sync",
        "max_batch_size": 5,
        "max_batch_timeout": 30
      }
    ]
  },
  "triggers": {
    "crons": ["0 */6 * * *"]
  }
}
```

创建资源命令：

```bash
npx wrangler d1 create cf-asset-hub-db
npx wrangler queues create cf-asset-hub-sync
npx wrangler secret put APP_MASTER_KEY_BASE64
npx wrangler secret put ADMIN_API_TOKEN
npx wrangler d1 migrations apply cf-asset-hub-db --remote
npx wrangler deploy
```

本地开发：

```bash
npm run dev
npm run db:migrate:local
```

## 15. 异常检查规则

v0.1 实现以下 issues：

### 15.1 token_invalid

来源：

- `GET /user/tokens/verify` 失败。
- Cloudflare 返回 401。

### 15.2 permission_denied

来源：

- Cloudflare 返回 403。

记录：

```text
profile_id
operation
message
suggested_permission
```

### 15.3 route_missing_worker

Worker Route 的 `script_name` 在 workers 表里找不到。

### 15.4 pages_domain_dns_missing

Pages Domain 存在，但 DNS Records 中找不到对应 name。

注意：这只是提示，不一定是错误，因为 Cloudflare Pages 绑定和 DNS 状态可能存在延迟或外部 DNS。

### 15.5 cname_pages_project_missing

DNS CNAME 指向 `*.pages.dev`，但当前 Profile 下找不到对应 Pages Project。

### 15.6 stale_profile

Profile 超过指定时间未同步。

默认：

```text
7 days
```

## 16. 测试计划

### 16.1 单元测试

覆盖：

- token 加密 / 解密
- token 脱敏
- Cloudflare response 解析
- 分页函数
- 错误分类
- relation builder
- search index builder

### 16.2 集成测试

使用 mock HTTP server 模拟 Cloudflare API。

场景：

- 正常同步所有资源。
- zones 为空。
- DNS 403。
- R2 403。
- Pages project 有数据，但 domains 为空。
- API 返回 429 后重试成功。
- API 返回 500 重试失败。
- 某模块失败但 job 为 partial_success。

### 16.3 手动验收

准备两个真实 Cloudflare Profile：

```text
Profile A: 有域名、DNS、Worker、Pages
Profile B: 有 R2、D1、KV
```

执行：

```bash
cf-asset-hub profile add
cf-asset-hub profile test main
cf-asset-hub sync --all
cf-asset-hub search example.com
cf-asset-hub search worker-name
cf-asset-hub status
```

验收：

- 数据库中 token 不可读。
- 搜索能返回正确 Profile。
- 同步错误能明确显示。
- 日志无明文 token。

## 17. 开发任务拆分

### Task 1: 项目初始化

- `package.json`
- `tsconfig.json`
- `src/` 目录
- `wrangler.jsonc`
- Hono
- Wrangler
- Vitest
- `.dev.vars.example`

交付标准：

- `pnpm test` 可运行。
- `pnpm typecheck` 可运行。
- `npm run dev` 可启动 Worker。

### Task 2: 数据库 schema

- D1 migration
- D1 repository 基础封装
- repository 基础封装

交付标准：

- 可通过 `npx wrangler d1 migrations apply cf-asset-hub-db --local` 创建本地 D1 表。
- 所有核心表生成成功。

### Task 3: 加密模块

- Web Crypto AES-GCM encrypt/decrypt
- token hint
- maskToken

交付标准：

- 加密后数据库中不出现明文 token。
- 错误 master key 无法解密。

### Task 4: Cloudflare Client

- request wrapper
- pagination
- retry
- error normalization
- endpoint methods

交付标准：

- mock API 下能完成所有端点调用。
- 403、429、500 能分类。

### Task 5: Profile CLI

改为 Profile API：

- `POST /api/profiles`
- `GET /api/profiles`
- `PATCH /api/profiles/:id`
- `POST /api/profiles/:id/test`

交付标准：

- 可添加真实 token。
- 可显示权限检测结果。

### Task 6: Scanner

- zones
- dns
- workers
- worker routes
- pages
- pages domains
- r2
- d1
- kv

交付标准：

- `POST /api/sync/all` 能完成同步或创建队列任务。
- 单模块失败不影响其他模块。

### Task 7: Search

- search_index rebuild
- search API

交付标准：

- 搜索域名、Worker、Pages、R2、D1、KV 均有结果。

### Task 8: Relation Builder

- zone -> dns
- route -> worker
- pages domain -> pages project
- CNAME pages.dev
- CNAME cfargotunnel

交付标准：

- 域名详情可以展示基础关联。

### Task 9: Queues and Cron

- Queue producer
- Queue consumer
- Cron handler

交付标准：

- 手动同步创建 queue message。
- Cron 可以定时创建全量同步任务。

### Task 10: Web UI

v0.2-CF 已完成：

- `public/index.html` 静态后台入口。
- `public/assets/app.css` 后台布局与响应式样式。
- `public/assets/app.js` 后台交互控制器。
- Overview、Profiles、Search、Domains、Issues、Sync Jobs 六个视图。
- Admin API Token 使用 `sessionStorage` 保存，不持久保存 Cloudflare API Token。
- 通过 Workers Static Assets 服务前端，`/api/*` 仍优先进入 Worker API。

## 18. 风险与处理

### 18.1 API 权限名称变化

处理：

- 端点权限不硬编码为唯一真理。
- 权限检测以实际请求结果为准。
- 文档中提示用户以 Cloudflare API Reference 的 Accepted Permissions 为准。

### 18.2 API 限流

处理：

- 默认串行。
- 请求间隔。
- 429 指数退避。
- 支持从失败处重新同步。

### 18.3 token 泄露风险

处理：

- 加密入库。
- 日志脱敏。
- `.env` 加入 `.gitignore`。
- Web UI 不回显 token。
- 导出不带 token。

### 18.4 误判资源删除

处理：

- 模块同步成功后才标记 deleted_at。
- 模块失败时不更新 deleted_at。

### 18.5 关系推断不准

处理：

- 关系表保留 `confidence`。
- 强关系和推断关系分开。
- UI 中展示 reason。

## 19. v0.1 完成定义

v0.1 完成时必须做到：

- 可以在 `D:\Desktop\cf-asset-hub` 运行项目。
- 可以添加至少两个 Profile。
- 可以测试每个 Profile 的 token 和关键权限。
- 可以同步 Zone、DNS、Workers、Worker Routes、Pages、Pages Domains、R2、D1、KV。
- 可以通过 API 搜索资源。
- 数据库不保存明文 token。
- 一个账号或一个模块失败不会拖垮整轮同步。
- 同步错误可追踪。
- 可以部署到 Cloudflare Worker。

## 20. 官方文档依据

实施时以 Cloudflare 官方文档为准，当前已核对的关键文档：

- API 调用认证：`Authorization: Bearer <API_TOKEN>`
- API token 创建、资源范围、TTL、IP 限制
- API token 权限分类：Account / Zone / User
- API 限制：Client API、GraphQL、token quota
- Zones API
- DNS Records API
- Workers Scripts API
- Workers Routes API
- Pages Projects API
- Pages Domains API
- R2 Buckets API
- D1 Databases API
- KV Namespaces API

## 21. v0.2-CF 验证记录

本地验证时间：2026-06-26

已执行：

- `npm run types`
- `npm run typecheck`
- `npm test`
- `node --check public/assets/app.js`
- `npm audit --json`
- `npx wrangler deploy --dry-run`
- `GET /`
- `GET /assets/app.css`
- `GET /assets/app.js`
- `GET /api/health`
- `GET /api/assets/overview`
- `GET /api/profiles`
- `GET /api/issues`
- `GET /api/sync/jobs`
- `GET /api/assets/domains/example.com`
- `GET /api/assets/zones/not-found`

验证结果：

- Workers Static Assets 可以正确服务 `public/` 前端文件。
- `run_worker_first: ["/api/*"]` 下 API 路由仍由 Worker 处理。
- 前端表格仅对内部生成的徽标 HTML 放行，资产文本统一转义。
- 未授权管理 API 返回 401。
- 授权 API 使用本地 `dev-admin-token` 可访问。
- Zone 详情接口在资源不存在时返回 404。
- Wrangler dry-run 成功读取 4 个静态资源文件并完成 Worker 打包检查。
- 依赖审计无已知漏洞。
- 无头浏览器截图已保存到 `docs/v02-dashboard.png`。

## 22. v0.3-CF 验证记录

本地验证时间：2026-06-26

已执行：

- `npm run typecheck`
- `npm test`
- `node --check public/assets/app.js`
- `npm audit --json`
- `npx wrangler deploy --dry-run`
- `GET /api/assets/graph`
- `GET /api/assets/graph?domain=example.com`
- `GET /api/assets/domains/example.com`

验证结果：

- 关系推断新增 `dns_record -> worker_route` 和 `pages_domain -> dns_record`。
- 关系图 API 返回 `nodes` / `edges` 结构。
- Domain Detail 返回内嵌 `graph`。
- Relations 前端视图可以加载全局图、域名图和 Profile 过滤图。
- 前端 JS 语法检查通过。
- Wrangler dry-run 成功完成 Worker 与 Static Assets 打包检查。
- 无头浏览器截图已保存到 `docs/v03-relations.png`。
