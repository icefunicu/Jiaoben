// Built by tools/bundle.js
(() => {
const PROJECT_PREFIX = "ts";const STORAGE_KEYS = {  settings: `${PROJECT_PREFIX}:settings`,  onlineCache: `${PROJECT_PREFIX}:onlineCache`,  tutorialSeen: `${PROJECT_PREFIX}:tutorialSeen`};const MESSAGE_TYPES = {  action: `${PROJECT_PREFIX}:action`,  list: `${PROJECT_PREFIX}:list`,  detail: `${PROJECT_PREFIX}:detail`,  status: `${PROJECT_PREFIX}:status`,  settings: `${PROJECT_PREFIX}:settings`,  visibility: `${PROJECT_PREFIX}:visibility`,  toggle: `${PROJECT_PREFIX}:toggle-sidebar`,  onlineResolve: `${PROJECT_PREFIX}:online-resolve`,  clearCache: `${PROJECT_PREFIX}:clear-online-cache`};const CACHE_CONFIG = {  TTL_MS: 7 * 24 * 60 * 60 * 1000, // 7 days  VERSION: 'v1'};const DEFAULT_SETTINGS = {  schemaVersion: 1,  language: "auto",  includeCode: false,  sidebarWidth: 380,  theme: "auto",  listLimit: 40,  onlineEnabled: true};class Store {
  constructor(initialState) {
    this.state = initialState;
    this.listeners = new Set();
  }
  getState() {
    return this.state;
  }
  setState(updater) {
    const nextPartial = typeof updater === 'function' ? updater(this.state) : updater;
    if (nextPartial === null || nextPartial === undefined) return;
    // Shallow merge
    const nextState = { ...this.state, ...nextPartial };
    // Check for changes (shallow comparison could be added here if needed)
    this.state = nextState;
    this.notify();
  }
  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  notify() {
    this.listeners.forEach(listener => listener(this.state));
  }
}
const initialState = {
  settings: { ...DEFAULT_SETTINGS },
  glossaryEn: [],
  glossaryZh: [],
  enPatterns: [], // Raw patterns for worker
  zhPatterns: [], // Raw patterns for worker
  glossaryLoaded: false,
  detailMap: null,
  detailPromise: null,
  detailLoadError: false,
  worker: null, // Web Worker instance
  matches: [],
  listItems: [],
  selectedTerm: null,
  highlights: [],
  sidebarOpen: false,
  searchQuery: "",
  onlineResults: {},
  port: null,
  scanToken: 0,
  cleanup: null
};
const store = new Store(initialState);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const getLanguage = (settings) => {
  if (settings.language === "auto") {
    const uiLang = chrome.i18n.getUILanguage();
    return uiLang.startsWith("zh") ? "zh" : "en";
  }
  return settings.language === "zh_CN" ? "zh" : "en";
};
const getScanModes = (settings) => {
  if (settings.language === "auto") return ["en", "zh"];
  return settings.language === "zh_CN" ? ["zh"] : ["en"];
};
// Worker is now initialized in scanner.js or index.js, but we need to pass data to it.
// We will store the patterns in the store, and let scanner init the worker.
const loadGlossary = async () => {
  const results = await Promise.allSettled([
    fetch(chrome.runtime.getURL("data/glossary_en_index.json")).then((r) => r.json()),
    fetch(chrome.runtime.getURL("data/glossary_zh_index.json")).then((r) => r.json())
  ]);
  const enIndex = results[0].status === 'fulfilled' ? results[0].value : { items: [] };
  if (results[0].status === 'rejected') {
    console.warn('Failed to load English glossary:', results[0].reason);
  }
  const zhIndex = results[1].status === 'fulfilled' ? results[1].value : { items: [] };
  if (results[1].status === 'rejected') {
    console.warn('Failed to load Chinese glossary:', results[1].reason);
  }
  store.setState({
    glossaryEn: enIndex.items || enIndex,
    glossaryZh: zhIndex.items || zhIndex
  });
  const state = store.getState();
  const enPatterns = [];
  // Create lightweight patterns for Worker (avoid sending full entry objects)
  state.glossaryEn.forEach((entry, index) => {
    // 0: pattern, 1: id (index), 2: term (for length check in worker if needed, or just pattern length)
    // Actually worker needs pattern string to build trie.
    // We pass: { p: pattern, i: index, t: term }
    // Minify property names to save slightly on serialization
    enPatterns.push({
      p: entry.term.toLowerCase(),
      i: index,
      l: entry.term.length 
    });
    (entry.aliases || []).forEach((alias) => {
      enPatterns.push({
        p: alias.toLowerCase(),
        i: index,
        l: alias.length
      });
    });
  });
  const zhPatterns = [];
  state.glossaryZh.forEach((entry, index) => {
    zhPatterns.push({
      p: entry.term,
      i: index,
      l: entry.term.length
    });
    (entry.aliases || []).forEach((alias) => {
      zhPatterns.push({
        p: alias,
        i: index,
        l: alias.length
      });
    });
  });
  store.setState({
    enPatterns,
    zhPatterns,
    glossaryLoaded: true
  });
};
const extractVisibleTextNodes = function* (options = {}) {
  const includeCode = Boolean(options.includeCode);
  const ignoredTags = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "INPUT", "TEXTAREA", "SELECT", "OPTION", "HEADER", "FOOTER", "NAV", "ASIDE", "MENU", "IFRAME", "OBJECT", "EMBED"]);
  if (!includeCode) {
    ignoredTags.add("CODE");
    ignoredTags.add("PRE");
  }
  // Heuristic: Prefer semantic content containers
  // If we find them, we prioritize them, but we might still need to scan others if they don't cover everything.
  // However, users usually only care about the main content.
  // Let's try to find a main content container first.
  let roots = [];
  const article = document.querySelector('article');
  const main = document.querySelector('main') || document.querySelector('[role="main"]');
  const contentId = document.getElementById('content') || document.getElementById('main-content');
  if (article) {
    roots.push(article);
  } else if (main) {
    roots.push(main);
  } else if (contentId) {
    roots.push(contentId);
  } else {
    // Fallback to body
    roots.push(document.body);
  }
  // Use a stack for iterative traversal to support pausing (Generator)
  // Process roots in reverse so the first one is popped first (though order doesn't strictly matter for gathering)
  const stack = [...roots];
  let steps = 0;
  const YIELD_THRESHOLD = 500; // Yield every N nodes checked to prevent blocking
  // Common class names to ignore (heuristic)
  const ignoredClassPattern = /\b(sidebar|menu|nav|navigation|footer|header|comment|ad|ads|banner|cookie|copyright)\b/i;
  while (stack.length > 0) {
    const node = stack.pop();
    steps++;
    // Yield control periodically
    if (steps % YIELD_THRESHOLD === 0) {
      yield null; 
    }
    if (node.nodeType === Node.ELEMENT_NODE) {
      const tagName = node.tagName;
      if (ignoredTags.has(tagName)) continue;
      // Class-based exclusion (only if not one of our chosen roots)
      // If we selected 'main' but it has class 'main-content', we shouldn't ignore it.
      // But if we are traversing children, we might hit nested ads.
      if (!roots.includes(node) && node.className && typeof node.className === 'string' && ignoredClassPattern.test(node.className)) {
         continue;
      }
      // Visibility Check
      if (node.checkVisibility) {
        if (!node.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) continue;
      } else {
        const style = window.getComputedStyle(node);
        if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") continue;
      }
      // Push children to stack (reverse order to maintain document order)
      const childNodes = node.childNodes;
      for (let i = childNodes.length - 1; i >= 0; i--) {
        stack.push(childNodes[i]);
      }
    } else if (node.nodeType === Node.TEXT_NODE) {
      if (node.nodeValue && node.nodeValue.trim().length > 0) {
         yield node;
      }
    }
  }
};
const isWordChar = (ch) => /[A-Za-z0-9_]/.test(ch);
// These functions are now moved to worker.js and should not be exported or used in main thread.
// Kept here only if needed for tests or non-worker fallback (which we removed).
// We only export rankMatches which is used by scanner.js (main thread)
const rankMatches = (matches, lang) => {
  const byNode = new Map();
  matches.forEach((match) => {
    const list = byNode.get(match.node) || [];
    list.push(match);
    byNode.set(match.node, list);
  });
  const ranked = [];
  for (const [node, list] of byNode.entries()) {
    const sorted = list.sort((a, b) => {
      if (a.start !== b.start) return a.start - b.start;
      return (b.end - b.start) - (a.end - a.start);
    });
    const selected = [];
    for (const candidate of sorted) {
      const last = selected[selected.length - 1];
      if (!last) {
        selected.push(candidate);
        continue;
      }
      if (candidate.start >= last.end) {
        selected.push(candidate);
      } else if (lang === "zh") {
        const lastLen = last.end - last.start;
        const candLen = candidate.end - candidate.start;
        if (candLen > lastLen) {
          selected[selected.length - 1] = candidate;
        }
      }
    }
    ranked.push(...selected);
  }
  return ranked;
};
const enforceEnglishBoundary = (match) => {
  const text = match.text;
  const before = match.start > 0 ? text[match.start - 1] : "";
  const after = match.end < text.length ? text[match.end] : "";
  if (before && isWordChar(before)) return false;
  if (after && isWordChar(after)) return false;
  return true;
};
// Worker Blob URL (injected by bundler, or we use a separate file if possible)
// Since we are using a simple bundler, we might need to fetch the worker code or inline it.
// For now, let's assume we can fetch 'worker.js' relative to extension root if we add it to manifest.
// OR, better, we inline the worker code here to avoid file access issues in content scripts.
// But our bundler doesn't support advanced inlining yet.
// Let's try to use `chrome.runtime.getURL('worker.js')` but Content Scripts can't spawn workers from extension files easily due to CORS/Permissions sometimes.
// Actually, Chrome Extensions V3 allows `new Worker(chrome.runtime.getURL('worker.js'))`.
// We need to add `worker.js` to `web_accessible_resources` in manifest.json? No, usually just having it in the extension is enough if we use it correctly.
// Let's assume we will add `worker.js` to the build output.
let workerInstance = null;
let workerInitPromise = null;
const initWorker = async () => {
  if (workerInstance) return workerInstance;
  if (workerInitPromise) return workerInitPromise;
  workerInitPromise = (async () => {
    // Create worker via Iframe Proxy to bypass CSP
    const iframe = document.createElement('iframe');
    iframe.src = chrome.runtime.getURL('worker_proxy.html');
    iframe.style.display = 'none';
    iframe.style.width = '0';
    iframe.style.height = '0';
    document.body.appendChild(iframe);
    await new Promise(resolve => iframe.onload = resolve);
    const proxy = {
      postMessage: (msg) => {
        iframe.contentWindow.postMessage(msg, '*');
      },
      terminate: () => {
        iframe.remove();
        workerInstance = null;
      }
    };
    // Setup global listener for the proxy
    window.addEventListener('message', (e) => {
      if (e.source === iframe.contentWindow && e.data && e.data.source === 'ts-worker-proxy') {
         const { type, payload } = e.data.data;
         if (type === 'INIT_COMPLETE') {
           store.setState({ workerReady: true });
         }
         if (type === 'SCAN_RESULT') {
           handleScanResult(payload);
         }
      }
    });
    workerInstance = proxy;
    // Send init data
    const { enPatterns, zhPatterns } = store.getState();
    workerInstance.postMessage({
      type: 'INIT',
      payload: { enPatterns, zhPatterns }
    });
    return workerInstance;
  })();
  return workerInitPromise;
};
// Map to store pending scans or chunks to resolve them back to nodes
// Since worker is async, we need to map chunk IDs back to DOM nodes.
const chunkMap = new Map(); // id -> { node, text }
const handleScanResult = (payload) => {
  const { id, matchesEn, matchesZh } = payload;
  const task = scanTasks.get(id);
  if (!task) return;
  task.results.en.push(...matchesEn);
  task.results.zh.push(...matchesZh);
  task.pendingChunks--;
  if (task.pendingChunks === 0 && !task.dispatching) {
    finalizeScan(task);
  }
};
const scanTasks = new Map(); // scanToken -> { results: {en:[], zh:[]}, pendingChunks: 0, dispatching: true }
const buildListItems = (ranked) => {
  const counts = new Map();
  const entries = new Map();
  const displayTerms = new Map();
  ranked.forEach((match) => {
    const key = match.entry.term.toLowerCase();
    counts.set(key, (counts.get(key) || 0) + 1);
    if (!entries.has(key)) {
      entries.set(key, match.entry);
      displayTerms.set(key, match.entry.term);
    }
  });
  const items = [];
  for (const [key, entry] of entries.entries()) {
    const term = displayTerms.get(key);
    items.push({
      term,
      count: counts.get(key) || 0,
      category: entry.category || "",
      source: "local",
      entry
    });
  }
  items.sort((a, b) => b.count - a.count || a.term.localeCompare(b.term));
  return items.slice(0, 2000);
};
const finalizeScan = (task) => {
  const { scanToken, results } = task;
  scanTasks.delete(scanToken);
  if (scanToken !== store.getState().scanToken) return;
  const state = store.getState();
  const scanModes = getScanModes(state.settings);
  // Hydrate matches with nodes (Worker returned chunkId and entryIndex)
  const hydrate = (matches, lang) => matches.map(m => {
    const chunk = chunkMap.get(m.chunkId);
    // Lookup entry from store using index
    const entry = lang === 'en' ? state.glossaryEn[m.i] : state.glossaryZh[m.i];
    return {
      term: entry ? entry.term : "Unknown", // Reconstruct term
      entry: entry,
      start: m.start,
      end: m.end,
      node: chunk?.node,
      text: chunk?.text
    };
  }).filter(m => m.node && m.node.isConnected && m.entry); // Ensure node is still valid and entry exists
  const matchesEn = hydrate(results.en, 'en');
  const matchesZh = hydrate(results.zh, 'zh');
  const rankedEn = scanModes.includes("en") ? rankMatches(matchesEn, "en") : [];
  const rankedZh = scanModes.includes("zh") ? rankMatches(matchesZh, "zh") : [];
  const ranked = [...rankedEn, ...rankedZh];
  const listItems = buildListItems(ranked);
  store.setState({
    matches: ranked,
    listItems
  });
  updateSidebarList();
  updateStatus(listItems.length ? "ready" : "empty");
  // Cleanup chunk map? 
  // We can't easily clean up chunkMap unless we know no other tasks need them.
  // But scanPage recreates chunks every time?
  // Ideally, we should clear chunkMap for this scanToken.
  // But chunk IDs should be unique per scan?
  // Let's just clear map every scan start or use a separate map per task.
  // Actually, nodes are objects, we can't send them to worker.
  // So we keep them in main thread.
};
const scanPage = async (options = {}) => {
  let state = store.getState();
  // Ensure worker is ready
  if (!workerInstance && state.glossaryLoaded) {
    await initWorker();
  }
  // If worker not ready or glossary not loaded, wait or return
  if (!state.glossaryLoaded) return;
  const nextToken = state.scanToken + 1;
  store.setState({ scanToken: nextToken });
  const token = nextToken;
  // Clear previous chunks to free memory
  chunkMap.clear();
  const includeCode = state.settings.includeCode;
  const scanModes = getScanModes(state.settings);
  // Use generator for time-sliced scanning
  const nodeGenerator = extractVisibleTextNodes({ includeCode });
  const batchSize = 200; // Increase batch size as worker handles processing
  let currentBatch = [];
  let chunksCount = 0;
  let batchIndex = 0;
  // Initialize task early with estimated count? 
  // We don't know total count yet. But we can update pendingChunks dynamically or just stream.
  // Let's use a streaming approach where we don't know the end initially.
  // Or we can just accumulate all and send? No, that defeats time slicing purpose if we wait for all.
  // We should send batches as we find them.
  scanTasks.set(token, {
    scanToken: token,
    results: { en: [], zh: [] },
    pendingChunks: 0,
    dispatching: true
  });
  const processBatch = async () => {
     if (currentBatch.length === 0) return;
     // Double check worker instance
     if (!workerInstance) {
         try {
             await initWorker();
         } catch (e) {
             console.error("Terminology Sidebar: Failed to re-initialize worker:", e);
             return;
         }
     }
     if (!workerInstance) {
         console.error("Terminology Sidebar: Worker instance is null.");
         return;
     }
     const chunksToSend = [...currentBatch];
     currentBatch = [];
     const task = scanTasks.get(token);
     if (task) {
        task.pendingChunks++;
     }
     workerInstance.postMessage({
      type: 'SCAN',
      payload: {
        id: token,
        chunks: chunksToSend,
        scanModes
      }
    });
  };
  let i = 0;
  for (const node of nodeGenerator) {
    if (token !== store.getState().scanToken) return;
    // node can be null if generator yields for time slicing
    if (!node) {
        await sleep(1); // Yield to main thread
        continue;
    }
    const id = `${token}_${chunksCount++}`;
    const text = node.nodeValue || "";
    chunkMap.set(id, { node, text });
    currentBatch.push({ id, text });
    if (currentBatch.length >= batchSize) {
        await processBatch();
    }
  }
  // Process remaining
  await processBatch();
  // If no chunks found at all
  if (chunksCount === 0) {
    updateStatus("empty");
    scanTasks.delete(token);
    // Explicitly notify that scan is done but empty, to reset UI state if needed
    // updateStatus handles UI text, but maybe we need a toast if it was a manual rescan?
    return;
  }
  // Mark task as fully dispatched?
  // We need to know when all batches are done.
  // The worker will reply for each batch.
  // We can add a "EOF" flag to the last batch or just track pendingChunks.
  // Since we increment pendingChunks before sending, and decrement on reply,
  // we just need to check if pendingChunks reaches 0 AFTER we finish the loop.
  // But wait, if the loop finishes before any reply comes back, pendingChunks > 0.
  // If replies come back fast, pendingChunks might hit 0 temporarily?
  // No, JS is single threaded. We are in an async function.
  // The replies (onmessage) are macro-tasks.
  // We are "awaiting" sleep(1) so we are yielding.
  // So replies COULD come back while we are in the loop.
  // So pendingChunks could hit 0 if we are slow.
  // We should set a flag "dispatching" = true.
  const task = scanTasks.get(token);
  if (task) {
      task.dispatching = false;
      // If by chance everything is already done (unlikely unless sleep was long)
      if (task.pendingChunks === 0) {
          finalizeScan(task);
      }
  }
};
 // Circular dependency?
// scanPage imports updateSidebarList from sidebar-manager.
// sidebar-manager imports scanPage for toggleSidebar.
// This circular dependency might be an issue with simple concatenation if not careful.
// With ES modules, it works. With my simple bundler...
// My simple bundler just concatenates. Functions are hoisted or defined before use?
// If I use function declarations, they are hoisted.
// But imports are removed and content concatenated.
// The order matters.
// sidebar-manager depends on scanPage? Yes.
// scanPage depends on sidebar-manager? Yes.
// Solution: Pass scanPage as a callback or dependency injection.
// Or put them in the same file/module scope.
// For now, I will keep setupShadowRoot in index.js to avoid circular deps in sidebar-manager.
const updateStatus = (status) => {
  const { port } = store.getState();
  if (!port) return;
  port.postMessage({ type: MESSAGE_TYPES.status, status });
};
const updateSidebarList = () => {
  const { port, searchQuery, listItems, settings } = store.getState();
  if (!port) return;
  const filtered = searchQuery
    ? listItems.filter((item) => item.term.toLowerCase().includes(searchQuery.toLowerCase()))
    : listItems;
  port.postMessage({
    type: MESSAGE_TYPES.list,
    items: filtered,
    total: listItems.length,
    language: getLanguage(settings),
    query: searchQuery
  });
};
const loadDetailMap = async () => {
  const state = store.getState();
  if (state.detailMap) return state.detailMap;
  if (state.detailPromise) return state.detailPromise;
  store.setState({ detailLoadError: false });
  const promise = fetch(chrome.runtime.getURL("data/glossary_detail.json"))
    .then((r) => r.json())
    .then((data) => {
      const detailMap = data.items || {};
      store.setState({ detailMap, detailLoadError: false });
      return detailMap;
    })
    .catch(() => {
      store.setState({ detailMap: {}, detailLoadError: true });
      return {};
    })
    .finally(() => {
      store.setState({ detailPromise: null });
    });
  store.setState({ detailPromise: promise });
  return promise;
};
const updateDetail = async (term) => {
  const { port, listItems, onlineResults, settings } = store.getState();
  if (!port) return;
  const item = listItems.find((entry) => entry.term === term);
  let entry = item?.entry || null;
  const online = onlineResults[term] || [];
  const count = item?.count || 0;
  const lang = getLanguage(settings);
  if (entry?.id) {
    port.postMessage({
      type: MESSAGE_TYPES.detail,
      term,
      entry,
      count,
      online,
      language: lang,
      detailStatus: "loading"
    });
  }
  if (entry?.id) {
    const detailMap = await loadDetailMap();
    if (detailMap[entry.id]) {
      entry = detailMap[entry.id];
    }
  }
  const { detailLoadError } = store.getState();
  let detailStatus = "ready";
  if (!entry) detailStatus = "empty";
  if (detailLoadError) detailStatus = "error";
  port.postMessage({
    type: MESSAGE_TYPES.detail,
    term,
    entry,
    count,
    online,
    language: lang,
    detailStatus
  });
};
const setSidebarWidth = (width) => {
  const panel = document.querySelector("#ts-shadow-root");
  if (panel) {
    panel.style.setProperty("--ts-sidebar-width", `${width || 380}px`);
  }
};
const updateTheme = () => {
  const panel = document.querySelector("#ts-shadow-root");
  if (!panel) return;
  panel.setAttribute("data-theme", store.getState().settings.theme);
};
const loadSettings = async () => {
  const stored = await chrome.storage.local.get([STORAGE_KEYS.settings, "tsSettings"]);
  const legacy = stored.tsSettings || {};
  const current = stored[STORAGE_KEYS.settings] || {};
  const merged = Object.keys(current).length ? current : legacy;
  const settings = { ...DEFAULT_SETTINGS, ...merged };
  store.setState({ settings });
  await chrome.storage.local.set({ [STORAGE_KEYS.settings]: settings });
  if (stored.tsSettings) {
    await chrome.storage.local.remove("tsSettings");
  }
};
const saveSettings = async (next) => {
  const current = store.getState().settings;
  const nextSettings = { ...current, ...next };
  store.setState({ settings: nextSettings });
  await chrome.storage.local.set({ [STORAGE_KEYS.settings]: nextSettings });
};
const applySettings = async () => {
  const { port, settings } = store.getState();
  if (!port) return;
  port.postMessage({ type: MESSAGE_TYPES.settings, settings });
  setSidebarWidth(settings.sidebarWidth);
  updateTheme();
  updateSidebarList();
};
const HIGHLIGHT_NAME = 'terminology-highlight';
// Check for CSS Custom Highlight API support
const supportsHighlightApi = typeof CSS !== 'undefined' && 'highlights' in CSS;
const clearHighlights = () => {
  if (supportsHighlightApi) {
    CSS.highlights.delete(HIGHLIGHT_NAME);
    store.setState({ selectedTerm: null });
    return;
  }
  // Fallback for older browsers
  const { highlights } = store.getState();
  highlights.forEach((mark) => {
    const parent = mark.parentNode;
    if (!parent) return;
    const textNode = document.createTextNode(mark.textContent || "");
    parent.replaceChild(textNode, mark);
    // Normalize to merge adjacent text nodes
    parent.normalize();
  });
  store.setState({ highlights: [], selectedTerm: null });
};
const applyHighlights = (term) => {
  clearHighlights();
  const { matches } = store.getState();
  // Case-insensitive match if we deduplicated by lowercase
  const matchesToHighlight = matches.filter((match) => match.entry.term.toLowerCase() === term.toLowerCase());
  if (supportsHighlightApi) {
    const ranges = matchesToHighlight.map(match => {
      const range = new Range();
      if (!match.node || !match.node.isConnected) return null;
      try {
        range.setStart(match.node, match.start);
        range.setEnd(match.node, match.end);
        return range;
      } catch (e) {
        // Node might have changed or index out of bounds
        return null;
      }
    }).filter(Boolean);
    if (ranges.length > 0) {
      const highlight = new Highlight(...ranges);
      CSS.highlights.set(HIGHLIGHT_NAME, highlight);
    }
    store.setState({ selectedTerm: term });
    // Add styles if not present (injected in sidebar.css or global style)
    // We assume sidebar.css or injected style handles ::highlight(terminology-highlight)
    return;
  }
  // Fallback Implementation
  const byNode = new Map();
  matchesToHighlight.forEach((match) => {
    const list = byNode.get(match.node) || [];
    list.push(match);
    byNode.set(match.node, list);
  });
  const newHighlights = [];
  for (const [node, list] of byNode.entries()) {
    // Sort reverse to avoid index shifting when splitting
    const sorted = list.sort((a, b) => b.start - a.start);
    let workingNode = node;
    for (const match of sorted) {
      if (!workingNode?.parentNode || !workingNode.isConnected) continue;
      const start = match.start;
      const end = match.end;
      const text = workingNode.nodeValue;
      if (!text || start < 0 || end > text.length) continue;
      try {
        const middle = workingNode.splitText(start);
        const after = middle.splitText(end - start);
        const mark = document.createElement("mark");
        mark.className = "ts-highlight-legacy";
        mark.textContent = middle.textContent || "";
        middle.parentNode.replaceChild(mark, middle);
        newHighlights.push(mark);
        // Update working node to the first part for next iteration (which is 'workingNode' already)
        // But since we sort reverse, the next match is earlier in the string, 
        // so it will be in 'workingNode' (the left part).
      } catch (e) {
        console.error("Highlight error:", e);
      }
    }
  }
  store.setState({ highlights: newHighlights, selectedTerm: term });
};
const scrollToTerm = (term) => {
  const { matches } = store.getState();
  // Find first match for this term (case-insensitive)
  const match = matches.find(m => m.entry.term.toLowerCase() === term.toLowerCase());
  if (match && match.node) {
      const element = match.node.parentElement;
      if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
  }
};
// Import resources directly (will be inlined by bundler)
const sidebarHtml = "<div class=\"ts-container\">\n  <div class=\"ts-resize-handle\" title=\"Drag to resize\"></div>\n  <button class=\"ts-float-toggle\" aria-label=\"Toggle\">T</button>\n  <aside class=\"ts-sidebar\">\n    <header class=\"ts-header\">\n      <div class=\"ts-title\" data-i18n=\"title\"></div>\n      <div class=\"ts-controls\">\n        <select class=\"ts-language\">\n          <option value=\"auto\" data-i18n=\"languageAuto\"></option>\n          <option value=\"en\" data-i18n=\"languageEn\"></option>\n          <option value=\"zh_CN\" data-i18n=\"languageZh\"></option>\n        </select>\n        <button class=\"ts-btn ts-rescan\" data-i18n=\"rescan\"></button>\n        <button class=\"ts-btn ts-settings\" data-i18n=\"settings\"></button>\n      </div>\n      <div class=\"ts-search-row\">\n        <input class=\"ts-search\" type=\"search\" data-i18n-placeholder=\"searchPlaceholder\" />\n        <button class=\"ts-btn ts-clear-search\" data-i18n=\"clearSearch\"></button>\n      </div>\n      <div class=\"ts-summary\"></div>\n    </header>\n    <section class=\"ts-list\"></section>\n    <div class=\"ts-empty\"></div>\n    <section class=\"ts-detail-drawer\" aria-hidden=\"true\">\n      <div class=\"ts-detail-backdrop\" data-action=\"close\"></div>\n      <div class=\"ts-detail-panel\" role=\"dialog\" aria-modal=\"true\">\n        <header class=\"ts-detail-top\">\n          <div class=\"ts-detail-title\">\n            <div class=\"ts-detail-title-zh\"></div>\n            <div class=\"ts-detail-title-en\"></div>\n          </div>\n          <div class=\"ts-detail-top-actions\">\n            <button class=\"ts-btn ts-detail-copy\" data-i18n=\"detailCopyFull\" data-i18n-aria=\"detailCopyFull\" aria-label=\"\"></button>\n            <button class=\"ts-btn ts-detail-close\" data-i18n=\"detailClose\" data-i18n-aria=\"detailClose\" aria-label=\"\"></button>\n          </div>\n        </header>\n        <div class=\"ts-detail-meta\"></div>\n        <div class=\"ts-detail-body\">\n          <div class=\"ts-detail-state ts-detail-loading\">\n            <div class=\"ts-skeleton ts-skeleton-text\" style=\"width: 70%;\"></div>\n            <div class=\"ts-skeleton ts-skeleton-text\" style=\"width: 90%;\"></div>\n            <div class=\"ts-skeleton ts-skeleton-text\" style=\"width: 85%;\"></div>\n          </div>\n          <div class=\"ts-detail-state ts-detail-empty\" data-i18n=\"detailEmpty\"></div>\n          <div class=\"ts-detail-state ts-detail-error\" data-i18n=\"detailError\"></div>\n          <div class=\"ts-detail-content\">\n            <section class=\"ts-detail-section\">\n              <div class=\"ts-detail-section-title\" data-i18n=\"detailDefinition\"></div>\n              <div class=\"ts-detail-definition\"></div>\n            </section>\n            <section class=\"ts-detail-section\">\n              <div class=\"ts-detail-section-title\" data-i18n=\"detailExplanation\"></div>\n              <div class=\"ts-detail-explanation\"></div>\n            </section>\n            <section class=\"ts-detail-section\">\n              <div class=\"ts-detail-section-title\" data-i18n=\"detailScenarios\"></div>\n              <div class=\"ts-detail-scenarios\">\n                <div class=\"ts-detail-scenario\">\n                  <div class=\"ts-detail-scenario-title\" data-i18n=\"detailUse\"></div>\n                  <ul class=\"ts-detail-use-list\"></ul>\n                </div>\n                <div class=\"ts-detail-scenario\">\n                  <div class=\"ts-detail-scenario-title\" data-i18n=\"detailAvoid\"></div>\n                  <ul class=\"ts-detail-avoid-list\"></ul>\n                </div>\n              </div>\n            </section>\n            <section class=\"ts-detail-section\">\n              <div class=\"ts-detail-section-title\" data-i18n=\"detailExamples\"></div>\n              <div class=\"ts-detail-examples\"></div>\n            </section>\n            <section class=\"ts-detail-section\">\n              <div class=\"ts-detail-section-title\" data-i18n=\"detailPitfalls\"></div>\n              <ul class=\"ts-detail-pitfalls\"></ul>\n            </section>\n            <section class=\"ts-detail-section\">\n              <div class=\"ts-detail-section-title\" data-i18n=\"detailRelated\"></div>\n              <div class=\"ts-detail-related\"></div>\n            </section>\n            <section class=\"ts-detail-section\">\n              <div class=\"ts-detail-section-title\" data-i18n=\"detailSources\"></div>\n              <div class=\"ts-detail-sources\"></div>\n            </section>\n          </div>\n        </div>\n        <div class=\"ts-detail-actions\">\n          <button class=\"ts-btn ts-highlight\" data-i18n=\"highlight\"></button>\n          <button class=\"ts-btn ts-online\" data-i18n=\"onlineResolve\"></button>\n          <button class=\"ts-btn ts-online-refresh\" data-i18n=\"onlineRefresh\"></button>\n        </div>\n      </div>\n    </section>\n    <section class=\"ts-settings-panel\">\n      <div class=\"ts-settings-title\" data-i18n=\"settingsTitle\"></div>\n      <label class=\"ts-setting\">\n        <span data-i18n=\"listLimit\"></span>\n        <select class=\"ts-setting-limit\">\n          <option value=\"20\">20</option>\n          <option value=\"30\">30</option>\n          <option value=\"40\">40</option>\n        </select>\n      </label>\n      <label class=\"ts-setting\">\n        <span data-i18n=\"theme\"></span>\n        <select class=\"ts-setting-theme\">\n          <option value=\"auto\" data-i18n=\"themeAuto\"></option>\n          <option value=\"light\" data-i18n=\"themeLight\"></option>\n          <option value=\"dark\" data-i18n=\"themeDark\"></option>\n        </select>\n      </label>\n      <label class=\"ts-setting\">\n        <input class=\"ts-setting-include-code\" type=\"checkbox\" />\n        <span data-i18n=\"includeCode\"></span>\n      </label>\n      <label class=\"ts-setting\">\n        <input class=\"ts-setting-online\" type=\"checkbox\" />\n        <span data-i18n=\"onlineEnable\"></span>\n      </label>\n      <button class=\"ts-btn ts-clear-cache\" data-i18n=\"clearCache\"></button>\n      <div class=\"ts-about\" data-i18n=\"cedictAbout\"></div>\n    </section>\n    <footer class=\"ts-footer\">\n      <div class=\"ts-status\"></div>\n    </footer>\n    <div class=\"ts-toast\"></div>\n    <div class=\"ts-tutorial\" aria-hidden=\"true\">\n      <div class=\"ts-tutorial-backdrop\"></div>\n      <div class=\"ts-tutorial-card\" role=\"dialog\" aria-modal=\"true\">\n        <div class=\"ts-tutorial-header\">\n          <div class=\"ts-tutorial-icon\" aria-hidden=\"true\">\n            <svg viewBox=\"0 0 24 24\" width=\"24\" height=\"24\" fill=\"none\">\n              <circle cx=\"12\" cy=\"12\" r=\"10\" stroke=\"currentColor\" stroke-width=\"1.5\"></circle>\n              <path d=\"M12 7.2a1.2 1.2 0 1 0 0 2.4a1.2 1.2 0 0 0 0-2.4Z\" fill=\"currentColor\"></path>\n              <path d=\"M11 11.2h2V16h-2z\" fill=\"currentColor\"></path>\n            </svg>\n          </div>\n          <div class=\"ts-tutorial-title\" data-i18n=\"tutorialTitle\"></div>\n        </div>\n        <div class=\"ts-tutorial-body\">\n          <div class=\"ts-tutorial-item\" data-i18n=\"tutorialStep1\"></div>\n          <div class=\"ts-tutorial-item\" data-i18n=\"tutorialStep2\"></div>\n          <div class=\"ts-tutorial-item\" data-i18n=\"tutorialStep3\"></div>\n        </div>\n        <button class=\"ts-btn ts-tutorial-close\" data-i18n=\"tutorialStart\"></button>\n      </div>\n    </div>\n  </aside>\n</div>\n";
const sidebarCss = ":host {\n  --ts-bg: #ffffff;\n  --ts-text: #111827;\n  --ts-muted: #6b7280;\n  --ts-border: #e5e7eb;\n  --ts-accent: #2563eb;\n  --ts-accent-hover: #1d4ed8;\n  --ts-surface: #f9fafb;\n  --ts-sidebar-width: 380px;\n  --ts-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);\n  font-family: system-ui, -apple-system, \"Segoe UI\", sans-serif;\n}\n\n:host([data-theme=\"dark\"]) {\n  --ts-bg: #0f172a;\n  --ts-text: #e2e8f0;\n  --ts-muted: #94a3b8;\n  --ts-border: #1f2937;\n  --ts-accent: #60a5fa;\n  --ts-accent-hover: #3b82f6;\n  --ts-surface: #1e293b;\n  --ts-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.3), 0 2px 4px -1px rgba(0, 0, 0, 0.18);\n}\n\n:host([data-theme=\"auto\"]) {\n  color-scheme: light dark;\n}\n\n@media (prefers-color-scheme: dark) {\n  :host([data-theme=\"auto\"]) {\n    --ts-bg: #0f172a;\n    --ts-text: #e2e8f0;\n    --ts-muted: #94a3b8;\n    --ts-border: #1f2937;\n    --ts-accent: #60a5fa;\n    --ts-accent-hover: #3b82f6;\n    --ts-surface: #1e293b;\n    --ts-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.3), 0 2px 4px -1px rgba(0, 0, 0, 0.18);\n  }\n}\n\n.ts-container {\n  position: fixed;\n  right: 0;\n  bottom: 0;\n  z-index: 2147483646;\n  pointer-events: none;\n}\n\n.ts-resize-handle {\n  position: absolute;\n  left: 0;\n  top: 0;\n  bottom: 0;\n  width: 14px;\n  cursor: ew-resize;\n  z-index: 2147483647;\n  background: transparent;\n  transition: background 0.2s;\n  pointer-events: auto;\n  transform: translateX(-50%);\n}\n\n.ts-resize-handle:hover {\n  background: rgba(0, 0, 0, 0.05);\n}\n\n:host([data-theme=\"dark\"]) .ts-resize-handle:hover {\n  background: rgba(255, 255, 255, 0.1);\n}\n\n\n.ts-float-toggle {\n  \n  position: fixed;\n  right: 20px;\n  bottom: 20px;\n  width: 44px;\n  height: 44px;\n  border-radius: 22px;\n  border: 1px solid var(--ts-border);\n  background: var(--ts-accent);\n  color: #fff;\n  font-weight: 700;\n  cursor: pointer;\n  pointer-events: auto;\n  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.18);\n  transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.3s ease, background-color 0.2s;\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  will-change: transform;\n}\n\n.ts-float-toggle:hover {\n  transform: scale(1.1);\n  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);\n  background: var(--ts-accent-hover);\n}\n\n.ts-float-toggle:active {\n  transform: scale(0.95);\n}\n\n\n.ts-sidebar {\n  position: fixed;\n  right: 0;\n  top: 0;\n  height: 100vh;\n  width: var(--ts-sidebar-width);\n  background: var(--ts-bg);\n  border-left: 1px solid var(--ts-border);\n  box-shadow: -8px 0 20px rgba(0, 0, 0, 0.12);\n  display: flex;\n  flex-direction: column;\n  transform: translate3d(100%, 0, 0); \n  transition: transform 0.35s cubic-bezier(0.16, 1, 0.3, 1); \n  will-change: transform;\n  pointer-events: auto;\n}\n\n:host([data-open=\"true\"]) .ts-sidebar {\n  transform: translate3d(0, 0, 0);\n}\n\n.ts-header {\n  padding: 14px;\n  border-bottom: 1px solid var(--ts-border);\n  background: var(--ts-surface);\n}\n\n.ts-title {\n  font-size: 16px;\n  font-weight: 700;\n  color: var(--ts-text);\n  margin-bottom: 8px;\n}\n\n.ts-controls {\n  display: flex;\n  gap: 6px;\n  margin-bottom: 8px;\n}\n\n.ts-search-row {\n  display: flex;\n  gap: 6px;\n  align-items: center;\n}\n\n.ts-language,\n.ts-search,\n.ts-btn,\n.ts-setting select {\n  border: 1px solid var(--ts-border);\n  background: var(--ts-bg);\n  color: var(--ts-text);\n  border-radius: 6px;\n  padding: 6px 8px;\n  font-size: 12px;\n  transition: border-color 0.2s, background-color 0.2s, transform 0.1s;\n}\n\n.ts-language:hover,\n.ts-search:hover,\n.ts-btn:hover:not([disabled]),\n.ts-setting select:hover {\n  border-color: var(--ts-muted);\n}\n\n.ts-search {\n  flex: 1;\n  min-width: 0;\n}\n\n.ts-search:focus {\n  outline: 2px solid var(--ts-accent);\n  outline-offset: -1px;\n  border-color: transparent;\n}\n\n.ts-btn {\n  cursor: pointer;\n  white-space: nowrap;\n  user-select: none;\n}\n\n.ts-btn:hover:not([disabled]) {\n  background: var(--ts-surface);\n}\n\n.ts-btn:active:not([disabled]) {\n  background: var(--ts-border);\n  transform: translateY(1px);\n}\n\n.ts-btn[disabled] {\n  opacity: 0.5;\n  cursor: not-allowed;\n}\n\n.ts-summary {\n  margin-top: 6px;\n  font-size: 11px;\n  color: var(--ts-muted);\n}\n\n.ts-list {\n  flex: 1;\n  overflow: auto;\n  padding: 10px 12px;\n  display: block;\n}\n\n.ts-empty {\n  display: none;\n  padding: 20px;\n  font-size: 13px;\n  color: var(--ts-muted);\n  text-align: center;\n}\n\n\n.ts-item {\n  box-sizing: border-box;\n  height: 56px;\n  border: 1px solid transparent;\n  border-bottom: 1px solid var(--ts-border);\n  border-radius: 6px;\n  padding: 8px 10px;\n  background: transparent;\n  display: grid;\n  gap: 2px;\n  cursor: pointer;\n  \n  transition: background-color 0.15s ease, transform 0.15s cubic-bezier(0.2, 0, 0, 1);\n  margin-bottom: 8px;\n  will-change: transform; \n}\n\n.ts-item:hover {\n  background: var(--ts-surface);\n  transform: translate3d(4px, 0, 0); \n}\n\n\n.ts-item-detail-container {\n  margin-top: 4px;\n  padding: 8px 16px 16px 16px;\n  background: transparent; \n  border-radius: 8px;\n  border: none; \n  font-size: 14px;\n  line-height: 1.6;\n  cursor: default;\n  overflow-y: auto; \n  box-shadow: none; \n  \n}\n\n\n.ts-detail-enter {\n  animation: ts-slide-down 0.3s cubic-bezier(0.16, 1, 0.3, 1);\n}\n\n@keyframes ts-slide-down {\n  from { opacity: 0; transform: translateY(-8px); max-height: 0; }\n  to { opacity: 1; transform: translateY(0); max-height: 500px; }\n}\n\n.ts-item-expanded {\n  \n  border-color: var(--ts-accent);\n  background: var(--ts-surface);\n  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);\n  z-index: 1; \n}\n\n.ts-item-expanded:hover {\n  transform: none; \n}\n\n.ts-item-header {\n  display: flex;\n  justify-content: space-between;\n  align-items: center;\n  width: 100%;\n}\n\n.ts-detail-definition {\n  color: var(--ts-text);\n  margin-bottom: 16px;\n  font-weight: 500;\n  font-size: 16px; \n  line-height: 1.7; \n}\n\n.ts-badge {\n  display: inline-block;\n  padding: 2px 8px;\n  border-radius: 4px;\n  font-size: 11px;\n  font-weight: 600;\n  background: var(--ts-accent);\n  color: #fff;\n  margin-bottom: 8px;\n  opacity: 0.9;\n}\n\n.ts-detail-examples {\n  margin-bottom: 16px;\n  background: var(--ts-bg); \n  padding: 12px;\n  border-radius: 6px;\n  border: 1px solid var(--ts-border); \n}\n\n.ts-detail-label {\n  font-size: 11px;\n  text-transform: uppercase;\n  letter-spacing: 0.5px;\n  color: var(--ts-muted);\n  margin-bottom: 8px;\n  font-weight: 600;\n}\n\n.ts-detail-examples ul {\n  margin: 0;\n  padding-left: 20px;\n  list-style-type: disc;\n}\n\n.ts-detail-examples li {\n  margin-bottom: 4px;\n  color: var(--ts-text);\n  font-style: italic;\n  font-size: 13px;\n}\n\n.ts-detail-actions {\n  display: flex;\n  gap: 8px;\n  margin-bottom: 12px;\n  justify-content: flex-end; \n}\n\n\n.ts-icon-btn {\n  background: transparent;\n  border: 1px solid transparent;\n  color: var(--ts-muted);\n  padding: 6px;\n  border-radius: 6px;\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  transition: all 0.2s;\n}\n\n.ts-icon-btn:hover {\n  background: var(--ts-surface);\n  color: var(--ts-accent);\n  border-color: var(--ts-border);\n}\n\n\n.ts-badge {\n  display: inline-block;\n  padding: 2px 8px;\n  border-radius: 12px;\n  font-size: 11px;\n  font-weight: 600;\n  margin-bottom: 8px;\n}\n\n.ts-badge-category {\n  background: var(--ts-accent);\n  color: #fff;\n  background: color-mix(in srgb, var(--ts-accent), white 80%); \n  color: var(--ts-accent-hover);\n  border: 1px solid color-mix(in srgb, var(--ts-accent), transparent 80%);\n}\n\n:host([data-theme=\"dark\"]) .ts-badge-category {\n  background: color-mix(in srgb, var(--ts-accent), black 60%);\n  color: var(--ts-accent);\n}\n\n.ts-detail-sources {\n  font-size: 11px;\n  color: var(--ts-muted);\n  border-top: 1px solid var(--ts-border);\n  padding-top: 12px;\n  display: flex;\n  flex-direction: column;\n  gap: 4px;\n}\n\n.ts-online-def {\n  margin-top: 4px;\n  color: var(--ts-text);\n  background: var(--ts-surface);\n  padding: 4px 8px;\n  border-radius: 4px;\n}\n\n.ts-item-active {\n  background: var(--ts-surface);\n  border-left: 3px solid var(--ts-accent);\n  border-bottom-color: var(--ts-border);\n}\n\n.ts-item-term {\n  font-weight: 600;\n  color: var(--ts-text);\n  display: flex;\n  align-items: center;\n  gap: 6px;\n  white-space: nowrap;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  font-size: 14px;\n}\n\n.ts-item-count {\n  font-size: 10px;\n  padding: 1px 6px;\n  border-radius: 10px;\n  background: var(--ts-border);\n  color: var(--ts-text);\n  flex-shrink: 0;\n  font-weight: 500;\n}\n\n.ts-item-category {\n  font-size: 11px;\n  color: var(--ts-muted);\n  white-space: nowrap;\n  overflow: hidden;\n  text-overflow: ellipsis;\n}\n\n.ts-detail-drawer {\n  position: absolute;\n  inset: 0;\n  display: none;\n  z-index: 50;\n}\n.ts-detail-drawer.open {\n  display: block;\n}\n.ts-detail-backdrop {\n  position: absolute;\n  inset: 0;\n  background: rgba(0,0,0,0.25);\n}\n.ts-detail-panel {\n  position: absolute;\n  top: 8px;\n  left: 8px;\n  right: 8px;\n  bottom: 8px;\n  display: grid;\n  grid-template-rows: auto 1fr auto;\n  background: var(--ts-bg);\n  border: 1px solid var(--ts-border);\n  border-radius: 10px;\n  box-shadow: 0 8px 28px rgba(0,0,0,0.2);\n}\n.ts-detail-top {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  padding: 12px 14px;\n  border-bottom: 1px solid var(--ts-border);\n}\n.ts-detail-title-zh {\n  font-size: 20px;\n  font-weight: 700;\n  color: var(--ts-text);\n}\n.ts-detail-title-en {\n  font-size: 14px;\n  color: var(--ts-muted);\n}\n.ts-detail-top-actions {\n  display: flex;\n  gap: 8px;\n}\n.ts-detail-meta {\n  padding: 10px 14px;\n  font-size: 12px;\n  color: var(--ts-muted);\n  border-bottom: 1px solid var(--ts-border);\n}\n.ts-detail-body {\n  padding: 12px 14px;\n  overflow: auto;\n  min-height: 70vh;\n}\n.ts-detail-state { display: none; }\n.ts-detail-state.show { display: block; }\n.ts-detail-content { display: none; }\n.ts-detail-content.show { display: block; }\n.ts-detail-section { margin-bottom: 16px; }\n.ts-detail-section-title {\n  font-size: 12px;\n  font-weight: 700;\n  color: var(--ts-muted);\n  text-transform: uppercase;\n  letter-spacing: .6px;\n  margin-bottom: 8px;\n}\n.ts-detail-explanation {\n  font-size: 14px;\n  line-height: 1.7;\n  color: var(--ts-text);\n}\n.ts-detail-scenarios {\n  display: grid;\n  grid-template-columns: 1fr 1fr;\n  gap: 12px;\n}\n.ts-detail-scenario-title {\n  font-size: 12px;\n  font-weight: 600;\n  color: var(--ts-text);\n  margin-bottom: 6px;\n}\n.ts-detail-examples pre {\n  background: var(--ts-surface);\n  border: 1px solid var(--ts-border);\n  border-radius: 8px;\n  padding: 10px;\n  overflow: auto;\n  margin: 8px 0;\n}\n.ts-detail-example-title {\n  font-weight: 600;\n  margin-bottom: 4px;\n  color: var(--ts-text);\n}\n.ts-detail-example-desc {\n  font-size: 13px;\n  color: var(--ts-muted);\n  margin-bottom: 6px;\n}\n.ts-detail-pitfalls li {\n  margin-bottom: 6px;\n  color: var(--ts-text);\n}\n.ts-detail-related .ts-related-term {\n  border: 1px solid var(--ts-border);\n  background: transparent;\n  color: var(--ts-accent);\n  border-radius: 12px;\n  padding: 2px 8px;\n  cursor: pointer;\n  font-size: 12px;\n}\n.ts-detail-related .ts-related-term:hover {\n  background: var(--ts-surface);\n}\n.ts-detail-related a {\n  display: inline-block;\n  margin-right: 8px;\n  margin-bottom: 6px;\n  padding: 2px 8px;\n  border-radius: 12px;\n  border: 1px solid var(--ts-border);\n  color: var(--ts-accent);\n  text-decoration: none;\n}\n.ts-detail-examples .ts-detail-example {\n  margin-bottom: 12px;\n}\n@media (max-width: 640px) {\n  .ts-detail-scenarios {\n    grid-template-columns: 1fr;\n  }\n}\n.ts-detail-actions {\n  display: flex;\n  gap: 8px;\n  justify-content: flex-end;\n  padding: 10px 14px;\n  border-top: 1px solid var(--ts-border);\n}\n\n@keyframes ts-fade-in {\n  from { opacity: 0; transform: translateY(5px); }\n  to { opacity: 1; transform: translateY(0); }\n}\n\n.ts-detail-header {\n  margin-bottom: 16px;\n  padding-bottom: 16px;\n  border-bottom: 1px solid var(--ts-border);\n}\n\n.ts-detail-term {\n  font-size: 24px;\n  font-weight: 700;\n  color: var(--ts-text);\n  margin-bottom: 6px;\n  line-height: 1.2;\n}\n\n.ts-detail-meta {\n  font-size: 12px;\n  color: var(--ts-muted);\n}\n\n.ts-detail-definition {\n  font-size: 15px;\n  line-height: 1.6;\n  color: var(--ts-text);\n  margin-bottom: 20px;\n}\n\n.ts-detail-examples {\n  margin-bottom: 20px;\n}\n\n.ts-example {\n  background: var(--ts-surface);\n  padding: 10px 12px;\n  border-radius: 6px;\n  margin-bottom: 8px;\n  font-size: 13px;\n  color: var(--ts-text);\n  border-left: 3px solid var(--ts-accent);\n  line-height: 1.5;\n}\n\n.ts-detail-actions {\n  display: flex;\n  gap: 8px;\n  margin-top: auto;\n  padding-top: 16px;\n  border-top: 1px solid var(--ts-border);\n}\n\n.ts-detail-sources {\n  margin-top: 12px;\n  font-size: 11px;\n  color: var(--ts-muted);\n}\n\n.ts-tutorial {\n  position: fixed;\n  inset: 0;\n  z-index: 9999;\n  display: none;\n  align-items: center;\n  justify-content: center;\n}\n\n.ts-tutorial.show {\n  display: flex;\n}\n\n.ts-tutorial-backdrop {\n  position: absolute;\n  inset: 0;\n  background: rgba(0, 0, 0, 0.45);\n  backdrop-filter: blur(6px);\n}\n\n.ts-tutorial-card {\n  position: relative;\n  width: min(92vw, 420px);\n  background: var(--ts-surface);\n  border: 1px solid var(--ts-border);\n  border-radius: 16px;\n  padding: 18px;\n  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.18);\n  color: var(--ts-text);\n  display: flex;\n  flex-direction: column;\n  gap: 14px;\n}\n\n.ts-tutorial-header {\n  display: flex;\n  align-items: center;\n  gap: 10px;\n}\n\n.ts-tutorial-icon {\n  width: 36px;\n  height: 36px;\n  border-radius: 10px;\n  background: rgba(79, 70, 229, 0.12);\n  color: var(--ts-accent);\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n}\n\n.ts-tutorial-title {\n  font-size: 16px;\n  font-weight: 700;\n}\n\n.ts-tutorial-body {\n  display: grid;\n  gap: 8px;\n  font-size: 13px;\n  color: var(--ts-muted);\n  line-height: 1.6;\n}\n\n.ts-tutorial-item {\n  padding: 8px 10px;\n  border-radius: 10px;\n  background: var(--ts-surface-strong, rgba(148, 163, 184, 0.08));\n  border: 1px solid var(--ts-border);\n}\n\n.ts-tutorial-close {\n  align-self: flex-end;\n}\n\n\n\n.ts-skeleton {\n  background: linear-gradient(90deg, var(--ts-surface) 25%, var(--ts-border) 40%, var(--ts-surface) 75%);\n  background-size: 200% 100%;\n  animation: ts-shimmer 1.5s infinite linear; \n  border-radius: 4px;\n  display: inline-block;\n  will-change: background-position;\n}\n\n@keyframes ts-shimmer {\n  0% { background-position: 200% 0; }\n  100% { background-position: -200% 0; }\n}\n\n.ts-skeleton-text {\n  height: 14px;\n  width: 100%;\n  margin-bottom: 8px;\n}\n\n.ts-skeleton-title {\n  height: 24px;\n  width: 60%;\n  margin-bottom: 12px;\n}\n\n\n.ts-toast {\n  position: absolute;\n  bottom: 20px;\n  left: 50%;\n  transform: translateX(-50%) translateY(20px);\n  background: var(--ts-text);\n  color: var(--ts-bg);\n  padding: 8px 16px;\n  border-radius: 20px;\n  font-size: 12px;\n  font-weight: 500;\n  opacity: 0;\n  pointer-events: none;\n  transition: opacity 0.3s, transform 0.3s;\n  box-shadow: 0 4px 12px rgba(0,0,0,0.15);\n  z-index: 100;\n}\n\n.ts-toast.show {\n  opacity: 1;\n  transform: translateX(-50%) translateY(0);\n}\n\n.ts-settings-panel {\n  display: none;\n  flex: 1;\n  padding: 16px;\n  overflow: auto;\n  animation: ts-fade-in 0.2s ease-out;\n}\n\n.ts-settings-title {\n  font-size: 18px;\n  font-weight: 700;\n  color: var(--ts-text);\n  margin-bottom: 20px;\n  padding-bottom: 10px;\n  border-bottom: 1px solid var(--ts-border);\n}\n\n.ts-setting {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  margin-bottom: 16px;\n  font-size: 14px;\n  color: var(--ts-text);\n}\n\n.ts-about {\n  margin-top: 32px;\n  font-size: 12px;\n  color: var(--ts-muted);\n  line-height: 1.6;\n  padding-top: 16px;\n  border-top: 1px solid var(--ts-border);\n}\n\n.ts-footer {\n  padding: 10px 16px;\n  border-top: 1px solid var(--ts-border);\n  background: var(--ts-surface);\n  font-size: 11px;\n  color: var(--ts-muted);\n  display: flex;\n  justify-content: space-between;\n  align-items: center;\n}\n\n\n\n::-webkit-scrollbar {\n  width: 8px; \n  height: 8px;\n}\n\n::-webkit-scrollbar-thumb {\n  background: var(--ts-border);\n  border-radius: 4px;\n  border: 2px solid var(--ts-bg); \n}\n\n::-webkit-scrollbar-thumb:hover {\n  background: var(--ts-muted);\n}\n";
// --- Main Logic ---
const resolveText = (value, langKey) => (typeof value === "string" ? value : value?.[langKey]);
const buildExamples = (detail, entry, langKey) => {
  if (Array.isArray(detail?.examples)) return detail.examples;
  const fallback = entry?.examples?.[langKey];
  if (!Array.isArray(fallback)) return [];
  return fallback.filter(Boolean).map((text) => ({ title: "", description: text }));
};
const getDetailEntry = (term) => {
  const { listItems, detailMap } = store.getState();
  const item = listItems.find((entry) => entry.term === term);
  let entry = item?.entry || null;
  if (entry?.id && detailMap?.[entry.id]) {
    entry = detailMap[entry.id];
  }
  return entry;
};
const needsOnlineFill = (entry, langKey) => {
  if (!entry) return true;
  const detail = entry.detail || {};
  const defText = resolveText(detail.definition || entry.definition, langKey);
  const explanationText = resolveText(detail.detailedExplanation || detail.definition || entry.definition, langKey);
  const examples = buildExamples(detail, entry, langKey);
  return !defText || !explanationText || examples.length === 0;
};
const handleOnlineResolve = async (term, force = false) => {
  const settings = store.getState().settings;
  if (!settings.onlineEnabled) return;
  const lang = getLanguage(settings);
  const response = await chrome.runtime.sendMessage({
    type: MESSAGE_TYPES.onlineResolve,
    term,
    lang: lang === "zh" ? "zh" : "en",
    sources: ["wiktionary", "wikipedia"],
    force
  });
  if (response?.ok) {
    const onlineResults = store.getState().onlineResults;
    store.setState({ onlineResults: { ...onlineResults, [term]: response.results || [] } });
    await updateDetail(term);
    updateSidebarList();
  }
};
const ensureOnlineDetail = async (term) => {
  if (!term) return;
  const { settings, onlineResults } = store.getState();
  if (!settings.onlineEnabled) return;
  const lang = getLanguage(settings);
  const langKey = lang === "zh" ? "zh_CN" : "en";
  const entry = getDetailEntry(term);
  if (!entry) return;
  if (!needsOnlineFill(entry, langKey)) return;
  if ((onlineResults[term] || []).length) return;
  await handleOnlineResolve(term, true);
};
const handleMessage = async (message) => {
  if (!message) return;
  if (message.type === MESSAGE_TYPES.action) {
    if (message.action === "toggle") {
      toggleSidebar();
    }
    if (message.action === "rescan") {
      updateStatus("scanning");
      await scanPage();
    }
    if (message.action === "search") {
      store.setState({ searchQuery: message.query || "" });
      updateSidebarList();
    }
    if (message.action === "select") {
      await updateDetail(message.term);
      applyHighlights(message.term);
      scrollToTerm(message.term);
      await ensureOnlineDetail(message.term);
    }
    if (message.action === "highlight") {
      const selectedTerm = store.getState().selectedTerm;
      if (selectedTerm === message.term) {
        clearHighlights();
      } else {
        applyHighlights(message.term);
      }
      await updateDetail(message.term);
      await ensureOnlineDetail(message.term);
    }
    if (message.action === "online") {
      await handleOnlineResolve(message.term, Boolean(message.force));
    }
    if (message.action === "clearCache") {
      await chrome.runtime.sendMessage({ type: MESSAGE_TYPES.clearCache });
      store.setState({ onlineResults: {} });
      await updateDetail(message.term);
    }
    if (message.action === "settings") {
      await saveSettings(message.settings || {});
      applySettings();
    }
  }
};
const setSidebarOpen = (isOpen) => {
  store.setState({ sidebarOpen: isOpen });
  const panel = document.querySelector("#ts-shadow-root");
  if (panel) {
    panel.setAttribute("data-open", isOpen ? "true" : "false");
  }
  const port = store.getState().port;
  if (port) {
    port.postMessage({ type: MESSAGE_TYPES.visibility, open: isOpen });
  }
  if (isOpen) {
    updateStatus("scanning");
    scanPage();
  }
};
const toggleSidebar = () => {
  const isOpen = !store.getState().sidebarOpen;
  setSidebarOpen(isOpen);
};
const ensureTutorialOpen = async () => {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.tutorialSeen);
  if (stored?.[STORAGE_KEYS.tutorialSeen]) return;
  if (!store.getState().sidebarOpen) {
    setSidebarOpen(true);
  }
};
const setupShadowRoot = async () => {
  const host = document.createElement("div");
  host.id = "ts-shadow-root";
  host.setAttribute("data-open", "false");
  const shadow = host.attachShadow({ mode: "open" });
  document.documentElement.appendChild(host);
  // Use inlined HTML/CSS instead of fetch
  const style = document.createElement("style");
  style.textContent = sidebarCss;
  // Inject Highlight API Styles (Must be in main document)
  if (typeof CSS !== 'undefined' && 'highlights' in CSS) {
    const highlightStyle = document.createElement("style");
    highlightStyle.textContent = `
      ::highlight(terminology-highlight) {
        background-color: #ffeb3b;
        color: #000;
        text-decoration: underline;
      }
      :root[data-theme="dark"] ::highlight(terminology-highlight) {
        background-color: #facc15;
        color: #000;
      }
    `;
    document.head.appendChild(highlightStyle);
  }
  shadow.appendChild(style);
  const wrapper = document.createElement("div");
  wrapper.innerHTML = sidebarHtml;
  shadow.appendChild(wrapper);
  const module = await import(chrome.runtime.getURL("sidebar.js"));
  const channel = new MessageChannel();
  // contentScript holds port2, sidebar holds port1
  // port2 receives messages from sidebar (action)
  // port2 sends messages to sidebar (list, detail, etc.)
  store.setState({ port: channel.port2 });
  channel.port2.onmessage = (event) => handleMessage(event.data);
  module.initSidebar({
    root: shadow,
    port: channel.port1,
    language: () => getLanguage(store.getState().settings),
    i18n: chrome.i18n
  });
  const floatBtn = shadow.querySelector(".ts-float-toggle");
  if (floatBtn) {
    floatBtn.addEventListener("click", () => {
      toggleSidebar();
    });
  }
  document.addEventListener("keydown", (event) => {
    if (event.altKey && event.key.toLowerCase() === "t") {
      toggleSidebar();
    }
  });
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === MESSAGE_TYPES.toggle) toggleSidebar();
  });
  setSidebarWidth(store.getState().settings.sidebarWidth);
  updateTheme();
};
const initObservers = () => {
  let mutationTimer = null;
  const observer = new MutationObserver(() => {
    if (!store.getState().sidebarOpen) return;
    if (mutationTimer) clearTimeout(mutationTimer);
    mutationTimer = setTimeout(() => {
      updateStatus("scanning");
      scanPage();
    }, 800);
  });
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  let scrollTimer = null;
  const scrollHandler = () => {
    if (!store.getState().sidebarOpen) return;
    if (scrollTimer) clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => {
      scanPage({ light: true });
    }, 300);
  };
  window.addEventListener("scroll", scrollHandler, { passive: true });
  return () => {
    observer.disconnect();
    window.removeEventListener("scroll", scrollHandler);
  };
};
const init = async () => {
  await loadSettings();
  await loadGlossary();
  await setupShadowRoot();
  await applySettings();
  await ensureTutorialOpen();
  const cleanup = initObservers();
  store.setState({ cleanup });
  window.addEventListener("pagehide", () => {
    const { cleanup } = store.getState();
    if (cleanup) cleanup();
  }, { once: true });
};
// Export for testability if needed, but this is the entry point
init();
// Expose internal tools for testing
window.__terminologySidebarTestExports = {
  store,
  scanPage,
  toggleSidebar
};
})();