export type SyncQueueMessage =
  | {
      type: "sync_profile";
      profileId: string;
      syncJobId: string;
    }
  | {
      type: "sync_all";
      syncJobId: string;
    };

export type ProfileStatus =
  | "unknown"
  | "ok"
  | "permission_error"
  | "token_invalid"
  | "sync_error"
  | "disabled";

export type ProfileRow = {
  id: string;
  name: string;
  account_id: string;
  email_hint: string | null;
  note: string | null;
  token_ciphertext: string;
  token_iv: string;
  token_auth_tag: string;
  token_hint: string | null;
  enabled: number;
  status: ProfileStatus;
  last_sync_at: string | null;
  created_at: string;
  updated_at: string;
};

export type PublicProfile = {
  id: string;
  name: string;
  accountId: string;
  emailHint: string | null;
  note: string | null;
  tokenHint: string | null;
  enabled: boolean;
  status: ProfileStatus;
  lastSyncAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type EncryptedToken = {
  ciphertext: string;
  iv: string;
  authTag: string;
  hint: string;
};

export type PermissionStatus =
  | "ok"
  | "empty_resource"
  | "permission_denied"
  | "token_invalid"
  | "account_mismatch"
  | "rate_limited"
  | "api_error"
  | "network_error";

export type PermissionCheckResult = {
  checkKey: string;
  status: PermissionStatus;
  httpStatus?: number;
  errorCode?: string;
  message?: string;
  rawJson?: unknown;
};

export type SearchResultRow = {
  id: string;
  profile_id: string;
  resource_type: string;
  resource_id: string;
  title: string;
  subtitle: string | null;
  updated_at: string;
};

