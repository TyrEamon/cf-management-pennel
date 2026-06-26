PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS profiles (
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

CREATE INDEX IF NOT EXISTS idx_profiles_account_id ON profiles(account_id);
CREATE INDEX IF NOT EXISTS idx_profiles_enabled ON profiles(enabled);

CREATE TABLE IF NOT EXISTS profile_permission_checks (
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

CREATE INDEX IF NOT EXISTS idx_permission_checks_profile_id ON profile_permission_checks(profile_id);
CREATE INDEX IF NOT EXISTS idx_permission_checks_key ON profile_permission_checks(check_key);

CREATE TABLE IF NOT EXISTS sync_jobs (
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

CREATE INDEX IF NOT EXISTS idx_sync_jobs_profile_id ON sync_jobs(profile_id);
CREATE INDEX IF NOT EXISTS idx_sync_jobs_started_at ON sync_jobs(started_at);

CREATE TABLE IF NOT EXISTS sync_errors (
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

CREATE INDEX IF NOT EXISTS idx_sync_errors_job_id ON sync_errors(sync_job_id);
CREATE INDEX IF NOT EXISTS idx_sync_errors_profile_id ON sync_errors(profile_id);

CREATE TABLE IF NOT EXISTS cf_accounts (
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

CREATE TABLE IF NOT EXISTS zones (
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

CREATE INDEX IF NOT EXISTS idx_zones_profile_id ON zones(profile_id);
CREATE INDEX IF NOT EXISTS idx_zones_name ON zones(name);
CREATE INDEX IF NOT EXISTS idx_zones_account_id ON zones(account_id);

CREATE TABLE IF NOT EXISTS dns_records (
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

CREATE INDEX IF NOT EXISTS idx_dns_profile_id ON dns_records(profile_id);
CREATE INDEX IF NOT EXISTS idx_dns_zone_id ON dns_records(zone_id);
CREATE INDEX IF NOT EXISTS idx_dns_name ON dns_records(name);
CREATE INDEX IF NOT EXISTS idx_dns_content ON dns_records(content);

CREATE TABLE IF NOT EXISTS workers (
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

CREATE INDEX IF NOT EXISTS idx_workers_profile_id ON workers(profile_id);
CREATE INDEX IF NOT EXISTS idx_workers_name ON workers(name);

CREATE TABLE IF NOT EXISTS worker_routes (
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

CREATE INDEX IF NOT EXISTS idx_worker_routes_profile_id ON worker_routes(profile_id);
CREATE INDEX IF NOT EXISTS idx_worker_routes_pattern ON worker_routes(pattern);

CREATE TABLE IF NOT EXISTS pages_projects (
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

CREATE INDEX IF NOT EXISTS idx_pages_projects_profile_id ON pages_projects(profile_id);
CREATE INDEX IF NOT EXISTS idx_pages_projects_name ON pages_projects(name);

CREATE TABLE IF NOT EXISTS pages_domains (
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

CREATE INDEX IF NOT EXISTS idx_pages_domains_profile_id ON pages_domains(profile_id);
CREATE INDEX IF NOT EXISTS idx_pages_domains_domain_name ON pages_domains(domain_name);

CREATE TABLE IF NOT EXISTS r2_buckets (
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

CREATE INDEX IF NOT EXISTS idx_r2_buckets_profile_id ON r2_buckets(profile_id);
CREATE INDEX IF NOT EXISTS idx_r2_buckets_name ON r2_buckets(name);

CREATE TABLE IF NOT EXISTS d1_databases (
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

CREATE INDEX IF NOT EXISTS idx_d1_databases_profile_id ON d1_databases(profile_id);
CREATE INDEX IF NOT EXISTS idx_d1_databases_name ON d1_databases(name);

CREATE TABLE IF NOT EXISTS kv_namespaces (
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

CREATE INDEX IF NOT EXISTS idx_kv_namespaces_profile_id ON kv_namespaces(profile_id);
CREATE INDEX IF NOT EXISTS idx_kv_namespaces_title ON kv_namespaces(title);

CREATE TABLE IF NOT EXISTS asset_links (
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

CREATE INDEX IF NOT EXISTS idx_asset_links_profile_id ON asset_links(profile_id);
CREATE INDEX IF NOT EXISTS idx_asset_links_source ON asset_links(source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_asset_links_target ON asset_links(target_type, target_id);

CREATE TABLE IF NOT EXISTS search_index (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  title TEXT NOT NULL,
  subtitle TEXT,
  search_text TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (profile_id) REFERENCES profiles(id)
);

CREATE INDEX IF NOT EXISTS idx_search_index_profile_id ON search_index(profile_id);
CREATE INDEX IF NOT EXISTS idx_search_index_resource ON search_index(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_search_index_text ON search_index(search_text);

CREATE TABLE IF NOT EXISTS issues (
  id TEXT PRIMARY KEY,
  profile_id TEXT,
  issue_type TEXT NOT NULL,
  severity TEXT NOT NULL,
  resource_type TEXT,
  resource_id TEXT,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  raw_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (profile_id) REFERENCES profiles(id)
);

CREATE INDEX IF NOT EXISTS idx_issues_profile_id ON issues(profile_id);
CREATE INDEX IF NOT EXISTS idx_issues_status ON issues(status);
