import { MESSAGE_TYPES, STORAGE_KEYS } from '../shared/constants.js';
import { store } from './state.js';
import { getLanguage } from './utils.js';
import { loadGlossary } from './glossary.js';
import { loadSettings, saveSettings, applySettings } from './settings.js';
import { scanPage } from './scanner.js';
import { updateDetail, updateSidebarList, updateStatus, setSidebarWidth, updateTheme } from './sidebar-manager.js';
import { clearHighlights, applyHighlights, scrollToTerm } from './highlighter.js';

// Import resources directly (will be inlined by bundler)
import sidebarHtml from '../../sidebar.html';
import sidebarCss from '../../sidebar.css';

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
