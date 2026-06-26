DELETE FROM search_index
WHERE resource_type IN ('dns_record', 'worker_route');

DELETE FROM asset_links
WHERE source_type IN ('dns_record', 'worker_route')
   OR target_type IN ('dns_record', 'worker_route');

DELETE FROM issues
WHERE resource_type IN ('dns_record', 'worker_route')
   OR issue_type IN ('route_missing_worker', 'cname_pages_project_missing')
   OR resource_id IN ('dns.list', 'workers.routes.list');

DELETE FROM profile_permission_checks
WHERE check_key IN ('dns.list', 'workers.routes.list');

DELETE FROM sync_errors
WHERE operation IN ('dns.list', 'workers.routes.list')
   OR resource_type IN ('dns_records', 'worker_routes');

DROP TABLE IF EXISTS dns_records;
DROP TABLE IF EXISTS worker_routes;
