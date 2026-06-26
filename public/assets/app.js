/* ===================================================================
   Cloudflare 资产中心 — 前端 SPA
   数据来源：/api/assets/overview, /api/assets/profiles/:id,
            /api/search, /api/sync, /api/issues, /api/profiles
   =================================================================== */

const state = {
  token: sessionStorage.getItem("cfah_admin_token") || "",
  view: "home",
  summaries: [],        // 账号汇总（含计数）
  overview: {},         // 全局聚合
  detail: null,         // 当前详情数据
  detailProfile: null,  // 当前详情对应的账号汇总
  assetTab: "zones",
};

const ASSET_TABS = [
  ["zones", "域名"],
  ["dnsRecords", "DNS"],
  ["workers", "Workers"],
  ["workerRoutes", "路由"],
  ["pagesProjects", "Pages"],
  ["pagesDomains", "Pages 域名"],
  ["r2Buckets", "R2"],
  ["d1Databases", "D1"],
  ["kvNamespaces", "KV"],
  ["permissionChecks", "权限"],
];

// 概览统计：值由 overview 聚合派生（见 renderStats）
const STATS = ["账号", "域名", "Workers", "Pages", "资产合计", "异常"];

const $ = (id) => document.getElementById(id);

document.addEventListener("DOMContentLoaded", () => {
  bind();
  $("adminToken").value = state.token;
  applyTheme(localStorage.getItem("cfah_theme") || "light");
  updateLock();
  go("home");
  if (state.token) refresh().catch(showError);
  else showNotice("输入 Admin Token 解锁面板。");
});

/* ---------------- 事件绑定 ---------------- */
function bind() {
  document.querySelectorAll("[data-nav]").forEach((el) => {
    el.addEventListener("click", () => go(el.dataset.nav));
    if (el.tabIndex === 0) el.addEventListener("keydown", (e) => { if (e.key === "Enter") go(el.dataset.nav); });
  });
  $("themeLight").addEventListener("click", () => applyTheme("light"));
  $("themeDark").addEventListener("click", () => applyTheme("dark"));
  $("refreshBtn").addEventListener("click", () => refresh().catch(showError));
  $("unlockBtn").addEventListener("click", unlock);
  $("adminToken").addEventListener("keydown", (e) => { if (e.key === "Enter") unlock(); });

  $("syncAllHome").addEventListener("click", () => syncAll().catch(showError));
  $("syncAllSync").addEventListener("click", () => syncAll().catch(showError));
  $("globalSearchFromHome").addEventListener("click", () => go("search"));
  $("cardFilter").addEventListener("input", renderCards);

  $("runSearch").addEventListener("click", () => runSearch().catch(showError));
  $("searchInput").addEventListener("keydown", (e) => { if (e.key === "Enter") runSearch().catch(showError); });

  $("profileForm").addEventListener("submit", (e) => { e.preventDefault(); addProfile().catch(showError); });
}

/* ---------------- 主题 / 会话 ---------------- */
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem("cfah_theme", theme);
  $("themeLight").classList.toggle("active", theme === "light");
  $("themeDark").classList.toggle("active", theme === "dark");
}

function unlock() {
  state.token = $("adminToken").value.trim();
  sessionStorage.setItem("cfah_admin_token", state.token);
  updateLock();
  hideNotice();
  refresh().catch(showError);
}

function updateLock() {
  $("sessionDot").className = "dot " + (state.token ? "unlocked" : "locked");
}

/* ---------------- 视图切换 ---------------- */
function go(view) {
  state.view = view;
  document.querySelectorAll(".view").forEach((v) => v.classList.toggle("active", v.id === `view-${view}`));
  document.querySelectorAll(".navlink").forEach((n) => n.classList.toggle("active", n.dataset.nav === view));
  window.scrollTo({ top: 0, behavior: "smooth" });
  if (!state.token) return;
  if (view === "home") loadHome().catch(showError);
  if (view === "sync") loadSync().catch(showError);
  if (view === "issues") loadIssues().catch(showError);
  if (view === "manage") loadManage().catch(showError);
}

function refresh() {
  if (!state.token) { showNotice("请先解锁。"); return Promise.resolve(); }
  hideNotice();
  if (state.view === "detail" && state.detailProfile) return openDetail(state.detailProfile.id);
  return go(state.view), Promise.resolve();
}

/* ---------------- API ---------------- */
async function api(path, options = {}) {
  if (!state.token) throw new Error("需要 Admin Token。");
  const res = await fetch(path, {
    ...options,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${state.token}`,
      ...(options.headers || {}),
    },
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(payload.error || res.statusText);
  return payload.data ?? payload;
}

/* ---------------- 总览 ---------------- */
async function loadHome() {
  const data = await api("/api/assets/overview");
  state.overview = data.overview || {};
  state.summaries = data.profileSummaries || [];
  renderStats();
  renderCards();
}

function renderStats() {
  const o = state.overview;
  const totalAssets = ["zones", "dnsRecords", "workers", "workerRoutes", "pagesProjects",
    "pagesDomains", "r2Buckets", "d1Databases", "kvNamespaces"]
    .reduce((sum, k) => sum + Number(o[k] || 0), 0);
  const values = [o.profiles, o.zones, o.workers, o.pagesProjects, totalAssets, o.openIssues];
  $("statStrip").innerHTML = STATS.map((label, i) => `
    <div class="stat">
      <div class="stat-val">${num(values[i] ?? 0)}</div>
      <div class="stat-label">${label}</div>
    </div>`).join("");
}

function renderCards() {
  const q = $("cardFilter").value.trim().toLowerCase();
  const list = state.summaries.filter((p) =>
    !q ||
    p.name.toLowerCase().includes(q) ||
    p.accountId.toLowerCase().includes(q) ||
    (p.note || "").toLowerCase().includes(q),
  );
  $("cardCount").textContent = String(list.length);

  if (!list.length) {
    $("cardGrid").innerHTML = empty(state.summaries.length ? "没有匹配的账号。" : "还没有账号，去「账号管理」添加一个。");
    return;
  }

  $("cardGrid").innerHTML = list.map(cardHtml).join("");
  document.querySelectorAll("[data-card]").forEach((el) => {
    el.addEventListener("click", () => openDetail(el.dataset.card).catch(showError));
    el.addEventListener("keydown", (e) => { if (e.key === "Enter") openDetail(el.dataset.card).catch(showError); });
  });
}

function cardHtml(p) {
  const c = p.counts;
  const st = p.enabled ? (p.latestSyncStatus || p.status || "unknown") : "disabled";
  return `
    <div class="card" data-card="${esc(p.id)}" role="button" tabindex="0">
      <div class="card-top">
        <div style="min-width:0">
          <div class="card-title">
            <span class="sdot ${esc(st)}" title="${esc(st)}"></span>
            <span class="card-name">${esc(p.name)}</span>
          </div>
          <div class="card-acc">${esc(p.accountId)}</div>
        </div>
        ${c.openIssues > 0 ? `<span class="tag warn">${c.openIssues} 异常</span>` : `<span class="tag ok">正常</span>`}
      </div>
      <div class="card-note">${esc(p.note || p.emailHint || "—")}</div>

      <div class="card-metrics">
        <div class="metric"><div class="metric-val">${num(p.domainTotal)}</div><div class="metric-lbl">域名</div></div>
        <div class="metric"><div class="metric-val">${num(c.workers)}</div><div class="metric-lbl">Workers</div></div>
        <div class="metric"><div class="metric-val">${num(c.pagesProjects)}</div><div class="metric-lbl">Pages</div></div>
      </div>

      <div class="card-mini">
        <span class="mini">DNS <b>${num(c.dnsRecords)}</b></span>
        <span class="mini">R2 <b>${num(c.r2Buckets)}</b></span>
        <span class="mini">D1 <b>${num(c.d1Databases)}</b></span>
        <span class="mini">KV <b>${num(c.kvNamespaces)}</b></span>
      </div>

      <div class="card-foot">
        <span>资产合计 <b style="color:var(--text)">${num(p.totalAssets)}</b></span>
        <span>同步 ${relTime(p.latestSyncFinishedAt || p.lastSyncAt)}</span>
      </div>
    </div>`;
}

/* ---------------- 账号详情 ---------------- */
async function openDetail(profileId) {
  const profile = state.summaries.find((p) => p.id === profileId);
  if (profile) state.detailProfile = profile;
  go("detail");
  $("detailHero").innerHTML = `<div class="empty">加载中…</div>`;
  $("detailKpis").innerHTML = "";
  $("assetTabs").innerHTML = "";
  $("assetTable").innerHTML = "";

  state.detail = await api(`/api/assets/profiles/${profileId}`);
  if (!state.detailProfile) {
    // 兜底：从汇总刷新
    try { const d = await api("/api/assets/overview"); state.summaries = d.profileSummaries || []; } catch {}
    state.detailProfile = state.summaries.find((p) => p.id === profileId) || null;
  }
  renderDetail();
}

function renderDetail() {
  const p = state.detailProfile;
  const d = state.detail;
  if (!p) { $("detailHero").innerHTML = empty("账号信息缺失。"); return; }
  const st = p.enabled ? (p.latestSyncStatus || p.status || "unknown") : "disabled";

  $("detailHero").innerHTML = `
    <div style="min-width:0">
      <div class="hero-name"><span class="sdot ${esc(st)}"></span>${esc(p.name)}</div>
      <div class="hero-meta">
        <span class="mono"><b>Account</b> ${esc(p.accountId)}</span>
        ${p.emailHint ? `<span><b>邮箱</b> ${esc(p.emailHint)}</span>` : ""}
        <span><b>状态</b> ${esc(p.enabled ? "启用" : "停用")}</span>
        <span><b>最近同步</b> ${relTime(p.latestSyncFinishedAt || p.lastSyncAt)}</span>
        ${p.counts.openIssues > 0 ? `<span style="color:#ef4444"><b>异常</b> ${p.counts.openIssues}</span>` : ""}
      </div>
      ${p.note ? `<div class="muted">${esc(p.note)}</div>` : ""}
    </div>
    <div class="hero-actions">
      <button class="btn primary sm" id="detailSync" type="button">同步该账号</button>
      <button class="btn sm" id="detailTest" type="button">测试权限</button>
    </div>`;
  $("detailSync").addEventListener("click", () => syncProfile(p.id).catch(showError));
  $("detailTest").addEventListener("click", () => testProfile(p.id).catch(showError));

  const c = p.counts;
  const kpis = [
    [p.domainTotal, "域名"], [c.dnsRecords, "DNS 记录"], [c.workers, "Workers"], [c.workerRoutes, "路由"],
    [c.pagesProjects, "Pages"], [c.r2Buckets, "R2"], [c.d1Databases, "D1"], [c.kvNamespaces, "KV"],
  ];
  $("detailKpis").innerHTML = kpis.map(([v, l]) => `<div class="kpi"><div class="kpi-val">${num(v)}</div><div class="kpi-lbl">${l}</div></div>`).join("");

  // 默认选第一个有数据的 tab
  if (!(d[state.assetTab] || []).length) {
    const first = ASSET_TABS.find(([k]) => (d[k] || []).length);
    state.assetTab = first ? first[0] : "zones";
  }
  renderAssetTabs();
}

function renderAssetTabs() {
  const d = state.detail;
  $("assetTabs").innerHTML = ASSET_TABS.map(([key, label]) => {
    const n = (d[key] || []).length;
    return `<button class="asset-tab ${key === state.assetTab ? "active" : ""}" data-tab="${key}" type="button">${label}<span class="n">${n}</span></button>`;
  }).join("");
  document.querySelectorAll("[data-tab]").forEach((b) => b.addEventListener("click", () => {
    state.assetTab = b.dataset.tab; renderAssetTabs();
  }));
  $("assetTable").innerHTML = table(state.detail[state.assetTab] || []);
}

/* ---------------- 搜索 ---------------- */
async function runSearch() {
  const q = $("searchInput").value.trim();
  if (!q) return;
  const results = await api(`/api/search?q=${encodeURIComponent(q)}`);
  $("searchCount").textContent = String(results.length);
  if (!results.length) { $("searchResults").innerHTML = empty("没有匹配的资源。"); return; }
  $("searchResults").innerHTML = tableWrap(results, [
    ["类型", (r) => html(`<span class="pill">${esc(r.resource_type)}</span>`)],
    ["名称", (r) => r.title],
    ["详情", (r) => r.subtitle || "—"],
    ["账号", (r) => profileName(r.profile_id)],
    ["更新", (r) => relTime(r.updated_at)],
  ], (r) => r.profile_id ? `data-open="${esc(r.profile_id)}"` : "");
  document.querySelectorAll("[data-open]").forEach((tr) => {
    tr.style.cursor = "pointer";
    tr.addEventListener("click", () => openDetail(tr.dataset.open).catch(showError));
  });
}

/* ---------------- 同步 ---------------- */
async function loadSync() {
  const jobs = await api("/api/sync/jobs");
  if (!jobs.length) { $("syncJobs").innerHTML = empty("还没有同步任务。"); }
  else $("syncJobs").innerHTML = tableWrap(jobs, [
    ["状态", (r) => html(statusBadge(r.status))],
    ["范围", (r) => r.scope],
    ["账号", (r) => profileName(r.profile_id)],
    ["错误", (r) => String(r.total_errors || 0)],
    ["开始", (r) => relTime(r.started_at)],
    ["", (r) => html(`<button class="btn xs" data-job="${esc(r.id)}" type="button">错误</button>`)],
  ]);
  document.querySelectorAll("[data-job]").forEach((b) => b.addEventListener("click", (e) => {
    e.stopPropagation(); loadJobErrors(b.dataset.job).catch(showError);
  }));
  if (!$("syncErrors").innerHTML.trim()) $("syncErrors").innerHTML = empty("选择一个任务查看错误。");
}

async function loadJobErrors(jobId) {
  const errors = await api(`/api/sync/jobs/${jobId}/errors`);
  $("selectedJobName").textContent = jobId;
  $("syncErrors").innerHTML = table(errors);
}

async function syncAll() {
  const r = await api("/api/sync/all", { method: "POST" });
  showNotice(`已排队 ${r.syncJobIds?.length ?? 0} 个同步任务。`);
  go("sync");
}

async function syncProfile(id) {
  const r = await api(`/api/profiles/${id}/sync`, { method: "POST" });
  showNotice(`已排队同步任务 ${r.syncJobId}。`);
  go("sync");
}

async function testProfile(id) {
  const checks = await api(`/api/profiles/${id}/test`, { method: "POST" });
  showNotice(`权限检查：${checks.map((c) => `${c.checkKey}:${c.status}`).join("，")}`);
}

/* ---------------- 异常 ---------------- */
async function loadIssues() {
  const issues = await api("/api/issues");
  $("issueCount").textContent = String(issues.length);
  if (!issues.length) { $("issuesList").innerHTML = empty("没有未处理的异常。"); return; }
  $("issuesList").innerHTML = tableWrap(issues, [
    ["严重度", (r) => html(statusBadge(r.severity))],
    ["类型", (r) => r.issue_type],
    ["标题", (r) => r.title],
    ["账号", (r) => r.profile_name || profileName(r.profile_id)],
    ["更新", (r) => relTime(r.updated_at)],
  ]);
}

/* ---------------- 账号管理 ---------------- */
async function loadManage() {
  const profiles = await api("/api/profiles");
  $("manageCount").textContent = String(profiles.length);
  if (!profiles.length) { $("manageList").innerHTML = empty("还没有账号。"); return; }
  $("manageList").innerHTML = profiles.map((p) => `
    <div class="acc-row">
      <span class="sdot ${esc(p.enabled ? (p.status || "unknown") : "disabled")}"></span>
      <div class="acc-info">
        <div class="acc-name">${esc(p.name)}</div>
        <div class="acc-sub">${esc(p.accountId)} · Token ${esc(p.tokenHint || "—")}</div>
      </div>
      <div class="acc-actions">
        <button class="btn xs" data-m-view="${esc(p.id)}" type="button">资产</button>
        <button class="btn xs" data-m-test="${esc(p.id)}" type="button">测试</button>
        <button class="btn xs" data-m-sync="${esc(p.id)}" type="button">同步</button>
        <button class="btn xs" data-m-toggle="${esc(p.id)}" data-en="${p.enabled ? 1 : 0}" type="button">${p.enabled ? "停用" : "启用"}</button>
      </div>
    </div>`).join("");

  document.querySelectorAll("[data-m-view]").forEach((b) => b.addEventListener("click", () => openDetail(b.dataset.mView).catch(showError)));
  document.querySelectorAll("[data-m-test]").forEach((b) => b.addEventListener("click", () => testProfile(b.dataset.mTest).catch(showError)));
  document.querySelectorAll("[data-m-sync]").forEach((b) => b.addEventListener("click", () => syncProfile(b.dataset.mSync).catch(showError)));
  document.querySelectorAll("[data-m-toggle]").forEach((b) => b.addEventListener("click", async () => {
    await api(`/api/profiles/${b.dataset.mToggle}`, { method: "PATCH", body: JSON.stringify({ enabled: b.dataset.en !== "1" }) });
    loadManage().catch(showError);
  }));
}

async function addProfile() {
  const body = {
    name: $("profileName").value.trim(),
    accountId: $("accountId").value.trim(),
    emailHint: $("emailHint").value.trim() || null,
    note: $("profileNote").value.trim() || null,
    apiToken: $("apiToken").value.trim(),
  };
  await api("/api/profiles", { method: "POST", body: JSON.stringify(body) });
  $("profileForm").reset();
  showNotice(`账号「${body.name}」已添加。`);
  loadManage().catch(showError);
}

/* ---------------- 通用表格 ---------------- */
function table(rows) {
  if (!rows || !rows.length) return empty("暂无数据。");
  const preferred = ["name", "title", "type", "content", "pattern", "script_name", "domain_name",
    "project_name", "check_key", "status", "result", "account_id", "last_seen_at", "updated_at"];
  const keys = preferred.filter((k) => Object.prototype.hasOwnProperty.call(rows[0], k));
  const cols = (keys.length ? keys : Object.keys(rows[0]).slice(0, 7)).map((k) => [
    humanize(k),
    (row) => /_at$/.test(k) ? relTime(row[k]) : (row[k] ?? "—"),
  ]);
  return tableWrap(rows, cols);
}

function tableWrap(rows, cols, rowAttr) {
  const head = cols.map(([l]) => `<th>${esc(l)}</th>`).join("");
  const body = rows.map((row) => {
    const attr = rowAttr ? rowAttr(row) : "";
    const cells = cols.map(([, get]) => `<td>${cell(get(row))}</td>`).join("");
    return `<tr ${attr}>${cells}</tr>`;
  }).join("");
  return `<div class="table-wrap"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

function cell(v) {
  if (v && typeof v === "object" && "__html" in v) return v.__html;
  return esc(String(v ?? ""));
}

/* ---------------- 小工具 ---------------- */
function html(s) { return { __html: s }; }
function statusBadge(v) { const s = String(v ?? "unknown"); return `<span class="status ${esc(s)}">${esc(s)}</span>`; }
function profileName(id) { return state.summaries.find((p) => p.id === id)?.name || (id ? id.slice(0, 8) : "—"); }
function num(v) { return Number(v || 0).toLocaleString(); }
function empty(msg) { return `<div class="empty">${esc(msg)}</div>`; }

function relTime(value) {
  if (!value) return "从未";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  const diff = Date.now() - d.getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "刚刚";
  if (min < 60) return `${min} 分钟前`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} 小时前`;
  const day = Math.floor(h / 24);
  if (day < 30) return `${day} 天前`;
  return d.toLocaleDateString();
}

function humanize(k) { return k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()); }

function esc(v) {
  return String(v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function showNotice(msg) { const n = $("notice"); n.textContent = msg; n.classList.remove("hidden"); }
function hideNotice() { $("notice").classList.add("hidden"); }
function showError(err) { showNotice(err?.message || String(err)); }
