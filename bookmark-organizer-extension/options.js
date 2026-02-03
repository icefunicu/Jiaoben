import {
  DEFAULT_RULES,
  DEFAULT_ROOT_FOLDER,
  DEFAULT_AI_CONFIG,
  AI_PROVIDERS
} from './shared.js';

// ============================
// 书签整理器设置页 - 脚本
// 支持：规则管理、AI配置、定时整理、规则拖拽排序
// ============================

// ============================
// 元素引用
// ============================
const rulesContainer = document.getElementById("rules");
const addRuleButton = document.getElementById("addRule");
const saveButton = document.getElementById("saveRules");
const resetButton = document.getElementById("resetRules");
const saveStatus = document.getElementById("saveStatus");
const rootFolderInput = document.getElementById("rootFolderName");

// 定时整理
const scheduleEnabledInput = document.getElementById("scheduleEnabled");
const scheduleOptions = document.getElementById("scheduleOptions");
const scheduleIntervalSelect = document.getElementById("scheduleInterval");
const scheduleModeSelect = document.getElementById("scheduleMode");

// AI 配置
const providerSelect = document.getElementById("aiProvider");
const providerInfo = document.getElementById("providerInfo");
const apiUrlLabel = document.getElementById("apiUrlLabel");
const apiUrlInput = document.getElementById("aiApiUrl");
const apiKeyInput = document.getElementById("aiApiKey");
const modelSelect = document.getElementById("aiModel");
const batchSizeSelect = document.getElementById("aiBatchSize");
const apiUrlCustomInput = document.getElementById("aiApiUrlCustom");
const modelCustomInput = document.getElementById("aiModelCustom");
const promptInput = document.getElementById("aiPrompt");
const concurrencySelect = document.getElementById("aiConcurrency");
const cacheExpireSelect = document.getElementById("aiCacheExpire");
const testAiButton = document.getElementById("testAi");
const aiTestStatus = document.getElementById("aiTestStatus");
const aiUseMetadataInput = document.getElementById("aiUseMetadata");

// 智能推荐
const smartSuggestBtn = document.getElementById("smartSuggest");// 智能建议逻辑
const suggestModal = document.getElementById("suggestModal");
const suggestList = document.getElementById("suggestList");
const closeModal = document.querySelector(".close-modal");
const generateSuggestionsBtn = document.getElementById("generateSuggestions");

// 排除名单逻辑
const newExclusionInput = document.getElementById("newExclusionInput");
const addExclusionBtn = document.getElementById("addExclusionBtn");
const exclusionList = document.getElementById("exclusionList");
let excludedFolders = ["工作", "常用"]; // 默认值

// ============================
// 默认配置（使用 shared.js 中的 DEFAULT_RULES, DEFAULT_ROOT_FOLDER, DEFAULT_AI_CONFIG）
// ============================

// ============================
// 定时整理设置
// ============================
scheduleEnabledInput.addEventListener("change", () => {
  scheduleOptions.style.display = scheduleEnabledInput.checked ? "block" : "none";
});

// ============================
// 服务商切换逻辑
// ============================
function updateProviderUI(providerId) {
  const provider = AI_PROVIDERS[providerId];
  if (!provider) return;

  // 显示服务商信息
  if (provider.info) {
    providerInfo.innerHTML = `
      <svg class="info-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 16v-4" />
        <path d="M12 8h.01" />
      </svg>
      <span>${provider.info}</span>
    `;
    providerInfo.style.display = "flex";
  } else {
    providerInfo.style.display = "none";
  }

  // 更新 API 地址
  if (providerId === "custom") {
    apiUrlLabel.style.display = "block";
    apiUrlInput.value = "";
    apiUrlInput.placeholder = "https://api.example.com/v1";
  } else {
    apiUrlLabel.style.display = "none";
    apiUrlInput.value = provider.apiUrl;
  }

  // 更新模型列表
  modelSelect.innerHTML = '<option value="">选择模型...</option>';
  if (provider.models && provider.models.length > 0) {
    provider.models.forEach(model => {
      const option = document.createElement("option");
      option.value = model;
      option.textContent = model;
      modelSelect.appendChild(option);
    });
  } else {
    // 本地服务或自定义
    const option = document.createElement("option");
    option.value = "";
    option.textContent = providerId === "custom" ? "请在高级设置中填写" : "请在本地服务中选择";
    modelSelect.appendChild(option);
  }
}

providerSelect.addEventListener("change", () => {
  updateProviderUI(providerSelect.value);
});

// ============================
// 规则管理
// ============================
function createRuleRow(rule) {
  const template = document.getElementById("ruleTemplate");
  const clone = template.content.cloneNode(true);
  const ruleEl = clone.querySelector(".rule");

  ruleEl.querySelector(".rule-name").value = rule.name || "";
  ruleEl.querySelector(".rule-keywords").value = (rule.keywords || []).join(", ");

  ruleEl.querySelector(".remove").addEventListener("click", () => {
    ruleEl.remove();
  });

  // 拖拽排序已通过 initRuleDragAndDrop 统一托管

  return ruleEl;
}

// 移除单个绑定，改用容器委托
function initRuleDragAndDrop() {
  let draggedItem = null;

  rulesContainer.addEventListener("mousedown", (e) => {
    const handle = e.target.closest(".rule-drag-handle");
    if (handle) {
      const ruleEl = handle.closest(".rule");
      if (ruleEl) {
        ruleEl.setAttribute("draggable", "true");
        draggedItem = ruleEl;
      }
    }
  });

  rulesContainer.addEventListener("dragstart", (e) => {
    const ruleEl = e.target.closest(".rule");
    if (ruleEl) {
      ruleEl.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
      // Firefox 需要 setData 才能拖拽
      e.dataTransfer.setData("text/plain", "");
    }
  });

  rulesContainer.addEventListener("dragend", (e) => {
    const ruleEl = e.target.closest(".rule");
    if (ruleEl) {
      ruleEl.classList.remove("dragging");
      ruleEl.setAttribute("draggable", "false");
      draggedItem = null;
    }
  });

  rulesContainer.addEventListener("dragover", (e) => {
    e.preventDefault();
    const dragging = rulesContainer.querySelector(".dragging");
    const target = e.target.closest(".rule");

    if (dragging && target && dragging !== target) {
      const rect = target.getBoundingClientRect();
      const midY = rect.top + rect.height / 2;

      if (e.clientY < midY) {
        rulesContainer.insertBefore(dragging, target);
      } else {
        rulesContainer.insertBefore(dragging, target.nextSibling);
      }
    }
  });
}

function readRules() {
  const rows = rulesContainer.querySelectorAll(".rule");
  const rules = [];

  rows.forEach(row => {
    const name = row.querySelector(".rule-name").value.trim();
    const keywordsStr = row.querySelector(".rule-keywords").value;
    const keywords = keywordsStr
      .split(/[,，]/)
      .map(k => k.trim())
      .filter(Boolean);

    if (name && keywords.length > 0) {
      rules.push({ name, keywords });
    }
  });

  return rules;
}

function readRootFolderName() {
  return rootFolderInput.value.trim() || DEFAULT_ROOT_FOLDER;
}

function renderRules(rules) {
  rulesContainer.innerHTML = "";
  rules.forEach(rule => {
    rulesContainer.appendChild(createRuleRow(rule));
  });
}

// ============================
// AI 配置读取
// ============================
function readAiConfig() {
  const provider = providerSelect.value;
  const providerData = AI_PROVIDERS[provider];

  let apiUrl = apiUrlInput.value.trim();
  let model = modelSelect.value;

  // 使用自定义覆盖
  if (apiUrlCustomInput.value.trim()) {
    apiUrl = apiUrlCustomInput.value.trim();
  } else if (provider !== "custom" && providerData) {
    apiUrl = providerData.apiUrl;
  }

  if (modelCustomInput.value.trim()) {
    model = modelCustomInput.value.trim();
  }

  return {
    provider,
    apiUrl,
    apiKey: apiKeyInput.value.trim(),
    model,
    batchSize: parseInt(batchSizeSelect.value, 10) || 20,
    prompt: promptInput.value.trim(),
    concurrency: parseInt(concurrencySelect?.value, 10) || 3,
    concurrency: parseInt(concurrencySelect?.value, 10) || 3,
    cacheExpire: parseInt(cacheExpireSelect?.value, 10) ?? 7,
    useMetadata: aiUseMetadataInput?.checked || false
  };
}

// ============================
// 定时配置读取
// ============================
function readScheduleConfig() {
  return {
    enabled: scheduleEnabledInput.checked,
    interval: scheduleIntervalSelect.value,
    mode: scheduleModeSelect.value
  };
}

// ============================
// 排除名单管理
// ============================
function renderExclusions() {
  exclusionList.innerHTML = "";
  excludedFolders.forEach(folder => {
    const chip = document.createElement("div");
    chip.style.cssText = "background: #f1f5f9; padding: 4px 10px; border-radius: 16px; font-size: 12px; display: flex; align-items: center; gap: 6px;";
    chip.innerHTML = `
      <span>${folder}</span>
      <span style="cursor: pointer; color: #94a3b8; font-weight: bold;">&times;</span>
    `;
    chip.querySelector("span:last-child").onclick = () => {
      excludedFolders = excludedFolders.filter(f => f !== folder);
      renderExclusions();
    };
    exclusionList.appendChild(chip);
  });
}

addExclusionBtn.addEventListener("click", () => {
  const name = newExclusionInput.value.trim();
  if (name && !excludedFolders.includes(name)) {
    excludedFolders.push(name);
    renderExclusions();
    newExclusionInput.value = "";
  }
});

// ============================
// 设置加载与保存
// ============================
async function loadSettings() {
  try {
    const stored = await chrome.storage.sync.get([
      "rules",
      "rootFolderName",
      "aiConfig",
      "scheduleConfig"
    ]);

    // 规则
    const rules = Array.isArray(stored.rules) && stored.rules.length > 0
      ? stored.rules
      : DEFAULT_RULES;
    renderRules(rules);

    // 根目录
    rootFolderInput.value = stored.rootFolderName || DEFAULT_ROOT_FOLDER;

    // AI 配置
    const aiConfig = { ...DEFAULT_AI_CONFIG, ...stored.aiConfig };

    providerSelect.value = aiConfig.provider || "custom";
    updateProviderUI(providerSelect.value);

    if (aiConfig.provider === "custom" && aiConfig.apiUrl) {
      apiUrlInput.value = aiConfig.apiUrl;
    }

    apiKeyInput.value = aiConfig.apiKey || "";

    if (aiConfig.model) {
      // 尝试选择预设模型
      const option = modelSelect.querySelector(`option[value="${aiConfig.model}"]`);
      if (option) {
        modelSelect.value = aiConfig.model;
      } else {
        // 模型不在列表中，放到自定义
        modelCustomInput.value = aiConfig.model;
      }
    }

    batchSizeSelect.value = String(aiConfig.batchSize || 20);
    promptInput.value = aiConfig.prompt || "";

    if (concurrencySelect) {
      concurrencySelect.value = String(aiConfig.concurrency || 3);
    }
    if (cacheExpireSelect) {
      cacheExpireSelect.value = String(aiConfig.cacheExpire ?? 7);
    }
    if (aiUseMetadataInput) {
      aiUseMetadataInput.checked = Boolean(aiConfig.useMetadata);
    }

    // 定时配置
    const scheduleConfig = stored.scheduleConfig || { enabled: false, interval: "daily", mode: "keyword" };
    scheduleEnabledInput.checked = scheduleConfig.enabled;
    scheduleOptions.style.display = scheduleConfig.enabled ? "block" : "none";
    scheduleIntervalSelect.value = scheduleConfig.interval || "daily";
    scheduleModeSelect.value = scheduleConfig.mode || "keyword";

    // 排除名单
    if (stored.excludedFolders) {
      excludedFolders = stored.excludedFolders;
    }
    renderExclusions();

  } catch (error) {
    console.error("加载设置失败:", error);
    renderRules(DEFAULT_RULES);
  }
}

// ============================
// 状态显示
// ============================
function flashStatus(element, message, isError = false, isSuccess = false) {
  element.textContent = message;
  element.className = "status";

  if (isError) {
    element.classList.add("error");
  } else if (isSuccess) {
    element.classList.add("success");
  }

  setTimeout(() => {
    element.textContent = "";
    element.className = "status";
  }, 3000);
}

// ============================
// 测试 AI 连接
// ============================
async function testAiConnection() {
  const config = readAiConfig();

  if (!config.apiUrl) {
    flashStatus(aiTestStatus, "请填写 API 地址", true);
    return;
  }

  if (!config.apiKey && !["ollama", "lmstudio"].includes(config.provider)) {
    flashStatus(aiTestStatus, "请填写 API 密钥", true);
    return;
  }

  if (!config.model) {
    flashStatus(aiTestStatus, "请选择或填写模型", true);
    return;
  }

  testAiButton.disabled = true;
  aiTestStatus.textContent = "测试中...";
  aiTestStatus.className = "status";

  try {
    const response = await fetch(`${config.apiUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${config.apiKey}`
      },
      body: JSON.stringify({
        model: config.model,
        messages: [{ role: "user", content: "请回复：测试成功" }],
        max_tokens: 20
      })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error?.message || `HTTP ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";

    flashStatus(aiTestStatus, `✓ 连接成功：${content.slice(0, 20)}`, false, true);
  } catch (error) {
    flashStatus(aiTestStatus, `✗ ${error.message}`, true);
  } finally {
    testAiButton.disabled = false;
  }
}

// ============================
// 事件监听
// ============================
addRuleButton.addEventListener("click", () => {
  rulesContainer.appendChild(createRuleRow({ name: "", keywords: [] }));
});

saveButton.addEventListener("click", async () => {
  const rules = readRules();
  const rootFolderName = readRootFolderName();
  const aiConfig = readAiConfig();
  const scheduleConfig = readScheduleConfig();

  try {
    await chrome.storage.sync.set({
      rules,
      rootFolderName,
      aiConfig
    });

    // 设置定时任务
    const scheduleResponse = await chrome.runtime.sendMessage({
      type: "setup-schedule",
      config: scheduleConfig
    });

    const ruleCount = rules.length;
    const categoryCount = rules.filter(r => r.name).length;
    const message = `已保存 ${categoryCount} 个分类规则` +
      (scheduleConfig.enabled ? `，定时整理已启用` : "");

    flashStatus(saveStatus, message, false, true);
  } catch (error) {
    flashStatus(saveStatus, `保存失败：${error?.message || "未知错误"}`, true);
  }
});

resetButton.addEventListener("click", async () => {
  const confirmed = confirm("确定要恢复默认设置吗？这将清空 AI 配置和自定义规则。");
  if (!confirmed) return;

  try {
    await chrome.storage.sync.set({
      rules: DEFAULT_RULES,
      rootFolderName: DEFAULT_ROOT_FOLDER,
      aiConfig: DEFAULT_AI_CONFIG
    });

    // 禁用定时任务
    await chrome.runtime.sendMessage({
      type: "setup-schedule",
      config: { enabled: false }
    });

    renderRules(DEFAULT_RULES);
    rootFolderInput.value = DEFAULT_ROOT_FOLDER;
    providerSelect.value = "custom";
    updateProviderUI("custom");
    apiKeyInput.value = "";
    promptInput.value = "";
    scheduleEnabledInput.checked = false;
    scheduleOptions.style.display = "none";

    flashStatus(saveStatus, "已恢复默认设置", false, true);
  } catch (error) {
    flashStatus(saveStatus, `恢复失败：${error?.message || "未知错误"}`, true);
  }
});

testAiButton.addEventListener("click", testAiConnection);

// ============================
// 智能规则推荐逻辑
// ============================
smartSuggestBtn.addEventListener("click", () => {
  suggestModal.style.display = "flex";
  suggestList.innerHTML = '<div class="loading-spinner">正在分析您的书签库...</div>';
  generateSuggestions();
});

closeModal.addEventListener("click", () => {
  suggestModal.style.display = "none";
});

window.addEventListener("click", (e) => {
  if (e.target === suggestModal) {
    suggestModal.style.display = "none";
  }
});

async function generateSuggestions() {
  try {
    const tree = await chrome.bookmarks.getTree();
    const titles = [];

    // 1. 收集所有标题
    const collect = (node) => {
      if (node.url && node.title) {
        titles.push(node.title);
      }
      if (node.children) node.children.forEach(collect);
    };
    collect(tree[0]);

    if (titles.length === 0) {
      suggestList.innerHTML = '<p class="empty-message">未找到书签</p>';
      return;
    }

    // 2. 分词与统计
    // 简单的分词：按空格、标点符号分割，过滤掉数字和短词
    const stopWords = new Set([
      "的", "了", "是", "在", "和", "有", "与", "或", "等", "及", "to", "of", "in", "for", "on", "with", "by", "and", "or", "the", "a", "an", "is", "at",
      "homepage", "page", "web", "website", "site", "home", "index", "login", "signin", "signup", "register", "docs", "documentation",
      "官方", "首页", "登录", "注册", "文档", "平台", "系统", "管理", "中心"
    ]);

    const wordCounts = new Map();

    titles.forEach(title => {
      // 移除特殊字符，保留中文、英文、数字
      const cleanTitle = title.replace(/[^\u4e00-\u9fa5a-zA-Z0-9\s]/g, " ");
      const words = cleanTitle.split(/\s+/);

      words.forEach(w => {
        const word = w.toLowerCase().trim();
        if (word.length > 1 && !stopWords.has(word) && !/^\d+$/.test(word)) { // 忽略纯数字和单字
          wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
        }
      });
    });

    // 3. 排序并筛选 Top 20
    const sortedWords = [...wordCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 30); // 取前30个备选

    if (sortedWords.length === 0) {
      suggestList.innerHTML = '<p class="empty-message">未提取到有效关键词</p>';
      return;
    }

    // 4. 渲染结果
    suggestList.innerHTML = "";
    sortedWords.forEach(([word, count]) => {
      // 忽略出现次数太少的
      if (count < 2) return;

      const item = document.createElement("div");
      item.className = "suggest-item";
      item.innerHTML = `
        <span class="suggest-word">${word}</span>
        <span class="suggest-count">${count}</span>
      `;
      item.title = "点击添加此规则";

      item.addEventListener("click", () => {
        // 创建新规则
        // 尝试推断一个分类名（首字母大写）
        const categoryName = word.charAt(0).toUpperCase() + word.slice(1);
        const newRule = createRuleRow({ name: categoryName, keywords: [word] });

        // 插入到列表开头
        if (rulesContainer.firstChild) {
          rulesContainer.insertBefore(newRule, rulesContainer.firstChild);
        } else {
          rulesContainer.appendChild(newRule);
        }

        // 视觉反馈
        item.style.backgroundColor = "#e0f2fe";
        item.style.borderColor = "#3b82f6";
        setTimeout(() => {
          item.remove();
          if (suggestList.children.length === 0) {
            suggestModal.style.display = "none";
          }
        }, 300);
      });

      suggestList.appendChild(item);
    });

  } catch (error) {
    console.error(error);
    suggestList.innerHTML = `<p class="error-message">分析失败: ${error.message}</p>`;
  }
}

// ============================
// 初始化
// ============================
loadSettings();
initRuleDragAndDrop();
