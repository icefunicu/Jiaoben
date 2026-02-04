export const PROJECT_PREFIX = "ts";

export const STORAGE_KEYS = {
  settings: `${PROJECT_PREFIX}:settings`,
  onlineCache: `${PROJECT_PREFIX}:onlineCache`,
  tutorialSeen: `${PROJECT_PREFIX}:tutorialSeen`
};

export const MESSAGE_TYPES = {
  action: `${PROJECT_PREFIX}:action`,
  list: `${PROJECT_PREFIX}:list`,
  detail: `${PROJECT_PREFIX}:detail`,
  status: `${PROJECT_PREFIX}:status`,
  settings: `${PROJECT_PREFIX}:settings`,
  visibility: `${PROJECT_PREFIX}:visibility`,
  toggle: `${PROJECT_PREFIX}:toggle-sidebar`,
  onlineResolve: `${PROJECT_PREFIX}:online-resolve`,
  clearCache: `${PROJECT_PREFIX}:clear-online-cache`
};

export const CACHE_CONFIG = {
  TTL_MS: 7 * 24 * 60 * 60 * 1000, // 7 days
  VERSION: 'v1'
};

export const DEFAULT_SETTINGS = {
  schemaVersion: 1,
  language: "auto",
  includeCode: false,
  sidebarWidth: 380,
  theme: "auto",
  listLimit: 40,
  onlineEnabled: true
};
