import { STORAGE_KEYS, CACHE_CONFIG } from '../shared/constants.js';

// Prefix for individual cache keys to avoid collision
const CACHE_PREFIX = "ts:cache:";

export const buildCacheKey = (term, lang, source) => `${CACHE_PREFIX}${CACHE_CONFIG.VERSION}|${term}|${lang}|${source}`;

export const getCachedEntry = async (key) => {
  const result = await chrome.storage.local.get(key);
  const entry = result[key];
  if (!entry) return null;
  
  if (Date.now() - entry.ts > CACHE_CONFIG.TTL_MS) {
    // Lazy expiration
    await chrome.storage.local.remove(key);
    return null;
  }
  return entry.value;
};

export const setCachedEntry = async (key, value) => {
  // Store individually
  await chrome.storage.local.set({ 
      [key]: { ts: Date.now(), value } 
  });
};

export const clearOnlineCache = async () => {
  // Clear all keys starting with prefix
  const all = await chrome.storage.local.get(null);
  const keysToRemove = Object.keys(all).filter(k => k.startsWith(CACHE_PREFIX));
  if (keysToRemove.length > 0) {
      await chrome.storage.local.remove(keysToRemove);
  }
  
  // Also clear legacy large object if exists
  await chrome.storage.local.remove(STORAGE_KEYS.onlineCache);
};
