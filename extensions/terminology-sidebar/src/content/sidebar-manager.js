import { MESSAGE_TYPES } from '../shared/constants.js';
import { store } from './state.js';
import { getLanguage } from './utils.js';
import { scanPage } from './scanner.js'; // Circular dependency?
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

export const updateStatus = (status) => {
  const { port } = store.getState();
  if (!port) return;
  port.postMessage({ type: MESSAGE_TYPES.status, status });
};

export const updateSidebarList = () => {
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

export const loadDetailMap = async () => {
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

export const updateDetail = async (term) => {
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

export const setSidebarWidth = (width) => {
  const panel = document.querySelector("#ts-shadow-root");
  if (panel) {
    panel.style.setProperty("--ts-sidebar-width", `${width || 380}px`);
  }
};

export const updateTheme = () => {
  const panel = document.querySelector("#ts-shadow-root");
  if (!panel) return;
  panel.setAttribute("data-theme", store.getState().settings.theme);
};
