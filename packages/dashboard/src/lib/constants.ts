export const CACHE_TIMES = {
  TOKEN_MS: 30 * 1000,
  QUERY_STALE_MS: 5 * 60 * 1000,
  QUERY_GC_MS: 10 * 60 * 1000,
} as const;

export const PAGINATION = {
  DEFAULT_LIMIT: 50,
  MAX_LIMIT: 100,
} as const;
