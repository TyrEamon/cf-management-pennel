# 部署到 Cloudflare（连接 GitHub 自动部署）

这是一个 **Cloudflare Workers** 项目（带 D1 数据库 + Queue + Cron），不是纯静态站点，
所以**不能**用 Cloudflare Pages 的 Git 连接，要用 **Workers 自带的 Git 集成（Workers Builds）**。

下面分两段：**①一次性准备**（建资源、加密钥、首次部署），**②连接 GitHub 自动部署**。
准备完成后，以后每次 `git push` 都会自动部署。

---

## 前置：登录 wrangler

```bash
npx wrangler login
```

浏览器弹出授权后回到终端即可。

---

## ① 一次性准备

### 1. 创建 D1 数据库

```bash
npx wrangler d1 create cf-asset-hub-db
```

命令会输出一段 `database_id`，形如：

```
database_id = "12345678-90ab-cdef-1234-567890abcdef"
```

把这个 ID 填到 `wrangler.jsonc` 里 `d1_databases[0].database_id`，
替换现在的占位值 `00000000-0000-0000-0000-000000000000`。

### 2. 创建队列

```bash
npx wrangler queues create cf-asset-hub-sync
```

### 3. 设置两个密钥（Secrets）

主密钥可以用脚本生成：

```bash
node scripts/gen-master-key.mjs
```

然后逐个写入（命令会提示你粘贴值）：

```bash
npx wrangler secret put APP_MASTER_KEY_BASE64   # 粘贴上面生成的 base64
npx wrangler secret put ADMIN_API_TOKEN          # 自己定一个登录后台用的强口令
```

> ⚠️ `APP_MASTER_KEY_BASE64` 一旦用于加密了 API Token 就**不要再换**，否则已存的 Token 解不开。

### 4. 应用数据库迁移（建表）

```bash
npm run db:migrate:remote
```

### 5. 首次部署（创建出这个 Worker）

```bash
npm run deploy
```

成功后会给你一个 `https://cf-asset-hub.<你的子域>.workers.dev` 地址，打开就能用。

---

## ② 连接 GitHub 自动部署（Workers Builds）

1. 打开 Cloudflare 控制台 → **Workers & Pages** → 进入 `cf-asset-hub`。
2. **Settings → Build** → **Connect** → 选择 GitHub，授权并选仓库
   `TyrEamon/cf-management-pennel`，分支 `main`。
3. 构建设置（一般默认即可）：
   - Build command：留空（或 `npm ci`）
   - Deploy command：`npx wrangler deploy`
4. 保存。之后每次 push 到 `main`，Cloudflare 会自动构建并部署。

> 数据库结构以后有变化时（新增 migration），仍需手动跑一次
> `npm run db:migrate:remote`，自动部署不会自动跑迁移。

---

## 部署后

- 打开 Worker 地址，在右上角输入你设置的 `ADMIN_API_TOKEN` 解锁。
- 进「账号管理」添加 Cloudflare 账号（Account ID + 只读 API Token），点「同步」。
- Cron 已配置每 6 小时自动同步一次（见 `wrangler.jsonc` 的 `triggers.crons`）。

## 本地自检（可选）

```bash
npm run check              # 类型检查 + 单元测试
npx wrangler deploy --dry-run
```
