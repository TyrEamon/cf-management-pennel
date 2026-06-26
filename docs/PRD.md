# Cloudflare Asset Hub 需求文档

版本：v0.1  
日期：2026-06-26  
项目目录：`D:\Desktop\cf-asset-hub`

## 1. 项目背景

当前存在多个 Cloudflare 账号，域名、DNS、Workers、Pages、R2、D1、KV 等资源分散在不同账号中。随着账号数量和项目数量增加，手动记忆和逐个登录 Cloudflare Dashboard 查询已经不可持续。

本项目的核心目标是建立一个私有的 Cloudflare 资产台账系统，用统一入口扫描、索引、搜索所有账号中的资产，回答：

- 某个域名在哪个 Cloudflare 账号里？
- 某个 Worker / Pages 项目属于哪个账号？
- 某个域名绑定了 Pages、Worker，还是只配置了 DNS？
- 哪些账号有 R2、D1、KV 等资源？
- 哪些账号 token 权限不完整、失效或同步失败？

## 2. 项目定位

项目名称暂定为 `Cloudflare Asset Hub`。

第一版定位为：

```text
多 Cloudflare 账号资产扫描、索引、搜索、权限检测工具
```

第一版只做只读盘点，不做任何资源修改操作。

## 3. 用户与使用场景

目标用户是拥有多个 Cloudflare 账号的个人或小团队管理员。

典型场景：

- 输入域名，快速知道它在哪个 CF 账号、哪个 Zone 中。
- 输入 Worker 名称，快速知道它属于哪个账号。
- 输入 Pages 项目名，查看绑定的自定义域名。
- 查看某个账号下所有域名、DNS、Worker、Pages、R2、D1、KV。
- 新增 CF 账号 token 后，立即检测是否缺少必要权限。
- 同步失败时，知道是 token 失效、权限缺失、接口失败，还是资源为空。

## 4. 第一版范围

### 4.1 必须实现

- Cloudflare Profile 管理
- API Token 加密保存
- Profile 权限检测
- 手动同步指定 Profile
- 手动同步全部 Profile
- 资产数据入库
- 全局搜索
- 同步状态与错误记录
- 基础 Web UI 或 CLI，两者至少实现一个

### 4.2 第一版扫描资源

- Accounts
- Zones
- DNS Records
- Workers Scripts
- Workers Routes
- Pages Projects
- Pages Custom Domains
- R2 Buckets
- D1 Databases
- KV Namespaces

### 4.3 第一版不做

- 不修改 DNS
- 不删除资源
- 不迁移 Pages / Worker
- 不自动修复配置
- 不保存 Cloudflare 邮箱密码
- 不明文保存 token
- 不做复杂的账单和成本分析
- 不把用量统计作为 v0.1 阻塞项

## 5. 核心概念

### 5.1 Cloudflare Profile

一个 Profile 表示一个 Cloudflare 账号的只读访问配置。

字段：

- Profile 名称
- Account ID
- API Token
- 备注
- 是否启用
- 最后同步时间
- 最近同步状态

### 5.2 Asset

Asset 是被扫描出的 Cloudflare 资源，包括：

- Zone
- DNS Record
- Worker Script
- Worker Route
- Pages Project
- Pages Domain
- R2 Bucket
- D1 Database
- KV Namespace

### 5.3 Asset Link

Asset Link 表示资源之间的关系，例如：

- 域名包含 DNS 记录
- 域名命中 Worker Route
- 域名绑定 Pages 项目
- DNS CNAME 指向 Pages 域名
- DNS CNAME 指向 Cloudflare Tunnel

## 6. 功能需求

### 6.1 Profile 管理

用户可以添加、编辑、禁用、删除 Cloudflare Profile。

添加 Profile 时需要填写：

- Profile 名称
- Account ID
- API Token
- 备注，可选

保存 Profile 时，系统必须：

- 加密保存 API Token
- 不在前端再次显示完整 token
- 不在日志中输出 token
- 记录创建时间和更新时间

### 6.2 权限检测

系统提供“测试权限”功能。

检测项：

- Account Read
- Zone Read
- DNS Read
- Workers Scripts Read
- Workers Routes Read
- Pages Read
- KV Read
- D1 Read
- R2 Read

检测结果需要区分：

- 正常
- 权限不足
- token 失效
- account_id 不匹配
- Cloudflare API 错误
- 网络错误

页面展示示例：

```text
Profile: 主号
Zone Read              正常
DNS Read               正常
Workers Scripts Read   正常
Pages Read             正常
KV Read                权限不足
D1 Read                正常
R2 Read                正常
```

### 6.3 资产同步

系统支持：

- 同步单个 Profile
- 同步全部 Profile
- 查看最近一次同步状态
- 查看同步耗时
- 查看同步错误

同步时，一个资源类型失败不能导致整个 Profile 同步失败。

示例：

```text
主号：
  Zones 同步成功
  DNS Records 同步成功
  Workers 同步成功
  KV 跳过：权限不足
  R2 同步成功
```

### 6.4 全局搜索

用户可以在一个搜索框中输入关键词。

搜索范围：

- 域名
- DNS 记录名
- DNS 记录内容
- Worker 名称
- Worker Route
- Pages 项目名
- Pages 自定义域名
- R2 Bucket 名称
- D1 Database 名称
- KV Namespace 名称

搜索结果必须显示：

- 资源类型
- 资源名称
- 所属 Profile
- Account ID
- 相关 Zone
- 最近同步时间
- 关联资源

### 6.5 账号视图

按 Profile 展示该账号下的所有资产。

展示内容：

- 域名数量
- DNS 记录数量
- Workers 数量
- Worker Routes 数量
- Pages 项目数量
- R2 Bucket 数量
- D1 Database 数量
- KV Namespace 数量
- 最近同步状态

### 6.6 域名视图

按域名展示资产关系。

每个域名展示：

- 所属 Profile
- Zone ID
- Zone 状态
- DNS 记录
- 命中的 Worker Routes
- 绑定的 Pages 项目
- 疑似 Tunnel 记录
- 最近同步时间

### 6.7 风险与异常检查

第一版至少支持以下异常提示：

- token 失效
- 权限不足
- 同步失败
- DNS CNAME 指向 `*.pages.dev` 但未找到对应 Pages 项目
- Worker Route 指向的 Worker 不存在
- Pages 自定义域名存在但 DNS 未发现对应记录
- 长时间未同步的 Profile

## 7. 数据需求

第一版使用 SQLite。

建议核心表：

- `profiles`
- `profile_permission_checks`
- `sync_jobs`
- `sync_errors`
- `cf_accounts`
- `zones`
- `dns_records`
- `workers`
- `worker_routes`
- `pages_projects`
- `pages_domains`
- `r2_buckets`
- `d1_databases`
- `kv_namespaces`
- `asset_links`

所有 Cloudflare 原始响应建议保存到 `raw_json` 字段，方便后续补字段和排错。

关键资源表建议包含：

- `profile_id`
- `account_id`
- `raw_json`
- `first_seen_at`
- `last_seen_at`
- `deleted_at`

这样可以区分：

- 当前仍存在的资源
- 以前存在但本次同步未发现的资源
- 因同步失败无法确认状态的资源

## 8. 同步策略

同步流程：

```text
读取 Profile
解密 API Token
检测 Account 可访问性
同步 Account 信息
同步 Zones
按 Zone 同步 DNS Records
按 Zone 同步 Worker Routes
按 Account 同步 Workers Scripts
按 Account 同步 Pages Projects
按 Pages Project 同步 Custom Domains
按 Account 同步 R2 / D1 / KV
生成 Asset Links
记录 Sync Job 结果
```

同步要求：

- 支持分页
- 支持失败重试
- 支持 API 限速
- 支持模块级错误记录
- 一个 Profile 失败不影响其他 Profile
- 一个资源类型失败不影响同 Profile 下其他资源类型

## 9. 关系推断规则

### 9.1 域名到 DNS

Zone 和 DNS Records 是确定关系。

### 9.2 域名到 Worker

优先使用 Worker Routes。

例如：

```text
example.com/*
api.example.com/*
```

系统可以推断对应域名或子域名由某个 Worker 处理。

### 9.3 域名到 Pages

优先使用 Pages Custom Domains API。

其次使用 DNS CNAME 推断：

```text
www.example.com CNAME project.pages.dev
```

### 9.4 域名到 Tunnel

通过 DNS CNAME 启发式识别：

```text
xxx.example.com CNAME <uuid>.cfargotunnel.com
```

第一版只做提示，不要求完整接入 Tunnel API。

## 10. 安全要求

### 10.1 Token 保存

- token 必须加密后入库
- 主密钥存放在 `.env`
- `.env` 不得提交 Git
- 日志不得输出 token
- 前端不得回显完整 token
- 导出资产不得包含 token

建议加密算法：

```text
AES-256-GCM
```

### 10.2 Token 权限

第一版要求使用只读 token。

推荐权限模板：

```text
Zone / Zone / Read
Zone / DNS / Read
Account / Workers Scripts / Read
Account / Workers Routes / Read
Account / Cloudflare Pages / Read
Account / Workers KV Storage / Read
Account / D1 / Read
Account / R2 / Read
```

如后续启用用量统计，再补 Analytics / GraphQL 相关权限。

### 10.3 系统访问

如果部署为 Web UI：

- 必须有登录保护
- 不建议公网裸奔
- 优先本地或 VPS 内网部署
- 如公网访问，必须启用 HTTPS

## 11. 技术方案

第一版推荐：

```text
Runtime: Node.js
Language: TypeScript
Backend: Hono 或 Fastify
Database: SQLite
ORM: Drizzle
Frontend: Vue 3 + Vite
Deployment: 本地 / VPS / Docker
```

也可以先做 CLI：

```text
cf-asset-hub profile add
cf-asset-hub profile test
cf-asset-hub sync
cf-asset-hub search <keyword>
```

推荐路线：

```text
先 CLI
再 Web UI
先资产扫描
再关系推断
最后加用量统计
```

## 12. 页面规划

### 12.1 总览页

展示：

- Profile 数量
- Zone 数量
- DNS 记录数量
- Worker 数量
- Pages 项目数量
- R2 / D1 / KV 数量
- 异常 Profile 数量
- 最近同步时间

### 12.2 全局搜索页

核心页面。

提供搜索框和结果列表，支持按资源类型过滤。

### 12.3 Profile 页面

展示某个 Profile 下所有资源和权限状态。

### 12.4 域名页面

展示域名的 DNS、Pages、Worker、Tunnel 关联关系。

### 12.5 异常页面

集中展示权限、同步、疑似废弃资源、绑定异常。

## 13. 里程碑

### v0.1 CLI MVP

- 初始化项目
- SQLite schema
- Profile 添加与 token 加密
- Profile 权限测试
- 同步 Zones / DNS / Workers / Pages / R2 / D1 / KV
- 全局搜索
- 同步错误记录

### v0.2 Web UI

- 登录
- 总览页
- Profile 管理页
- 全局搜索页
- 域名详情页
- 异常页

### v0.3 关系推断

- Pages 绑定关系
- Worker Route 关系
- DNS CNAME 推断
- Tunnel CNAME 提示
- Asset Links 图谱

### v0.4 用量统计

- Workers 请求量
- KV 请求量
- D1 查询量
- 按日统计趋势
- GraphQL Analytics 权限检测

## 14. 验收标准

v0.1 完成时，应满足：

- 至少可添加 2 个 Cloudflare Profile
- token 以加密形式存储
- 可以对每个 Profile 执行权限检测
- 可以同步出 Zone 和 DNS Records
- 可以同步出 Workers、Pages、R2、D1、KV 列表
- 可以搜索任意域名并返回所属 Profile
- 某个 Profile 同步失败不会影响其他 Profile
- 某类资源权限不足时能给出明确错误
- 日志和导出文件不包含明文 token

## 15. 待确认问题

- 第一版是否只做 CLI，还是直接做 Web UI？
- 是否需要支持 Windows 服务常驻运行？
- 是否需要支持定时自动同步？
- 是否需要把历史已删除资产保留在页面中？
- 是否需要导出 CSV / JSON？
- 是否需要支持多用户登录？
- 是否需要用量统计进入 v0.1，还是放到 v0.4？

