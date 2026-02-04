import { store } from './state.js';
import { getScanModes, sleep } from './utils.js';
import { extractVisibleTextNodes } from './dom.js';
import { rankMatches } from './matcher.js';
import { updateSidebarList, updateStatus } from './sidebar-manager.js';

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

/**
 * Aggregates matches into unique list items with counts.
 * @param {Array<Object>} ranked - List of ranked matches.
 * @returns {Array<Object>} Sorted list items for the sidebar.
 */
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

export const scanPage = async (options = {}) => {
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
