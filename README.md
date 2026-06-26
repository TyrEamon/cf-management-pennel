# Cloudflare Asset Hub

多 Cloudflare 账号资产扫描、索引、搜索与权限检测工具。

## 当前状态

项目工作区已移动到：

```text
D:\Desktop\cf-asset-hub
```

当前已完成：

- 需求文档：`docs/PRD.md`
- 实施文档：`docs/IMPLEMENTATION.md`
- Cloudflare Worker API
- D1 migration
- Queue / Cron 同步入口
- Profile 管理与 token 加密
- Cloudflare 权限检测
- Zones / Workers / Pages / R2 / D1 / KV 扫描落库
- 隐私保护：不采集、不展示 DNS 记录和 Worker 路由，避免源站 IP 等敏感信息入库
- 搜索索引
- 资源关系推断
- 异常检查
- v0.2-CF Workers Static Assets 前端后台
- v0.2-CF 本地静态资源/API 冒烟验证
- v0.3-CF 关系推断增强与资产图谱

## 第一版目标

v0.1-CF 先做 Cloudflare 原生部署的只读资产盘点：

- 添加 Cloudflare Profile
- 加密保存 API Token
- 检测 token 权限
- 同步 Zones / Workers / Pages / R2 / D1 / KV
- DNS 记录和 Worker 路由默认不采集、不展示
- 全局搜索资源属于哪个账号
- 记录同步状态和错误

## Cloudflare API Token 权限

在 Cloudflare Dashboard 创建 Profile 时，需要填入该账号的 `Account ID` 和一个只读 API Token。推荐使用 **Create Custom Token** 创建专用令牌，不要使用 Global API Key。

当前版本只做资产盘点，不会修改 Cloudflare 资源。Token 建议配置为只读：

| 权限范围 | 权限组 | 级别 | 用途 |
| --- | --- | --- | --- |
| Zone | Zone | Read | 读取 Zone/域名列表，用于统计域名归属 |
| Account | Workers Scripts | Read | 读取 Worker 脚本列表 |
| Account | Cloudflare Pages | Read | 读取 Pages 项目和自定义域名 |
| Account | R2 Storage | Read | 读取 R2 bucket 列表 |
| Account | D1 | Read | 读取 D1 数据库列表 |
| Account | Workers KV Storage | Read | 读取 KV namespace 列表 |

资源范围建议：

- `Account Resources`：选择 `Include -> Specific account -> 目标账号`。
- `Zone Resources`：选择 `Include -> All zones`，或者只选择你想纳入盘点的 zones。
- 如果某类资产你不需要看，可以不授予对应权限；页面会在权限检测里显示该项失败或为空，其他模块仍会继续同步。

隐私版不需要、也不建议授予这些权限：

- `Zone / DNS / Read`：不会读取 DNS 记录，避免源站 IP、解析目标等敏感信息入库。
- `Account / Workers Routes / Read` 或类似 Worker 路由权限：不会读取 Worker 路由。
- 任何 `Edit` / `Write` / `Delete` 权限：本项目当前不需要写权限。

注意：`ADMIN_API_TOKEN` 是本面板自己的后台登录口令，不是 Cloudflare API Token；Cloudflare Profile 里填写的才是 Cloudflare API Token。

## 技术路线

```text
Cloudflare Worker API
Workers Static Assets frontend
Cloudflare D1
Cloudflare Queues
Cloudflare Cron Triggers
Worker Secrets
Asset graph API
```

## 本地命令

```bash
npm install
npm run types
npm run db:migrate:local
npm run check
npm run dev
```

本地开发服务当前可用：

```text
http://127.0.0.1:8788
```

本地 Dashboard 的 Admin API Token：

```text
dev-admin-token
```

部署前需要创建远端资源并设置 secrets：

```bash
npx wrangler d1 create cf-asset-hub-db
npx wrangler queues create cf-asset-hub-sync
npx wrangler secret put APP_MASTER_KEY_BASE64
npx wrangler secret put ADMIN_API_TOKEN
npm run db:migrate:remote
npm run deploy
```

详见：

- `docs/PRD.md`
- `docs/IMPLEMENTATION.md`

## 前端后台

v0.2-CF 的前端后台位于：

```text
public/index.html
public/assets/app.css
public/assets/app.js
```

`wrangler.jsonc` 使用 Workers Static Assets：

```jsonc
"assets": {
  "directory": "./public",
  "not_found_handling": "single-page-application",
  "run_worker_first": ["/api/*"]
}
```

## v0.3 关系图谱

新增接口：

```text
GET /api/assets/graph
GET /api/assets/graph?domain=example.com
GET /api/assets/graph?profileId=<profile_id>
```

新增前端视图：

```text
Relations
Domain Detail -> Relation Graph
```

关系推断覆盖：

```text
pages_domain -> pages_project
```

## 验证记录

已通过：

```bash
npm run types
npm run typecheck
npm test
node --check public/assets/app.js
npm audit --json
npx wrangler deploy --dry-run
```

本地冒烟验证：

```text
GET /                         -> Workers Static Assets
GET /assets/app.css           -> CSS
GET /assets/app.js            -> JS
GET /api/health               -> Worker API
GET /api/assets/overview      -> Worker API with admin token
GET /api/assets/graph         -> Asset graph API
```

前端截图：

```text
docs/v02-dashboard.png
docs/v03-relations.png
```
