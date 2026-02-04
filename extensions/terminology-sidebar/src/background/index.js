import { MESSAGE_TYPES } from '../shared/constants.js';
import { buildCacheKey, getCachedEntry, setCachedEntry, clearOnlineCache } from './cache.js';
import { enqueueRequest, requestWithRetry } from './network.js';
import { fetchWiktionary, fetchWikipedia } from './api.js';

const resolveOnline = async ({ term, lang, sources, force }) => {
  const results = [];
  for (const source of sources) {
    const cacheKey = buildCacheKey(term, lang, source);
    if (!force) {
      const cached = await getCachedEntry(cacheKey);
      if (cached) {
        results.push({
          ...cached.value,
          source,
          cached: true,
          cacheTime: cached.ts
        });
        continue;
      }
    }
    let fetched = null;
    try {
      fetched = await enqueueRequest(() => requestWithRetry(() => {
        if (source === "wiktionary") return fetchWiktionary(term, lang);
        if (source === "wikipedia") return fetchWikipedia(term, lang);
        return null;
      }));
    } catch (e) {
      console.error('Fetch error:', e);
      fetched = null;
    }
    if (fetched) {
      await setCachedEntry(cacheKey, fetched);
      results.push({
        ...fetched,
        source,
        cached: false,
        cacheTime: Date.now()
      });
    }
  }
  return results;
};

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const handle = async () => {
    if (message?.type === MESSAGE_TYPES.onlineResolve) {
      const term = message.term || "";
      const lang = message.lang || "en";
      const sources = Array.isArray(message.sources) ? message.sources : ["wiktionary", "wikipedia"];
      const force = Boolean(message.force);
      const results = await resolveOnline({ term, lang, sources, force });
      return { ok: true, results };
    }
    if (message?.type === MESSAGE_TYPES.clearCache) {
      await clearOnlineCache();
      return { ok: true };
    }
    return { ok: false };
  };

  handle()
    .then((result) => sendResponse(result))
    .catch((error) => sendResponse({ ok: false, error: error?.message || String(error) }));
  return true;
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command === "toggle-sidebar") {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const activeTab = tabs[0];
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
  }
});
