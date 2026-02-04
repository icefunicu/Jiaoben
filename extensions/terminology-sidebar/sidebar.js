// Built by tools/bundle.js
const PROJECT_PREFIX = "ts";const STORAGE_KEYS = {  settings: `${PROJECT_PREFIX}:settings`,  onlineCache: `${PROJECT_PREFIX}:onlineCache`,  tutorialSeen: `${PROJECT_PREFIX}:tutorialSeen`};const MESSAGE_TYPES = {  action: `${PROJECT_PREFIX}:action`,  list: `${PROJECT_PREFIX}:list`,  detail: `${PROJECT_PREFIX}:detail`,  status: `${PROJECT_PREFIX}:status`,  settings: `${PROJECT_PREFIX}:settings`,  visibility: `${PROJECT_PREFIX}:visibility`,  toggle: `${PROJECT_PREFIX}:toggle-sidebar`,  onlineResolve: `${PROJECT_PREFIX}:online-resolve`,  clearCache: `${PROJECT_PREFIX}:clear-online-cache`};const CACHE_CONFIG = {  TTL_MS: 7 * 24 * 60 * 60 * 1000, // 7 days  VERSION: 'v1'};const DEFAULT_SETTINGS = {  schemaVersion: 1,  language: "auto",  includeCode: false,  sidebarWidth: 380,  theme: "auto",  listLimit: 40,  onlineEnabled: true};const renderList = (listEl, items = [], currentTerm, sendAction, formatSource, virtual = {}) => {
  if (virtual.totalHeight !== undefined) {
      let phantom = listEl.querySelector(".ts-virtual-phantom");
      let content = listEl.querySelector(".ts-virtual-content");
      if (!phantom) {
        listEl.innerHTML = ""; 
        phantom = document.createElement("div");
        phantom.className = "ts-virtual-phantom";
        phantom.style.position = "relative";
        phantom.style.width = "100%";
        content = document.createElement("div");
        content.className = "ts-virtual-content";
        content.style.position = "absolute";
        content.style.top = "0";
        content.style.left = "0";
        content.style.width = "100%";
        phantom.appendChild(content);
        listEl.appendChild(phantom);
      }
      phantom.style.height = `${virtual.totalHeight}px`;
      content.style.transform = `translateY(${virtual.offsetY}px)`;
      const fragment = document.createDocumentFragment();
      items.forEach((item) => {
        const isExpanded = item.term === currentTerm;
        const card = document.createElement("div");
        card.className = isExpanded ? "ts-item ts-item-active" : "ts-item";
        // Header part (Term + Count + Category)
        const header = document.createElement("div");
        header.className = "ts-item-header";
        const term = document.createElement("div");
        term.className = "ts-item-term";
        term.textContent = item.term;
        term.title = item.term;
        const countBadge = document.createElement("span");
        countBadge.className = "ts-item-count";
        countBadge.textContent = String(item.count);
        term.appendChild(countBadge);
        const category = document.createElement("div");
        category.className = "ts-item-category";
        const srcText = formatSource(item.source);
        category.textContent = srcText;
        header.appendChild(term);
        header.appendChild(category);
        card.appendChild(header);
        card.addEventListener("click", (e) => {
          // Prevent click if clicking on buttons inside
          if (e.target.tagName === 'BUTTON') return;
          sendAction("select", { term: item.term });
        });
        fragment.appendChild(card);
      });
      content.innerHTML = "";
      content.appendChild(fragment);
  }
};
const renderDetail = ({
  elements: { detailTitleZh, detailTitleEn, detailMeta, detailDef, detailExplanation, detailUseList, detailAvoidList, detailExamples, detailPitfalls, detailRelated, detailSources, detailContent, detailLoading, detailEmpty, detailError, btnOnline, btnOnlineRefresh },
  state: { currentTerm, currentEntry, currentCount, currentOnline, currentSettings, isOnlineLoading, detailStatus },
  helpers: { language, i18n, formatSource, sendAction }
}) => {
  const showState = (status) => {
    detailLoading.classList.remove("show");
    detailEmpty.classList.remove("show");
    detailError.classList.remove("show");
    detailContent.classList.remove("show");
    if (status === "loading") detailLoading.classList.add("show");
    if (status === "empty") detailEmpty.classList.add("show");
    if (status === "error") detailError.classList.add("show");
    if (status === "ready") detailContent.classList.add("show");
  };
  if (!currentTerm) {
    showState("empty");
    return;
  }
  if (detailStatus === "loading") {
    showState("loading");
    return;
  }
  if (detailStatus === "error") {
    showState("error");
    return;
  }
  if (!currentEntry) {
    showState("empty");
    return;
  }
  showState("ready");
  const lang = language();
  const langKey = lang === "zh" ? "zh_CN" : "en";
  const resolveText = (value) => (typeof value === "string" ? value : value?.[langKey]);
  const buildExamples = (detail, entry) => {
    if (Array.isArray(detail?.examples)) return detail.examples;
    const fallback = entry?.examples?.[langKey];
    if (!Array.isArray(fallback)) return [];
    return fallback.filter(Boolean).map((text) => ({ title: "", description: text }));
  };
  const metaParts = [];
  if (currentCount) metaParts.push(`${currentCount}`);
  if (currentEntry?.category) metaParts.push(currentEntry.category);
  detailMeta.textContent = metaParts.join(" · ");
  detailTitleZh.textContent = currentEntry?.zhTerm || currentTerm || "";
  detailTitleEn.textContent = currentEntry?.term || currentTerm || "";
  const detail = currentEntry?.detail || {};
  const onlineDefinition = currentOnline.find((item) => item?.definition)?.definition || "";
  const onlineExamples = currentOnline
    .flatMap((item) => (Array.isArray(item?.examples) ? item.examples : []))
    .filter(Boolean);
  const def = detail.definition || currentEntry?.definition;
  const defText = resolveText(def) || onlineDefinition;
  detailDef.textContent = defText || i18n.getMessage("noDefinition");
  const explanation = detail.detailedExplanation || detail.definition || currentEntry?.definition;
  const explanationText = resolveText(explanation) || defText || onlineDefinition;
  detailExplanation.textContent = explanationText || defText || i18n.getMessage("detailExplanationEmpty");
  const useList = detail.scenarios?.use || [];
  const avoidList = detail.scenarios?.avoid || [];
  detailUseList.innerHTML = "";
  detailAvoidList.innerHTML = "";
  useList.forEach((item) => {
    const li = document.createElement("li");
    li.textContent = item;
    detailUseList.appendChild(li);
  });
  avoidList.forEach((item) => {
    const li = document.createElement("li");
    li.textContent = item;
    detailAvoidList.appendChild(li);
  });
  detailExamples.innerHTML = "";
  const examples = buildExamples(detail, currentEntry);
  const renderExamples = examples.length
    ? examples
    : onlineExamples.map((text) => ({ title: "", description: text }));
  if (renderExamples.length) {
    renderExamples.forEach((ex) => {
      const wrapper = document.createElement("div");
      wrapper.className = "ts-detail-example";
      const title = document.createElement("div");
      title.className = "ts-detail-example-title";
      title.textContent = resolveText(ex.title) || "";
      wrapper.appendChild(title);
      const descriptionText = resolveText(ex.description);
      if (descriptionText) {
        const desc = document.createElement("div");
        desc.className = "ts-detail-example-desc";
        desc.textContent = descriptionText;
        wrapper.appendChild(desc);
      }
      if (ex.code) {
        const pre = document.createElement("pre");
        const code = document.createElement("code");
        code.textContent = ex.code;
        pre.appendChild(code);
        wrapper.appendChild(pre);
      }
      detailExamples.appendChild(wrapper);
    });
  }
  detailPitfalls.innerHTML = "";
  const pitfalls = detail.pitfalls || [];
  pitfalls.forEach((item) => {
    const li = document.createElement("li");
    li.textContent = item;
    detailPitfalls.appendChild(li);
  });
  detailRelated.innerHTML = "";
  const related = detail.related || [];
  related.forEach((term) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "ts-related-term";
    btn.textContent = term;
    btn.addEventListener("click", () => {
      sendAction("select", { term });
    });
    detailRelated.appendChild(btn);
  });
  detailSources.innerHTML = "";
  const localLine = document.createElement("div");
  localLine.textContent = formatSource("local");
  detailSources.appendChild(localLine);
  if (isOnlineLoading) {
    const skeleton = document.createElement("div");
    skeleton.className = "ts-skeleton ts-skeleton-text";
    skeleton.style.width = "80%";
    detailSources.appendChild(skeleton);
    const skeleton2 = document.createElement("div");
    skeleton2.className = "ts-skeleton ts-skeleton-text";
    skeleton2.style.width = "60%";
    detailSources.appendChild(skeleton2);
  } else {
    currentOnline.forEach((item) => {
      const line = document.createElement("div");
      const sourceText = formatSource(item.source);
      const cacheText = item.cached ? i18n.getMessage("cacheHit") : i18n.getMessage("cacheMiss");
      const timeText = item.cacheTime ? new Date(item.cacheTime).toLocaleString() : "";
      line.textContent = `${sourceText} · ${cacheText} · ${timeText}`;
      detailSources.appendChild(line);
      if (item.definition) {
        const def = document.createElement("div");
        def.textContent = item.definition;
        detailSources.appendChild(def);
      }
      if (item.examples?.length) {
        const ex = document.createElement("div");
        ex.textContent = item.examples.slice(0, 1).join(" / ");
        detailSources.appendChild(ex);
      }
    });
  }
  btnOnline.style.display = currentSettings.onlineEnabled ? "inline-flex" : "none";
  btnOnlineRefresh.style.display = currentSettings.onlineEnabled ? "inline-flex" : "none";
  if (isOnlineLoading) {
     btnOnline.disabled = true;
     btnOnlineRefresh.disabled = true;
  } else {
     btnOnline.disabled = false;
     btnOnlineRefresh.disabled = false;
  }
};
export const initSidebar = ({ root, port, language, i18n }) => {
  const qs = (sel) => root.querySelector(sel);
  const elements = {
    listEl: qs(".ts-list"),
    detailDrawer: qs(".ts-detail-drawer"),
    detailBackdrop: qs(".ts-detail-backdrop"),
    detailPanel: qs(".ts-detail-panel"),
    detailTitleZh: qs(".ts-detail-title-zh"),
    detailTitleEn: qs(".ts-detail-title-en"),
    detailMeta: qs(".ts-detail-meta"),
    detailDef: qs(".ts-detail-definition"),
    detailExplanation: qs(".ts-detail-explanation"),
    detailUseList: qs(".ts-detail-use-list"),
    detailAvoidList: qs(".ts-detail-avoid-list"),
    detailExamples: qs(".ts-detail-examples"),
    detailPitfalls: qs(".ts-detail-pitfalls"),
    detailRelated: qs(".ts-detail-related"),
    detailSources: qs(".ts-detail-sources"),
    detailContent: qs(".ts-detail-content"),
    detailLoading: qs(".ts-detail-loading"),
    detailEmpty: qs(".ts-detail-empty"),
    detailError: qs(".ts-detail-error"),
    statusEl: qs(".ts-status"),
    btnRescan: qs(".ts-rescan"),
    btnSettings: qs(".ts-settings"),
    btnCopy: qs(".ts-detail-copy"),
    btnClose: qs(".ts-detail-close"),
    btnHighlight: qs(".ts-highlight"),
    btnOnline: qs(".ts-online"),
    btnOnlineRefresh: qs(".ts-online-refresh"),
    btnClearCache: qs(".ts-clear-cache"),
    inputSearch: qs(".ts-search"),
    btnClearSearch: qs(".ts-clear-search"),
    summaryEl: qs(".ts-summary"),
    emptyEl: qs(".ts-empty"),
    selectLang: qs(".ts-language"),
    settingsPanel: qs(".ts-settings-panel"),
    selectLimit: qs(".ts-setting-limit"),
    selectTheme: qs(".ts-setting-theme"),
    checkIncludeCode: qs(".ts-setting-include-code"),
    checkOnline: qs(".ts-setting-online"),
    toastEl: qs(".ts-toast"),
    tutorialEl: qs(".ts-tutorial"),
    tutorialBackdrop: qs(".ts-tutorial-backdrop"),
    tutorialClose: qs(".ts-tutorial-close")
  };
  let state = {
    currentTerm: "",
    currentEntry: null,
    currentCount: 0,
    currentOnline: [],
    currentSettings: {},
    currentTotal: 0,
    currentShown: 0,
    searchTimer: null,
    // Virtual List State
    allItems: [],
    scrollTop: 0,
    isOnlineLoading: false,
    detailStatus: "idle",
    lastFocused: null
  };
  // Virtual List Constants
  const ITEM_HEIGHT = 64; 
  const updateVirtualList = () => {
    const { allItems, scrollTop, currentTerm } = state;
    const containerHeight = elements.listEl.clientHeight || 500; 
    const totalHeight = allItems.length * ITEM_HEIGHT;
    let startIndex = Math.floor(scrollTop / ITEM_HEIGHT);
    // Buffer
    const buffer = 3; // Reduced buffer to minimize rendering extra items
    startIndex = Math.max(0, startIndex - buffer);
    // Find endIndex
    let currentY = startIndex * ITEM_HEIGHT;
    let endIndex = startIndex;
    while (endIndex < allItems.length && currentY < scrollTop + containerHeight + (buffer * ITEM_HEIGHT)) {
        currentY += ITEM_HEIGHT;
        endIndex++;
    }
    const visibleItems = allItems.slice(startIndex, endIndex);
    const offsetY = startIndex * ITEM_HEIGHT;
    renderList(elements.listEl, visibleItems, state.currentTerm, sendAction, formatSource, {
      totalHeight,
      offsetY,
      detailState: state,
      detailHelpers: { language, i18n, formatSource }
    });
  };
  elements.listEl.addEventListener('scroll', () => {
    state.scrollTop = elements.listEl.scrollTop;
    requestAnimationFrame(updateVirtualList);
  }, { passive: true });
  const showToast = (message, duration = 2000) => {
    if (!elements.toastEl) return;
    elements.toastEl.textContent = message;
    elements.toastEl.classList.add("show");
    setTimeout(() => {
      elements.toastEl.classList.remove("show");
    }, duration);
  };
  const handle = root.querySelector(".ts-resize-handle");
  if (handle) {
      let isDragging = false;
      let startX = 0;
      let startWidth = 0;
      let rAF = null;
      handle.addEventListener("mousedown", (e) => {
          isDragging = true;
          startX = e.clientX;
          const host = root.host;
          const style = window.getComputedStyle(host);
          startWidth = parseInt(style.getPropertyValue("--ts-sidebar-width"), 10) || 380;
          document.body.style.cursor = "ew-resize";
          handle.classList.add("dragging"); // 可用于添加拖拽时的视觉反馈
          e.preventDefault();
      });
      document.addEventListener("mousemove", (e) => {
          if (!isDragging) return;
          // 使用 rAF 节流渲染
          if (rAF) return;
          rAF = requestAnimationFrame(() => {
              const delta = startX - e.clientX;
              const newWidth = Math.max(280, Math.min(800, startWidth + delta));
              root.host.style.setProperty("--ts-sidebar-width", `${newWidth}px`);
              rAF = null;
          });
      });
      document.addEventListener("mouseup", () => {
          if (!isDragging) return;
          isDragging = false;
          if (rAF) {
             cancelAnimationFrame(rAF);
             rAF = null;
          }
          document.body.style.cursor = "";
          handle.classList.remove("dragging");
          const host = root.host;
          const width = parseInt(host.style.getPropertyValue("--ts-sidebar-width"), 10);
          state.currentSettings.sidebarWidth = width;
          sendAction("settings", { settings: { sidebarWidth: width } });
      });
  }
  const setI18nText = () => {
    root.querySelectorAll("[data-i18n]").forEach((el) => {
      const key = el.getAttribute("data-i18n");
      el.textContent = i18n.getMessage(key) || key;
    });
    root.querySelectorAll("[data-i18n-aria]").forEach((el) => {
      const key = el.getAttribute("data-i18n-aria");
      const text = i18n.getMessage(key) || key;
      el.setAttribute("aria-label", text);
    });
    root.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
      const key = el.getAttribute("data-i18n-placeholder");
      const text = i18n.getMessage(key) || key;
      el.setAttribute("placeholder", text);
    });
  };
  const openTutorial = () => {
    if (!elements.tutorialEl) return;
    elements.tutorialEl.classList.add("show");
    elements.tutorialEl.setAttribute("aria-hidden", "false");
  };
  const closeTutorial = async () => {
    if (!elements.tutorialEl) return;
    elements.tutorialEl.classList.remove("show");
    elements.tutorialEl.setAttribute("aria-hidden", "true");
    await chrome.storage.local.set({ [STORAGE_KEYS.tutorialSeen]: true });
  };
  const initTutorialOnce = async () => {
    if (!elements.tutorialEl) return;
    const stored = await chrome.storage.local.get(STORAGE_KEYS.tutorialSeen);
    if (stored?.[STORAGE_KEYS.tutorialSeen]) return;
    openTutorial();
  };
  const sendAction = (action, payload = {}) => {
    port.postMessage({ type: MESSAGE_TYPES.action, action, ...payload });
  };
  const formatSource = (source) => {
    if (source === "wiktionary") return i18n.getMessage("sourceWiktionary");
    if (source === "wikipedia") return i18n.getMessage("sourceWikipedia");
    return i18n.getMessage("sourceLocal");
  };
  const updateSummary = () => {
    if (!elements.summaryEl) return;
    const label = i18n.getMessage("resultsLabel") || "Results";
    if (!state.currentTotal) {
      elements.summaryEl.textContent = `${label}: 0`;
      return;
    }
    if (state.currentShown === state.currentTotal) {
      elements.summaryEl.textContent = `${label}: ${state.currentTotal}`;
      return;
    }
    elements.summaryEl.textContent = `${label}: ${state.currentShown}/${state.currentTotal}`;
  };
  const updateEmptyState = () => {
    if (!elements.emptyEl) return;
    if (state.currentShown > 0) {
      elements.emptyEl.style.display = "none";
      elements.emptyEl.textContent = "";
      return;
    }
    const text = state.currentTotal === 0
      ? i18n.getMessage("statusNoMatches")
      : i18n.getMessage("noResults");
    elements.emptyEl.textContent = text || "";
    elements.emptyEl.style.display = "block";
  };
  const updateClearButton = () => {
    if (!elements.btnClearSearch) return;
    elements.btnClearSearch.disabled = !elements.inputSearch.value;
  };
  const applySettings = (settings) => {
    state.currentSettings = settings;
    elements.selectLang.value = settings.language || "auto";
    elements.selectLimit.value = String(settings.listLimit || 40);
    elements.selectTheme.value = settings.theme || "auto";
    elements.checkIncludeCode.checked = Boolean(settings.includeCode);
    elements.checkOnline.checked = Boolean(settings.onlineEnabled);
    renderDetail({ 
      elements, 
      state, 
      helpers: { language, i18n, formatSource, sendAction }
    });
  };
  const openDetail = () => {
    if (!elements.detailDrawer) return;
    state.lastFocused = root.activeElement || document.activeElement;
    elements.detailDrawer.classList.add("open");
    elements.detailDrawer.setAttribute("aria-hidden", "false");
    if (elements.btnClose) {
      elements.btnClose.focus();
    }
  };
  const closeDetail = () => {
    if (!elements.detailDrawer) return;
    elements.detailDrawer.classList.remove("open");
    elements.detailDrawer.setAttribute("aria-hidden", "true");
    if (state.lastFocused && state.lastFocused.isConnected) {
      state.lastFocused.focus();
    }
  };
  const buildDetailText = () => {
    if (!state.currentEntry) return "";
    const entry = state.currentEntry;
    const detail = entry.detail || {};
    const lang = language();
    const langKey = lang === "zh" ? "zh_CN" : "en";
    const resolveText = (value) => (typeof value === "string" ? value : value?.[langKey]);
    const buildExamples = () => {
      if (Array.isArray(detail?.examples)) return detail.examples;
      const fallback = entry?.examples?.[langKey];
      if (!Array.isArray(fallback)) return [];
      return fallback.filter(Boolean).map((text) => ({ title: "", description: text }));
    };
    const onlineDefinition = state.currentOnline.find((item) => item?.definition)?.definition || "";
    const onlineExamples = state.currentOnline
      .flatMap((item) => (Array.isArray(item?.examples) ? item.examples : []))
      .filter(Boolean);
    const lines = [];
    const titleZh = entry.zhTerm || entry.term || "";
    const titleEn = entry.term || "";
    const title = titleEn && titleZh && titleEn !== titleZh ? `${titleZh} (${titleEn})` : (titleZh || titleEn);
    lines.push(title);
    lines.push("");
    const def = detail.definition || entry.definition;
    const defText = resolveText(def) || onlineDefinition;
    lines.push(`${i18n.getMessage("detailDefinition")}:`);
    lines.push(defText || i18n.getMessage("noDefinition"));
    lines.push("");
    const explanation = detail.detailedExplanation || detail.definition || entry.definition;
    const explanationText = resolveText(explanation) || defText || onlineDefinition;
    lines.push(`${i18n.getMessage("detailExplanation")}:`);
    lines.push(explanationText || defText || i18n.getMessage("detailExplanationEmpty"));
    lines.push("");
    lines.push(`${i18n.getMessage("detailScenarios")}:`);
    const useList = detail.scenarios?.use || [];
    const avoidList = detail.scenarios?.avoid || [];
    lines.push(`${i18n.getMessage("detailUse")}:`);
    useList.forEach((item) => lines.push(`- ${item}`));
    lines.push(`${i18n.getMessage("detailAvoid")}:`);
    avoidList.forEach((item) => lines.push(`- ${item}`));
    lines.push("");
    lines.push(`${i18n.getMessage("detailExamples")}:`);
    const examples = buildExamples();
    const renderExamples = examples.length
      ? examples
      : onlineExamples.map((text) => ({ title: "", description: text }));
    renderExamples.forEach((ex, index) => {
      const titleText = resolveText(ex.title);
      const descText = resolveText(ex.description);
      lines.push(`${index + 1}. ${titleText || ""}`.trim());
      if (descText) lines.push(descText);
      if (ex.code) {
        lines.push("```");
        lines.push(ex.code);
        lines.push("```");
      }
    });
    lines.push("");
    lines.push(`${i18n.getMessage("detailPitfalls")}:`);
    const pitfalls = detail.pitfalls || [];
    pitfalls.forEach((item) => lines.push(`- ${item}`));
    lines.push("");
    lines.push(`${i18n.getMessage("detailRelated")}:`);
    const related = detail.related || [];
    lines.push(related.join("、"));
    return lines.join("\n");
  };
  port.onmessage = (event) => {
    const message = event.data;
    if (!message) return;
    if (message.type === MESSAGE_TYPES.list) {
      const items = message.items || [];
      state.allItems = items;
      state.currentTotal = Number(message.total || 0);
      state.currentShown = items.length;
      updateVirtualList();
      updateSummary();
      updateEmptyState();
    }
    if (message.type === MESSAGE_TYPES.detail) {
      state.currentTerm = message.term || "";
      state.currentEntry = message.entry || null;
      state.currentCount = message.count || 0;
      state.currentOnline = message.online || [];
      state.isOnlineLoading = false;
      state.detailStatus = message.detailStatus || (state.currentEntry ? "ready" : "empty");
      renderDetail({ 
        elements, 
        state, 
        helpers: { language, i18n, formatSource, sendAction } 
      });
      updateVirtualList();
      if (state.currentTerm) {
        openDetail();
      }
    }
    if (message.type === MESSAGE_TYPES.settings) {
      applySettings(message.settings || {});
    }
    if (message.type === MESSAGE_TYPES.status) {
      const statusMap = {
        scanning: i18n.getMessage("statusScanning"),
        ready: i18n.getMessage("statusReady"),
        empty: i18n.getMessage("statusNoMatches")
      };
      elements.statusEl.textContent = statusMap[message.status] || "";
      elements.btnRescan.disabled = message.status === "scanning";
    }
    if (message.type === MESSAGE_TYPES.visibility) {
      if (!message.open) {
        elements.settingsPanel.style.display = "none";
      }
    }
  };
  elements.btnRescan.addEventListener("click", () => sendAction("rescan"));
  elements.btnSettings.addEventListener("click", () => {
    const open = elements.settingsPanel.style.display !== "grid";
    elements.settingsPanel.style.display = open ? "grid" : "none";
  });
  elements.inputSearch.addEventListener("input", (event) => {
    const value = event.target.value || "";
    if (state.searchTimer) clearTimeout(state.searchTimer);
    state.searchTimer = setTimeout(() => {
      sendAction("search", { query: value });
    }, 150);
    updateClearButton();
  });
  elements.btnClearSearch.addEventListener("click", () => {
    elements.inputSearch.value = "";
    updateClearButton();
    sendAction("search", { query: "" });
    elements.inputSearch.focus();
  });
  elements.selectLang.addEventListener("change", (event) => {
    sendAction("settings", { settings: { language: event.target.value } });
  });
  elements.selectLimit.addEventListener("change", (event) => {
    sendAction("settings", { settings: { listLimit: Number(event.target.value) } });
  });
  elements.selectTheme.addEventListener("change", (event) => {
    sendAction("settings", { settings: { theme: event.target.value } });
  });
  elements.checkIncludeCode.addEventListener("change", (event) => {
    sendAction("settings", { settings: { includeCode: event.target.checked } });
  });
  elements.checkOnline.addEventListener("change", (event) => {
    sendAction("settings", { settings: { onlineEnabled: event.target.checked } });
  });
  elements.btnCopy.addEventListener("click", async () => {
    if (!state.currentEntry) return;
    const text = buildDetailText();
    if (!text) return;
    await navigator.clipboard.writeText(text);
    showToast(i18n.getMessage("toastCopied") || "Copied to clipboard");
  });
  if (elements.btnClose) {
    elements.btnClose.addEventListener("click", () => closeDetail());
  }
  if (elements.detailBackdrop) {
    elements.detailBackdrop.addEventListener("click", () => closeDetail());
  }
  elements.btnHighlight.addEventListener("click", () => {
    if (!state.currentTerm) return;
    sendAction("highlight", { term: state.currentTerm });
  });
  elements.btnOnline.addEventListener("click", () => {
    if (!state.currentTerm) return;
    state.isOnlineLoading = true;
    renderDetail({ elements, state, helpers: { language, i18n, formatSource } });
    sendAction("online", { term: state.currentTerm, force: false });
  });
  elements.btnOnlineRefresh.addEventListener("click", () => {
    if (!state.currentTerm) return;
    state.isOnlineLoading = true;
    renderDetail({ elements, state, helpers: { language, i18n, formatSource } });
    sendAction("online", { term: state.currentTerm, force: true });
  });
  elements.btnClearCache.addEventListener("click", () => {
    sendAction("clearCache", { term: state.currentTerm });
  });
  if (elements.tutorialBackdrop) {
    elements.tutorialBackdrop.addEventListener("click", () => {
      closeTutorial();
    });
  }
  if (elements.tutorialClose) {
    elements.tutorialClose.addEventListener("click", () => {
      closeTutorial();
    });
  }
  setI18nText();
  updateClearButton();
  initTutorialOnce();
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && elements.detailDrawer?.classList.contains("open")) {
      closeDetail();
    }
  });
};