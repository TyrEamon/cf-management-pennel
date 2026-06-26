/* ===================================================================
   Cloudflare 资产中心 — 前端 SPA
   两态：
     · public（未登录）— 仅 /api/public/overview，打码汇总，只读
     · admin（已登录）— 全部 /api/* 明细与控制
   =================================================================== */

const state = {
  token: sessionStorage.getItem("cfah_admin_token") || "",
  authed: false,
  view: "home",
  overview: {},
  summaries: [],
  detail: null,
  detailProfile: null,
  assetTab: "zones",
  editId: null,
};

const CARD_COLUMNS_KEY = "cfah_card_columns";
const DESKTOP_COLUMN_WIDTHS = { auto: "1680px", 3: "1180px", 4: "1500px", 5: "1880px" };
let cardColumnPrefs = readCardColumnPrefs();

const ASSET_TABS = [
  ["zones", "域名"], ["workers", "Workers"],
  ["pagesProjects", "Pages"], ["r2Buckets", "R2"],
  ["d1Databases", "D1"], ["kvNamespaces", "KV"], ["permissionChecks", "权限"],
];

const STATS = ["账号", "域名", "Workers", "Pages", "资产合计", "异常"];

const $ = (id) => document.getElementById(id);

document.addEventListener("DOMContentLoaded", () => {
  bind();
  applyTheme(localStorage.getItem("cfah_theme") || "light");
  applyCardColumns();
  applyAppearance();
  loadPublicAppearance().catch(() => {});
  if (state.token) {
    // 验证已存口令是否仍有效，否则回落到前台
    tryToken(state.token).catch(() => enterPublic());
  } else {
    enterPublic();
  }
});

/* ---------------- 事件绑定 ---------------- */
function bind() {
  document.querySelectorAll("[data-nav]").forEach((el) => {
    el.addEventListener("click", () => go(el.dataset.nav));
    if (el.tabIndex === 0) el.addEventListener("keydown", (e) => { if (e.key === "Enter") go(el.dataset.nav); });
  });
  $("themeToggle").addEventListener("click", toggleTheme);
  $("refreshBtn").addEventListener("click", () => {
    const b = $("refreshBtn");
    b.classList.remove("spinning");
    void b.offsetWidth;            // 重置动画
    b.classList.add("spinning");
    b.addEventListener("animationend", () => b.classList.remove("spinning"), { once: true });
    refresh().catch(showError);
  });

  $("loginBtn").addEventListener("click", openLogin);
  document.querySelectorAll(".public-login").forEach((b) => b.addEventListener("click", openLogin));
  $("logoutBtn").addEventListener("click", logout);
  $("loginSubmit").addEventListener("click", () => doLogin().catch(showError));
  $("loginInput").addEventListener("keydown", (e) => { if (e.key === "Enter") doLogin().catch(showError); });
  document.querySelectorAll("[data-login-close]").forEach((b) => b.addEventListener("click", closeLogin));

  $("syncAllHome").addEventListener("click", () => syncAll().catch(showError));
  $("syncAllSync").addEventListener("click", () => syncAll().catch(showError));
  $("globalSearchFromHome").addEventListener("click", () => go("search"));
  $("cardFilter").addEventListener("input", renderCards);
  document.querySelectorAll("[data-cols]").forEach((b) => b.addEventListener("click", () => setCardColumns(b.dataset.cols)));
  window.matchMedia("(max-width: 640px)").addEventListener("change", applyCardColumns);

  $("runSearch").addEventListener("click", () => runSearch().catch(showError));
  $("searchInput").addEventListener("keydown", (e) => { if (e.key === "Enter") runSearch().catch(showError); });

  $("profileForm").addEventListener("submit", (e) => { e.preventDefault(); addProfile().catch(showError); });
  $("editForm").addEventListener("submit", (e) => { e.preventDefault(); saveEdit(); });
  document.querySelectorAll("[data-edit-close]").forEach((b) => b.addEventListener("click", closeEdit));

  // 外观设置
  $("bgApply").addEventListener("click", () => { appearance.image = $("bgUrl").value.trim(); applyAppearance(); saveAppearance(); });
  $("bgUrl").addEventListener("keydown", (e) => { if (e.key === "Enter") { appearance.image = $("bgUrl").value.trim(); applyAppearance(); saveAppearance(); } });
  $("bgClear").addEventListener("click", () => { appearance.image = ""; $("bgUrl").value = ""; applyAppearance(); saveAppearance(); });
  $("bgImgOpacity").addEventListener("input", (e) => { appearance.imgOpacity = +e.target.value; applyAppearance(); saveAppearance(); });
  $("bgMaskOpacity").addEventListener("input", (e) => { appearance.maskOpacity = +e.target.value; applyAppearance(); saveAppearance(); });
  $("cardOpacity").addEventListener("input", (e) => { appearance.cardOpacity = +e.target.value; applyAppearance(); saveAppearance(); });
  $("bgReset").addEventListener("click", resetAppearance);
}

/* ---------------- 外观设置 ---------------- */
const APPEARANCE_KEY = "cfah_appearance";
const APPEARANCE_DEFAULT = { image: "", imgOpacity: 100, maskOpacity: 45, cardOpacity: 100 };
let appearance = normalizeAppearance(readAppearance());
let appearanceSaveTimer = null;

function readAppearance() {
  try { return JSON.parse(localStorage.getItem(APPEARANCE_KEY) || "{}"); } catch { return {}; }
}

function normalizeAppearance(value) {
  const v = value && typeof value === "object" ? value : {};
  return {
    image: typeof v.image === "string" ? v.image : APPEARANCE_DEFAULT.image,
    imgOpacity: clampNumber(v.imgOpacity, 0, 100, APPEARANCE_DEFAULT.imgOpacity),
    maskOpacity: clampNumber(v.maskOpacity, 0, 100, APPEARANCE_DEFAULT.maskOpacity),
    cardOpacity: clampNumber(v.cardOpacity, 30, 100, APPEARANCE_DEFAULT.cardOpacity),
  };
}

function clampNumber(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function setAppearance(value, { keepLocalOnly = false } = {}) {
  appearance = normalizeAppearance(value);
  localStorage.setItem(APPEARANCE_KEY, JSON.stringify(appearance));
  applyAppearance();
  if (!keepLocalOnly) queueCloudAppearanceSave();
}

function saveAppearance() {
  appearance = normalizeAppearance(appearance);
  localStorage.setItem(APPEARANCE_KEY, JSON.stringify(appearance));
  queueCloudAppearanceSave();
}

function queueCloudAppearanceSave() {
  if (!state.authed) return;
  clearTimeout(appearanceSaveTimer);
  appearanceSaveTimer = setTimeout(() => {
    saveCloudAppearance().catch((e) => showNotice(`外观已临时保存在本地，D1 保存失败：${e.message}`));
  }, 400);
}

async function saveCloudAppearance() {
  if (!state.authed) return;
  const saved = await api("/api/settings/appearance", { method: "PUT", body: JSON.stringify(appearance) });
  appearance = normalizeAppearance(saved);
  localStorage.setItem(APPEARANCE_KEY, JSON.stringify(appearance));
}

async function loadPublicAppearance() {
  const saved = await publicGet("/api/public/appearance");
  setAppearance(saved, { keepLocalOnly: true });
}

async function loadCloudAppearance() {
  const saved = await api("/api/settings/appearance");
  setAppearance(saved, { keepLocalOnly: true });
}

function applyAppearance() {
  const root = document.documentElement;
  if (appearance.image) {
    document.body.classList.add("has-bg");
    root.style.setProperty("--bg-image", `url("${cssUrl(appearance.image)}")`);
  } else {
    document.body.classList.remove("has-bg");
    root.style.removeProperty("--bg-image");
  }
  root.style.setProperty("--bg-image-opacity", String(appearance.imgOpacity / 100));
  root.style.setProperty("--bg-mask-opacity", String(appearance.maskOpacity / 100));
  root.style.setProperty("--card-pct", `${appearance.cardOpacity}%`);
  syncAppearanceControls();
}

function syncAppearanceControls() {
  if (!$("bgUrl")) return;
  $("bgUrl").value = appearance.image || "";
  $("bgImgOpacity").value = appearance.imgOpacity;
  $("bgMaskOpacity").value = appearance.maskOpacity;
  $("cardOpacity").value = appearance.cardOpacity;
  $("valImg").textContent = `${appearance.imgOpacity}%`;
  $("valMask").textContent = `${appearance.maskOpacity}%`;
  $("valCard").textContent = `${appearance.cardOpacity}%`;
}

function resetAppearance() {
  appearance = normalizeAppearance(APPEARANCE_DEFAULT);
  applyAppearance();
  saveAppearance();
}

// 防止 url() 注入破坏 CSS
function cssUrl(s) { return String(s).replace(/["\\)]/g, encodeURIComponent); }

/* ---------------- 卡片列数 ---------------- */
function readCardColumnPrefs() {
  try {
    const saved = JSON.parse(localStorage.getItem(CARD_COLUMNS_KEY) || "{}");
    return {
      desktop: validColumnValue(saved.desktop, false),
      mobile: validColumnValue(saved.mobile, true),
    };
  } catch {
    return { desktop: "auto", mobile: "auto" };
  }
}

function validColumnValue(value, mobile) {
  if (value === "auto") return "auto";
  const allowed = mobile ? ["1", "2", "3"] : ["3", "4", "5"];
  return allowed.includes(String(value)) ? String(value) : "auto";
}

function isMobileColumns() {
  return window.matchMedia("(max-width: 640px)").matches;
}

function currentColumnMode() {
  return isMobileColumns() ? "mobile" : "desktop";
}

function columnZoneWidth(value, mode) {
  if (mode === "mobile") return "100%";
  return DESKTOP_COLUMN_WIDTHS[value] || DESKTOP_COLUMN_WIDTHS.auto;
}

function setCardColumns(value) {
  const mode = currentColumnMode();
  cardColumnPrefs = {
    ...cardColumnPrefs,
    [mode]: validColumnValue(value, mode === "mobile"),
  };
  localStorage.setItem(CARD_COLUMNS_KEY, JSON.stringify(cardColumnPrefs));
  applyCardColumns();
}

function applyCardColumns() {
  const grid = $("cardGrid");
  if (!grid) return;
  const mode = currentColumnMode();
  const value = validColumnValue(cardColumnPrefs[mode], mode === "mobile");
  const zone = $("cardListZone");
  if (zone) zone.style.setProperty("--card-zone-width", columnZoneWidth(value, mode));
  if (value === "auto") {
    grid.removeAttribute("data-columns");
    grid.style.removeProperty("--card-columns");
  } else {
    grid.dataset.columns = value;
    grid.style.setProperty("--card-columns", value);
  }
  document.querySelectorAll("[data-cols]").forEach((button) => {
    button.classList.toggle("active", button.dataset.cols === value);
  });
}

/* ---------------- 主题 ---------------- */
function toggleTheme() {
  const current = document.documentElement.dataset.theme === "dark" ? "dark" : "light";
  applyTheme(current === "dark" ? "light" : "dark");
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem("cfah_theme", theme);
  const button = $("themeToggle");
  if (!button) return;
  const dark = theme === "dark";
  button.textContent = dark ? "☀" : "☾";
  button.title = dark ? "切换为日间" : "切换为夜间";
  button.setAttribute("aria-label", button.title);
}

/* ---------------- 登录 / 退出 ---------------- */
function openLogin() {
  $("loginError").classList.add("hidden");
  $("loginInput").value = "";
  $("loginModal").classList.remove("hidden");
  setTimeout(() => $("loginInput").focus(), 50);
}
function closeLogin() { $("loginModal").classList.add("hidden"); }

async function doLogin() {
  const pw = $("loginInput").value.trim();
  if (!pw) return;
  try {
    await tryToken(pw);
    closeLogin();
  } catch (e) {
    state.token = "";
    const msg = /unauthorized|401/i.test(e.message) ? "口令错误，请重试。" : e.message;
    const box = $("loginError"); box.textContent = msg; box.classList.remove("hidden");
  }
}

// 用候选口令拉一次受保护接口验证；成功即进入后台
async function tryToken(token) {
  state.token = token;
  const data = await api("/api/assets/overview");
  sessionStorage.setItem("cfah_admin_token", token);
  state.authed = true;
  state.overview = data.overview || {};
  state.summaries = data.profileSummaries || [];
  await loadCloudAppearance().catch(() => {});
  enterAdmin();
}

function logout() {
  state.token = "";
  state.authed = false;
  sessionStorage.removeItem("cfah_admin_token");
  enterPublic();
}

function enterPublic() {
  state.authed = false;
  document.body.dataset.auth = "public";
  hideNotice();
  go("home");
}
function enterAdmin() {
  document.body.dataset.auth = "admin";
  hideNotice();
  go("home");
}

/* ---------------- 视图切换 ---------------- */
function go(view) {
  if (!state.authed && view !== "home") { openLogin(); return; }
  state.view = view;
  document.querySelectorAll(".view").forEach((v) => v.classList.toggle("active", v.id === `view-${view}`));
  document.querySelectorAll(".navlink").forEach((n) => n.classList.toggle("active", n.dataset.nav === view));
  window.scrollTo({ top: 0, behavior: "smooth" });

  if (view === "home") { (state.authed ? loadHome() : loadPublic()).catch(showError); return; }
  if (view === "sync") loadSync().catch(showError);
  if (view === "issues") loadIssues().catch(showError);
  if (view === "manage") loadManage().catch(showError);
  if (view === "appearance") syncAppearanceControls();
}

function refresh() {
  if (state.view === "detail" && state.detailProfile) return openDetail(state.detailProfile.id);
  go(state.view);
  return Promise.resolve();
}

/* ---------------- 请求 ---------------- */
async function api(path, options = {}) {
  if (!state.token) throw new Error("需要登录。");
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

async function publicGet(path) {
  const res = await fetch(path);
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(payload.error || res.statusText);
  return payload.data ?? payload;
}

/* ---------------- 前台（公开） ---------------- */
async function loadPublic() {
  const data = await publicGet("/api/public/overview");
  state.overview = data.overview || {};
  renderStats();
  renderPublicCards(data.accounts || []);
}

function renderPublicCards(accounts) {
  $("cardCount").textContent = String(accounts.length);
  if (!accounts.length) { $("cardGrid").innerHTML = empty("暂无账号数据。"); applyCardColumns(); return; }
  $("cardGrid").innerHTML = accounts.map((a, i) => `
    <div class="card locked" style="--i:${i}">
      <div class="card-top">
        <div style="min-width:0">
          <div class="card-title">
            <span class="sdot ${a.enabled ? "ok" : "disabled"}"></span>
            <span class="card-name masked">${esc(a.maskedName)}</span>
          </div>
          <div class="card-acc">🔒 明细需登录</div>
        </div>
        ${a.hasIssues ? `<span class="tag warn">有异常</span>` : `<span class="tag ok">正常</span>`}
      </div>
      <div class="card-metrics">
        <div class="metric"><div class="metric-val">${num(a.domainTotal)}</div><div class="metric-lbl">域名</div></div>
        <div class="metric"><div class="metric-val">${num(a.workers)}</div><div class="metric-lbl">Workers</div></div>
        <div class="metric"><div class="metric-val">${num(a.pagesProjects)}</div><div class="metric-lbl">Pages</div></div>
      </div>
      <div class="card-mini">
        <span class="mini">R2 / D1 / KV 已纳入统计</span>
        <span class="mini">资产合计 <b>${num(a.totalAssets)}</b></span>
      </div>
    </div>`).join("");
  applyCardColumns();
}

/* ---------------- 后台总览 ---------------- */
async function loadHome() {
  const data = await api("/api/assets/overview");
  state.overview = data.overview || {};
  state.summaries = data.profileSummaries || [];
  renderStats();
  renderCards();
}

function renderStats() {
  const o = state.overview;
  const totalAssets = ["zones", "workers", "pagesProjects",
    "pagesDomains", "r2Buckets", "d1Databases", "kvNamespaces"]
    .reduce((s, k) => s + Number(o[k] || 0), 0);
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
    !q || p.name.toLowerCase().includes(q) || p.accountId.toLowerCase().includes(q) || (p.note || "").toLowerCase().includes(q));
  $("cardCount").textContent = String(list.length);
  if (!list.length) {
    $("cardGrid").innerHTML = empty(state.summaries.length ? "没有匹配的账号。" : "还没有账号，去「账号管理」添加一个。");
    applyCardColumns();
    return;
  }
  $("cardGrid").innerHTML = list.map((p, i) => cardHtml(p, i)).join("");
  applyCardColumns();
  document.querySelectorAll("[data-card]").forEach((el) => {
    el.addEventListener("click", () => openDetail(el.dataset.card).catch(showError));
    el.addEventListener("keydown", (e) => { if (e.key === "Enter") openDetail(el.dataset.card).catch(showError); });
  });
}

function cardHtml(p, i = 0) {
  const c = p.counts;
  const st = p.enabled ? (p.latestSyncStatus || p.status || "unknown") : "disabled";
  return `
    <div class="card" data-card="${esc(p.id)}" role="button" tabindex="0" style="--i:${i}">
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
  $("detailKpis").innerHTML = ""; $("assetTabs").innerHTML = ""; $("assetTable").innerHTML = "";

  state.detail = await api(`/api/assets/profiles/${profileId}`);
  if (!state.detailProfile) {
    try { const d = await api("/api/assets/overview"); state.summaries = d.profileSummaries || []; } catch {}
    state.detailProfile = state.summaries.find((p) => p.id === profileId) || null;
  }
  renderDetail();
}

function renderDetail() {
  const p = state.detailProfile, d = state.detail;
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
    [p.domainTotal, "域名"], [c.workers, "Workers"],
    [c.pagesProjects, "Pages"], [c.r2Buckets, "R2"], [c.d1Databases, "D1"], [c.kvNamespaces, "KV"],
  ];
  $("detailKpis").innerHTML = kpis.map(([v, l]) => `<div class="kpi"><div class="kpi-val">${num(v)}</div><div class="kpi-lbl">${l}</div></div>`).join("");

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
  document.querySelectorAll("[data-tab]").forEach((b) => b.addEventListener("click", () => { state.assetTab = b.dataset.tab; renderAssetTabs(); }));
  const rows = state.detail[state.assetTab] || [];
  $("assetTable").innerHTML = state.assetTab === "permissionChecks" ? permissionTable(rows) : table(rows);
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
  if (!jobs.length) $("syncJobs").innerHTML = empty("还没有同步任务。");
  else $("syncJobs").innerHTML = tableWrap(jobs, [
    ["状态", (r) => html(statusBadge(r.status))],
    ["范围", (r) => r.scope],
    ["账号", (r) => profileName(r.profile_id)],
    ["错误", (r) => String(r.total_errors || 0)],
    ["开始", (r) => relTime(r.started_at)],
    ["", (r) => html(`<button class="btn xs" data-job="${esc(r.id)}" type="button">错误</button>`)],
  ]);
  document.querySelectorAll("[data-job]").forEach((b) => b.addEventListener("click", (e) => { e.stopPropagation(); loadJobErrors(b.dataset.job).catch(showError); }));
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
let manageProfiles = [];
async function loadManage() {
  const profiles = await api("/api/profiles");
  manageProfiles = profiles;
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
        <button class="btn xs" data-m-edit="${esc(p.id)}" type="button">编辑</button>
        <button class="btn xs" data-m-test="${esc(p.id)}" type="button">测试</button>
        <button class="btn xs" data-m-sync="${esc(p.id)}" type="button">同步</button>
        <button class="btn xs" data-m-toggle="${esc(p.id)}" data-en="${p.enabled ? 1 : 0}" type="button">${p.enabled ? "停用" : "启用"}</button>
        <button class="btn xs danger" data-m-del="${esc(p.id)}" type="button">删除</button>
      </div>
    </div>`).join("");
  document.querySelectorAll("[data-m-view]").forEach((b) => b.addEventListener("click", () => openDetail(b.dataset.mView).catch(showError)));
  document.querySelectorAll("[data-m-edit]").forEach((b) => b.addEventListener("click", () => openEdit(b.dataset.mEdit)));
  document.querySelectorAll("[data-m-test]").forEach((b) => b.addEventListener("click", () => testProfile(b.dataset.mTest).catch(showError)));
  document.querySelectorAll("[data-m-sync]").forEach((b) => b.addEventListener("click", () => syncProfile(b.dataset.mSync).catch(showError)));
  document.querySelectorAll("[data-m-toggle]").forEach((b) => b.addEventListener("click", async () => {
    await api(`/api/profiles/${b.dataset.mToggle}`, { method: "PATCH", body: JSON.stringify({ enabled: b.dataset.en !== "1" }) });
    loadManage().catch(showError);
  }));
  document.querySelectorAll("[data-m-del]").forEach((b) => b.addEventListener("click", () => deleteProfile(b.dataset.mDel).catch(showError)));
}

function openEdit(id) {
  const p = manageProfiles.find((x) => x.id === id);
  if (!p) return;
  state.editId = id;
  $("editName").value = p.name || "";
  $("editAccountId").value = p.accountId || "";
  $("editEmail").value = p.emailHint || "";
  $("editNote").value = p.note || "";
  $("editToken").value = "";
  $("editError").classList.add("hidden");
  $("editModal").classList.remove("hidden");
  setTimeout(() => $("editName").focus(), 50);
}
function closeEdit() { $("editModal").classList.add("hidden"); state.editId = null; }

async function saveEdit() {
  if (!state.editId) return;
  const body = {
    name: $("editName").value.trim(),
    accountId: $("editAccountId").value.trim(),
    emailHint: $("editEmail").value.trim() || null,
    note: $("editNote").value.trim() || null,
  };
  const token = $("editToken").value.trim();
  if (token) body.apiToken = token;
  try {
    await api(`/api/profiles/${state.editId}`, { method: "PATCH", body: JSON.stringify(body) });
    closeEdit();
    showNotice(`账号「${body.name}」已更新。`);
    loadManage().catch(showError);
  } catch (e) {
    const box = $("editError"); box.textContent = e.message; box.classList.remove("hidden");
  }
}

async function deleteProfile(id) {
  const p = manageProfiles.find((x) => x.id === id);
  const name = p ? p.name : id;
  if (!confirm(`确认删除账号「${name}」？\n该账号同步到的所有资产数据也会一并清除，此操作不可恢复。`)) return;
  await api(`/api/profiles/${id}`, { method: "DELETE" });
  showNotice(`账号「${name}」已删除。`);
  loadManage().catch(showError);
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
    humanize(k), (row) => /_at$/.test(k) ? relTime(row[k]) : (row[k] ?? "—"),
  ]);
  return tableWrap(rows, cols);
}

function permissionTable(rows) {
  if (!rows || !rows.length) return empty("暂无权限检测数据。");
  return tableWrap(rows, [
    ["检查项", (r) => r.check_key],
    ["状态", (r) => html(statusBadge(r.status))],
    ["HTTP", (r) => r.http_status || "—"],
    ["错误码", (r) => r.error_code || "—"],
    ["说明", (r) => r.message || permissionHint(r)],
    ["检测时间", (r) => relTime(r.checked_at)],
  ]);
}

function permissionHint(row) {
  if (row.status === "permission_denied") return "Token 缺少对应权限或权限层级不匹配";
  if (row.status === "network_error") return "请求或返回解析失败";
  if (row.check_key === "r2.buckets.list" && row.status === "empty_resource") return "R2 未开通或暂无 bucket，不影响其他资产同步";
  if (row.status === "empty_resource") return "接口可访问，但没有找到资源";
  return "—";
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
  const min = Math.floor((Date.now() - d.getTime()) / 60000);
  if (min < 1) return "刚刚";
  if (min < 60) return `${min} 分钟前`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} 小时前`;
  const day = Math.floor(h / 24);
  if (day < 30) return `${day} 天前`;
  return d.toLocaleDateString();
}

function humanize(k) { return k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()); }
function esc(v) { return String(v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

function showNotice(msg) { const n = $("notice"); n.textContent = msg; n.classList.remove("hidden"); }
function hideNotice() { $("notice").classList.add("hidden"); }
function showError(err) { showNotice(err?.message || String(err)); }
