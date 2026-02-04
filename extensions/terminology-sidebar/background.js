// Built by tools/bundle.js
const PROJECT_PREFIX = "ts";const STORAGE_KEYS = {  settings: `${PROJECT_PREFIX}:settings`,  onlineCache: `${PROJECT_PREFIX}:onlineCache`,  tutorialSeen: `${PROJECT_PREFIX}:tutorialSeen`};const MESSAGE_TYPES = {  action: `${PROJECT_PREFIX}:action`,  list: `${PROJECT_PREFIX}:list`,  detail: `${PROJECT_PREFIX}:detail`,  status: `${PROJECT_PREFIX}:status`,  settings: `${PROJECT_PREFIX}:settings`,  visibility: `${PROJECT_PREFIX}:visibility`,  toggle: `${PROJECT_PREFIX}:toggle-sidebar`,  onlineResolve: `${PROJECT_PREFIX}:online-resolve`,  clearCache: `${PROJECT_PREFIX}:clear-online-cache`};const CACHE_CONFIG = {  TTL_MS: 7 * 24 * 60 * 60 * 1000, // 7 days  VERSION: 'v1'};const DEFAULT_SETTINGS = {  schemaVersion: 1,  language: "auto",  includeCode: false,  sidebarWidth: 380,  theme: "auto",  listLimit: 40,  onlineEnabled: true};// Prefix for individual cache keys to avoid collision
const CACHE_PREFIX = "ts:cache:";
const buildCacheKey = (term, lang, source) => `${CACHE_PREFIX}${CACHE_CONFIG.VERSION}|${term}|${lang}|${source}`;
const getCachedEntry = async (key) => {
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
const setCachedEntry = async (key, value) => {
  // Store individually
  await chrome.storage.local.set({ 
      [key]: { ts: Date.now(), value } 
  });
};
const clearOnlineCache = async () => {
  // Clear all keys starting with prefix
  const all = await chrome.storage.local.get(null);
  const keysToRemove = Object.keys(all).filter(k => k.startsWith(CACHE_PREFIX));
  if (keysToRemove.length > 0) {
      await chrome.storage.local.remove(keysToRemove);
  }
  // Also clear legacy large object if exists
  await chrome.storage.local.remove(STORAGE_KEYS.onlineCache);
};
const RATE_LIMIT_MS = 1000;
const FETCH_TIMEOUT_MS = 6000;
let queue = [];
let processing = false;
let lastRequestAt = 0;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const withTimeout = async (url, options = {}) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timer);
  }
};
const processQueue = async () => {
  if (processing) return;
  processing = true;
  while (queue.length > 0) {
    const now = Date.now();
    const waitMs = Math.max(0, RATE_LIMIT_MS - (now - lastRequestAt));
    if (waitMs > 0) await sleep(waitMs);
    const { task, resolve, reject } = queue.shift();
    try {
      lastRequestAt = Date.now();
      const result = await task();
      resolve(result);
    } catch (error) {
      reject(error);
    }
  }
  processing = false;
};
const enqueueRequest = (task) => {
  return new Promise((resolve, reject) => {
    queue.push({ task, resolve, reject });
    processQueue();
  });
};
const requestWithRetry = async (task) => {
  let attempt = 0;
  while (attempt < 2) {
    try {
      const result = await task();
      return result;
    } catch (error) {
      attempt += 1;
      if (attempt >= 2) throw error;
      await sleep(300);
    }
  }
  return null;
};
const normalizeText = (text) => {
  if (!text) return "";
  return String(text).replace(/\s+/g, " ").trim();
};
const extractSentence = (text) => {
  const normalized = normalizeText(text);
  if (!normalized) return "";
  const match = normalized.match(/(.{1,240}?)([。.!?]|$)/);
  return match ? match[1].trim() : normalized.slice(0, 240);
};
const extractExample = (text, lang) => {
  const normalized = normalizeText(text);
  if (!normalized) return "";
  const candidate = normalized.split(" ").slice(0, 30).join(" ");
  if (lang === "zh") {
    return candidate.slice(0, 40);
  }
  return candidate;
};
const fetchWiktionary = async (term, lang) => {
  const api = `https://${lang}.wiktionary.org/w/api.php?action=query&format=json&origin=*&prop=extracts&explaintext=1&exintro=1&titles=${encodeURIComponent(term)}`;
  const response = await withTimeout(api);
  if (!response.ok) return null;
  const data = await response.json();
  const pages = data?.query?.pages;
  const page = pages ? Object.values(pages)[0] : null;
  const extract = page?.extract || "";
  const definition = extractSentence(extract);
  if (!definition) return null;
  const example = extractExample(extract, lang);
  return {
    source: "wiktionary",
    definition,
    examples: example ? [example] : []
  };
};
const fetchWikipedia = async (term, lang) => {
  const api = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(term)}`;
  const response = await withTimeout(api, { headers: { "accept": "application/json" } });
  if (!response.ok) return null;
  const data = await response.json();
  const extract = data?.extract || "";
  const definition = extractSentence(extract);
  if (!definition) return null;
  return {
    source: "wikipedia",
    definition,
    examples: []
  };
};
const resolveOnline = async ({ term, lang, sources, force }) => {  const results = [];  for (const source of sources) {    const cacheKey = buildCacheKey(term, lang, source);    if (!force) {      const cached = await getCachedEntry(cacheKey);      if (cached) {        results.push({          ...cached.value,          source,          cached: true,          cacheTime: cached.ts        });        continue;      }    }    let fetched = null;    try {      fetched = await enqueueRequest(() => requestWithRetry(() => {        if (source === "wiktionary") return fetchWiktionary(term, lang);        if (source === "wikipedia") return fetchWikipedia(term, lang);        return null;      }));    } catch (e) {      console.error('Fetch error:', e);      fetched = null;    }    if (fetched) {      await setCachedEntry(cacheKey, fetched);      results.push({        ...fetched,        source,        cached: false,        cacheTime: Date.now()      });    }  }  return results;};chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {  const handle = async () => {    if (message?.type === MESSAGE_TYPES.onlineResolve) {      const term = message.term || "";      const lang = message.lang || "en";      const sources = Array.isArray(message.sources) ? message.sources : ["wiktionary", "wikipedia"];      const force = Boolean(message.force);      const results = await resolveOnline({ term, lang, sources, force });      return { ok: true, results };    }    if (message?.type === MESSAGE_TYPES.clearCache) {      await clearOnlineCache();      return { ok: true };    }    return { ok: false };  };  handle()    .then((result) => sendResponse(result))    .catch((error) => sendResponse({ ok: false, error: error?.message || String(error) }));  return true;});chrome.commands.onCommand.addListener(async (command) => {  if (command === "toggle-sidebar") {    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });    const activeTab = tabs[0];
    if (!activeTab?.id) return;
    const url = activeTab.url || "";
    if (!url || url.startsWith("chrome://") || url.startsWith("edge://") || url.startsWith("about:") || url.startsWith("chrome-extension://")) {
      return;
    }
    try {
      await chrome.tabs.sendMessage(activeTab.id, { type: MESSAGE_TYPES.toggle });
    } catch (error) {
      return;
    }
  }});