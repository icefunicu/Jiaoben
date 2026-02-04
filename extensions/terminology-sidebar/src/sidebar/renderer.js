import { MESSAGE_TYPES } from '../shared/constants.js';

export const renderList = (listEl, items = [], currentTerm, sendAction, formatSource, virtual = {}) => {
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

export const renderDetail = ({
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
