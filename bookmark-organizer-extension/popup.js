import {
  DEFAULT_ROOT_FOLDER,
  generateColor,
  truncateText,
  formatDate,
  formatDate,
  debounce,
  escapeHtml
} from './shared.js';

// ============================
// 书签整理器 - 弹窗脚本
// 支持：整理、预览、撤销、重复检测、可视化
// ============================

// ============================
// 元素引用
// ============================
const runButton = document.getElementById("run");
const undoButton = document.getElementById("undo");
const dryRunInput = document.getElementById("dryRun");
const incrementalOnlyInput = document.getElementById("incrementalOnly");
const statusEl = document.getElementById("status");
const targetHint = document.getElementById("targetHint");
const aiWarning = document.getElementById("aiWarning");
const progressContainer = document.getElementById("progressContainer");
const progressFill = document.getElementById("progressFill");
const progressText = document.getElementById("progressText");
const modeRadios = document.querySelectorAll('input[name="classifyMode"]');

// 标签页
const tabs = document.querySelectorAll(".tab");
const tabContents = document.querySelectorAll(".tab-content");

// 预览面板
const previewPanel = document.getElementById("previewPanel");
const refreshPreviewBtn = document.getElementById("refreshPreview");
const previewList = document.getElementById("previewList");
const previewStats = document.getElementById("previewStats");
const previewHint = document.getElementById("previewHint");
const previewTotal = document.getElementById("previewTotal");
const previewMatched = document.getElementById("previewMatched");
const previewUnmatched = document.getElementById("previewUnmatched");

// 工具面板
const findDuplicatesBtn = document.getElementById("findDuplicates");
const duplicatesResult = document.getElementById("duplicatesResult");
const duplicatesCount = document.getElementById("duplicatesCount");
const duplicatesList = document.getElementById("duplicatesList");
const mergeDuplicatesBtn = document.getElementById("mergeDuplicates");
const historyList = document.getElementById("historyList");
const clearCacheBtn = document.getElementById("clearCache");

// 失效链接
const scanDeadLinksBtn = document.getElementById("scanDeadLinks");
const deadLinksResult = document.getElementById("deadLinksResult");
const deadLinksCount = document.getElementById("deadLinksCount");
const deadLinksList = document.getElementById("deadLinksList");
const removeDeadLinksBtn = document.getElementById("removeDeadLinks");

const scanFoldersBtn = document.getElementById("scanFolders");
const cleanEmptyFoldersBtn = document.getElementById("cleanEmptyFolders");
const mergeFoldersResult = document.getElementById("mergeFoldersResult");
const mergeSuggestions = document.getElementById("mergeSuggestions");

// 图表
const chartContainer = document.getElementById("chartContainer");
const pieChart = document.getElementById("pieChart");
const chartLegend = document.getElementById("chartLegend");

// 状态图表
let chartInstance = null;

// ============================
// 常量（使用 shared.js 中的配置）
// ============================
let rootFolderName = DEFAULT_ROOT_FOLDER;
let hasAiConfig = false;
let lastStats = null;

// ============================
// 标签页切换
// ============================
tabs.forEach(tab => {
  tab.addEventListener("click", () => {
    const targetTab = tab.dataset.tab;

    tabs.forEach(t => t.classList.remove("active"));
    tab.classList.add("active");

    tabContents.forEach(content => {
      content.style.display = content.id === `${targetTab}Panel` ? "block" : "none";
      if (content.id === `${targetTab}Panel`) {
        content.classList.add("active");
      } else {
        content.classList.remove("active");
      }
    });

    // 切换到工具面板时加载历史
    if (targetTab === "tools") {
      loadHistory();
    }
  });
});

// ============================
// 工具函数（已导入）
// ============================

// ============================
// 格式化统计结果
// ============================
function formatStats(stats, dryRun, mode) {
  const categoryLines = Object.entries(stats.categories || {}).map(
    ([name, count]) => `- ${name}：${count} 条`
  );

  const moveLabel = dryRun ? "预计移动" : "已移动";
  const modeLabels = {
    keyword: "关键词模式",
    ai: "AI 智能模式",
    hybrid: "混合模式"
  };

  const lines = [
    `模式：${modeLabels[mode] || mode}`,
    `匹配：${stats.matched} 条`,
    `${moveLabel}：${stats.moved} 条`,
    `未匹配：${stats.unmatched} 条`,
    `跳过：${stats.skipped} 条`
  ];

  if (dryRun) {
    lines.splice(1, 0, "（预演，未移动书签）");
  }

  if (stats.aiProcessed) {
    lines.push(`AI 处理：${stats.aiProcessed} 条`);
  }

  if (stats.cached) {
    lines.push(`使用缓存：${stats.cached} 条`);
  }

  if (categoryLines.length > 0) {
    lines.push("分类统计：", ...categoryLines);
  }

  return lines.join("\n");
}

// ============================
// 获取选中的分类模式
// ============================
function getSelectedMode() {
  for (const radio of modeRadios) {
    if (radio.checked) return radio.value;
  }
  return "keyword";
}

// ============================
// 进度显示
// ============================
function updateProgress(current, total, message) {
  const percent = total > 0 ? Math.round((current / total) * 100) : 0;
  progressFill.style.width = `${percent}%`;
  progressText.textContent = message || `处理中... ${current}/${total}`;
}

function showProgress(show) {
  progressContainer.style.display = show ? "block" : "none";
  if (show) {
    updateProgress(0, 100, "准备中...");
  }
}

// ============================
// AI 警告显示
// ============================
function updateAiWarning() {
  const mode = getSelectedMode();
  const needsAi = mode === "ai" || mode === "hybrid";
  aiWarning.style.display = needsAi && !hasAiConfig ? "flex" : "none";
}

// ============================
// 可视化图表
// ============================
function renderPieChart(categories) {
  if (!categories || Object.keys(categories).length === 0) {
    chartContainer.style.display = "none";
    return;
  }

  chartContainer.style.display = "block";
  pieChart.innerHTML = "";
  chartLegend.innerHTML = "";

  const entries = Object.entries(categories).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((sum, [, count]) => sum + count, 0);

  if (total === 0) return;

  const cx = 100;
  const cy = 100;
  const radius = 80;
  let startAngle = -90;

  entries.forEach(([name, count], index) => {
    const percentage = count / total;
    const angle = percentage * 360;
    const endAngle = startAngle + angle;

    // 创建扇形路径
    const startRad = (startAngle * Math.PI) / 180;
    const endRad = (endAngle * Math.PI) / 180;

    const x1 = cx + radius * Math.cos(startRad);
    const y1 = cy + radius * Math.sin(startRad);
    const x2 = cx + radius * Math.cos(endRad);
    const y2 = cy + radius * Math.sin(endRad);

    const largeArcFlag = angle > 180 ? 1 : 0;
    const color = generateColor(index);

    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", `M ${cx} ${cy} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2} Z`);
    path.setAttribute("fill", color);
    path.setAttribute("class", "pie-slice");
    path.setAttribute("data-category", name);
    path.setAttribute("data-count", count);

    // 悬停效果
    path.addEventListener("mouseenter", () => {
      path.style.transform = "scale(1.05)";
      path.style.transformOrigin = `${cx}px ${cy}px`;
    });
    path.addEventListener("mouseleave", () => {
      path.style.transform = "scale(1)";
    });

    pieChart.appendChild(path);

    // 图例
    const legendItem = document.createElement("div");
    legendItem.className = "legend-item";
    legendItem.innerHTML = `
      <span class="legend-color" style="background: ${color}"></span>
      <span class="legend-name">${truncateText(name, 10)}</span>
      <span class="legend-count">${count}</span>
    `;
    chartLegend.appendChild(legendItem);

    startAngle = endAngle;
  });
}

// ============================
// 预览功能
// ============================
// 全局变量存储预览数据，用于搜索过滤
let currentPreviewData = null;
const searchInput = document.getElementById("searchInput");

function renderPreviewList(items, filterText = "") {
  if (!items) return;

  const normalizedFilter = filterText.toLowerCase().trim();
  const filteredItems = normalizedFilter
    ? items.filter(i => i.title.toLowerCase().includes(normalizedFilter) || i.url.toLowerCase().includes(normalizedFilter))
    : items;

  const matched = filteredItems.filter(i => i.category).length;
  // 仅在无搜索时更新统计，或者也可以显示搜索结果的统计
  // 这里选择：始终显示"当前列表"的统计
  const unmatched = filteredItems.length - matched;

  // 更新统计面板（注意：这会改变"预览"面板顶部的数字，反映的是搜索结果）
  previewTotal.textContent = filteredItems.length;
  previewMatched.textContent = matched;
  previewUnmatched.textContent = unmatched;

  if (filteredItems.length === 0) {
    previewList.innerHTML = filterText
      ? '<p class="empty-message">未找到匹配的书签</p>'
      : '<p class="empty-message">没有需要整理的书签</p>';
    return;
  }

  // 按分类分组
  const grouped = {};
  const unmathedItems = [];
  const aiPendingItems = [];

  for (const item of filteredItems) {
    if (item.category) {
      if (!grouped[item.category]) {
        grouped[item.category] = [];
      }
      grouped[item.category].push(item);
    } else if (item.matchType === "ai-pending") {
      aiPendingItems.push(item);
    } else {
      unmathedItems.push(item);
    }
  }

  // 渲染分组
  let html = "";

  Object.entries(grouped).forEach(([category, bookmarks], index) => {
    // 简单的颜色哈希，避免依赖索引导致颜色变化
    const color = generateColor(category.length * 10);
    html += `
      <div class="preview-group" draggable="true" data-category="${category}">
        <div class="preview-group-header" style="border-left-color: ${color}">
          <span class="preview-category">${category}</span>
          <span class="preview-count">${bookmarks.length}</span>
        </div>
        <div class="preview-group-items">
          ${bookmarks.map(b => `
            <div class="preview-item" draggable="true" data-id="${b.id}" title="${escapeHtml(b.url)}">
              <span class="preview-title">${escapeHtml(truncateText(b.title, 35))}</span>
              ${b.matchedKeyword ? `<span class="preview-keyword ${b.matchType === 'ai-cached' ? 'ai-cached' : ''}">${escapeHtml(b.matchedKeyword)}</span>` : ""}
            </div>
          `).join("")}
        </div>
      </div>
    `;
  });

  // AI 待处理组
  if (aiPendingItems.length > 0) {
    html += `
      <div class="preview-group ai-pending-group">
        <div class="preview-group-header">
          <span class="preview-category">🤖 待 AI 分类</span>
          <span class="preview-count">${aiPendingItems.length}</span>
        </div>
        <div class="preview-group-items">
          ${aiPendingItems.slice(0, 20).map(b => `
            <div class="preview-item" data-id="${b.id}" title="${escapeHtml(b.url)}">
              <span class="preview-title">${escapeHtml(truncateText(b.title, 35))}</span>
            </div>
          `).join("")}
          ${aiPendingItems.length > 20 ? `<p class="preview-more">还有 ${aiPendingItems.length - 20} 个待处理...</p>` : ""}
        </div>
      </div>
    `;
  }

  // 未匹配组
  if (unmathedItems.length > 0) {
    html += `
      <div class="preview-group unmatched-group">
        <div class="preview-group-header">
          <span class="preview-category">未匹配</span>
          <span class="preview-count">${unmathedItems.length}</span>
        </div>
        <div class="preview-group-items">
          ${unmathedItems.slice(0, 20).map(b => `
            <div class="preview-item" data-id="${b.id}" title="${escapeHtml(b.url)}">
              <span class="preview-title">${escapeHtml(truncateText(b.title, 35))}</span>
            </div>
          `).join("")}
          ${unmathedItems.length > 20 ? `<p class="preview-more">还有 ${unmathedItems.length - 20} 个未显示...</p>` : ""}
        </div>
      </div>
    `;
  }

  previewList.innerHTML = html;

  // 渲染后不需要重新绑定拖拽事件，因为我们已经在 setupDragAndDrop 中通过委托处理了
  // 但 updatePreviewCounts 可能需要重新计算（如果逻辑依赖 DOM）
  // 此时列表是完全重建的，所以 counts 是准确的
}

async function loadPreview() {
  const mode = getSelectedMode();
  const incrementalOnly = incrementalOnlyInput.checked;

  previewHint.textContent = "加载中...";
  previewList.innerHTML = "";
  previewStats.style.display = "none";
  searchInput.value = ""; // 重置搜索

  try {
    const response = await chrome.runtime.sendMessage({
      type: "get-preview",
      mode,
      incrementalOnly
    });

    if (!response?.ok) {
      throw new Error(response?.error || "获取预览失败");
    }

    const data = response.data || response;
    currentPreviewData = data.items || [];

    previewStats.style.display = "flex";
    previewHint.style.display = "none";

    renderPreviewList(currentPreviewData);

  } catch (error) {
    previewHint.style.display = "block";
    handleError(error, previewHint);
  }
}

// 搜索监听
searchInput.addEventListener("input", debounce((e) => {
  renderPreviewList(currentPreviewData, e.target.value);
}, 300));


function setupDragAndDrop() {
  // 移除旧的事件监听器（如果存在）
  // 由于我们是替换 innerHTML，旧元素已被销毁，所以不需要手动移除

  // 使用事件委托，将事件绑定到容器上
  // 注意：dragstart 和 dragend 会冒泡，但 dragover/drop 需要小心处理

  // 拖拽开始
  previewList.addEventListener("dragstart", (e) => {
    const item = e.target.closest(".preview-item[draggable='true']");
    if (item) {
      e.dataTransfer.setData("text/plain", item.dataset.id);
      item.classList.add("dragging");
      e.target.classList.add("dragging"); // 确保样式应用
    }
  });

  // 拖拽结束
  previewList.addEventListener("dragend", (e) => {
    const item = e.target.closest(".preview-item");
    if (item) {
      item.classList.remove("dragging");
      e.target.classList.remove("dragging");
    }
  });

  // 拖拽经过
  previewList.addEventListener("dragover", (e) => {
    e.preventDefault(); // 允许放置
    const group = e.target.closest(".preview-group:not(.unmatched-group)");
    if (group) {
      group.classList.add("drag-over");
    }
  });

  // 拖拽离开
  previewList.addEventListener("dragleave", (e) => {
    const group = e.target.closest(".preview-group");
    if (group) {
      // 只有当真正离开 group 时才移除样式
      // 检查 relatedTarget 是否还在 group 内部
      if (!group.contains(e.relatedTarget)) {
        group.classList.remove("drag-over");
      }
    }
  });

  // 放置
  previewList.addEventListener("drop", (e) => {
    e.preventDefault();
    const group = e.target.closest(".preview-group:not(.unmatched-group)");

    // 清理所有 hover 样式
    document.querySelectorAll(".preview-group").forEach(g => g.classList.remove("drag-over"));

    if (group) {
      const itemId = e.dataTransfer.getData("text/plain");
      const category = group.dataset.category;

      // 查找被拖拽的元素（可能在当前列表，也可能在过滤后的列表）
      // 注意：这里假设 id 是唯一的
      const draggedItem = previewList.querySelector(`.preview-item[data-id="${itemId}"]`);

      if (draggedItem && category) {
        const groupItems = group.querySelector(".preview-group-items");
        groupItems.appendChild(draggedItem);

        // 更新计数
        updatePreviewCounts();
      }
    }
  });
}

function updatePreviewCounts() {
  const groups = previewList.querySelectorAll(".preview-group");
  groups.forEach(group => {
    const count = group.querySelectorAll(".preview-item").length;
    const countEl = group.querySelector(".preview-count");
    if (countEl) {
      countEl.textContent = count;
    }
  });

  const total = previewList.querySelectorAll(".preview-item").length;
  const matched = previewList.querySelectorAll(".preview-group:not(.unmatched-group) .preview-item").length;

  previewTotal.textContent = total;
  previewMatched.textContent = matched;
  previewUnmatched.textContent = total - matched;
}

// ============================
// 重复书签检测
// ============================
// ============================
// 重复书签检测
// ============================
async function findDuplicates() {
  console.log("[Popup] findDuplicates clicked");
  findDuplicatesBtn.disabled = true;
  findDuplicatesBtn.textContent = "检测中...";
  duplicatesResult.style.display = "none";

  try {
    const isFuzzy = document.getElementById("fuzzyDuplicate").checked;
    const response = await chrome.runtime.sendMessage({
      type: "find-duplicates",
      options: { similarityThreshold: isFuzzy ? 0.85 : 1.0 }
    });

    if (!response?.ok) {
      throw new Error(response?.error || "检测失败");
    }

    const duplicates = response.data || [];

    if (duplicates.length === 0) {
      duplicatesCount.textContent = "太棒了！没有发现重复书签。";
      duplicatesCount.className = "success";
      duplicatesList.innerHTML = "";
      mergeDuplicatesBtn.style.display = "none";
    } else {
      const totalDuplicates = duplicates.reduce((sum, d) => sum + d.bookmarks.length - 1, 0);
      duplicatesCount.textContent = `发现 ${duplicates.length} 组重复书签，共 ${totalDuplicates} 个可合并。`;
      duplicatesCount.className = "";

      duplicatesList.innerHTML = duplicates.slice(0, 10).map(dup => `
        <div class="duplicate-group">
          <div class="duplicate-url">${escapeHtml(truncateText(dup.url, 50))}</div>
          <div class="duplicate-items">
            ${dup.bookmarks.map((b, i) => `
              <div class="duplicate-item ${i === 0 ? 'keep' : 'remove'}">
                <span class="duplicate-title">${escapeHtml(truncateText(b.title, 30))}</span>
                <span class="duplicate-badge">${i === 0 ? '保留' : '删除'}</span>
              </div>
            `).join("")}
          </div>
        </div>
      `).join("") + (duplicates.length > 10 ? `<p class="preview-more">还有 ${duplicates.length - 10} 组未显示...</p>` : "");

      mergeDuplicatesBtn.style.display = "block";
      mergeDuplicatesBtn.onclick = async () => {
        if (!confirm(`确定要合并所有重复书签吗？将删除 ${totalDuplicates} 个重复项。`)) return;

        mergeDuplicatesBtn.disabled = true;
        mergeDuplicatesBtn.textContent = "合并中...";

        try {
          const mergeResponse = await chrome.runtime.sendMessage({
            type: "merge-duplicates",
            duplicates,
            keepFirst: true
          });

          if (!mergeResponse?.ok) {
            throw new Error(mergeResponse?.error || "合并失败");
          }

          const removed = mergeResponse.data || [];
          duplicatesCount.textContent = `成功删除 ${removed.length} 个重复书签！`;
          duplicatesCount.className = "success";
          duplicatesList.innerHTML = "";
          mergeDuplicatesBtn.style.display = "none";
        } catch (error) {
          alert(`合并失败：${error.message}`);
        } finally {
          mergeDuplicatesBtn.disabled = false;
          mergeDuplicatesBtn.textContent = "合并全部（保留最早添加的）";
        }
      };
    }

    duplicatesResult.style.display = "block";
  } catch (error) {
    alert(`检测失败：${error.message}`);
  } finally {
    findDuplicatesBtn.disabled = false;
    findDuplicatesBtn.textContent = "检测重复";
  }
}

// ============================
// 清理空文件夹
// ============================
async function cleanEmptyFolders() {
  console.log("[Popup] cleanEmptyFolders clicked");
  const btn = document.getElementById("cleanEmptyFolders");
  btn.disabled = true;
  btn.textContent = "扫描中...";

  try {
    console.log("[Popup] Sending 'clean-empty-folders' (dryRun=true)");
    // 1. Dry run scan
    const res = await chrome.runtime.sendMessage({
      type: "clean-empty-folders",
      dryRun: true
    });
    console.log("[Popup] clean empty folders response:", res);

    if (res.count === 0) {
      alert("未发现空文件夹。");
      return;
    }

    const confirmed = confirm(
      `发现 ${res.count} 个空文件夹：\n\n` +
      res.candidates.map(c => `- ${c.title} \n  (位置: ${c.fullPath})`).slice(0, 10).join("\n") +
      (res.count > 10 ? `\n...等共 ${res.count} 个` : "") +
      `\n\n确定要删除吗？（支持撤销）`
    );

    if (!confirmed) return;

    // 2. Execute deletion
    btn.textContent = "清理中...";
    console.log("[Popup] Sending 'clean-empty-folders' (dryRun=false)");
    const finalRes = await chrome.runtime.sendMessage({
      type: "clean-empty-folders",
      dryRun: false
    });

    alert(`已清理 ${finalRes.count} 个空文件夹`);
    loadHistory(); // Update undo button state
  } catch (error) {
    console.error("[Popup] cleanEmptyFolders error:", error);
    alert("清理失败: " + error.message);
  } finally {
    btn.disabled = false;
    btn.textContent = "清理空文件夹";
  }
}

// ============================
// 失效链接检测
// ============================
async function scanSimilarFolders() {
  console.log("[Popup] scanSimilarFolders started");
  const scanBtn = document.getElementById("scanFolders");
  const resultDiv = document.getElementById("mergeFoldersResult");
  const suggestionsDiv = document.getElementById("mergeSuggestions");

  scanBtn.disabled = true;
  scanBtn.textContent = "扫描中...";
  resultDiv.style.display = "none";

  try {
    console.log("[Popup] Sending 'scan-similar-folders' message");
    const response = await chrome.runtime.sendMessage({ type: "scan-similar-folders" });
    console.log("[Popup] Response received:", response);

    if (!response?.ok) {
      throw new Error(response?.error || "扫描失败");
    }

    const simpleMerges = response.data || [];
    console.log("[Popup] Merges found:", simpleMerges.length);

    if (simpleMerges.length === 0) {
      alert("未发现相似文件夹。");
      return;
    }
  } catch (error) {
    alert(`扫描失败：${error.message}`);
  } finally {
    scanBtn.disabled = false;
    scanBtn.textContent = "扫描相似文件夹";
  }
}

async function scanDeadLinks() {
  console.log("[Popup] scanDeadLinks clicked");
  scanDeadLinksBtn.disabled = true;
  scanDeadLinksBtn.textContent = "准备检测...";
  deadLinksResult.style.display = "none";
  showProgress(true);

  try {
    const response = await chrome.runtime.sendMessage({ type: "scan-dead-links" });

    if (!response?.ok) {
      throw new Error(response?.error || "检测失败");
    }

    const deadLinks = response.data || [];

    if (deadLinks.length === 0) {
      deadLinksCount.textContent = "太棒了！所有书签都可以正常访问。";
      deadLinksCount.className = "success";
      deadLinksList.innerHTML = "";
      removeDeadLinksBtn.style.display = "none";
    } else {
      deadLinksCount.textContent = `发现 ${deadLinks.length} 个失效链接。`;
      deadLinksCount.className = "error";

      deadLinksList.innerHTML = deadLinks.slice(0, 20).map(link => `
        <div class="duplicate-item remove">
          <span class="duplicate-title" title="${escapeHtml(link.url)}">${escapeHtml(truncateText(link.title, 30))} (${escapeHtml(truncateText(link.url, 40))})</span>
          <span class="duplicate-badge">失效</span>
        </div>
      `).join("") + (deadLinks.length > 20 ? `<p class="preview-more">还有 ${deadLinks.length - 20} 个未显示...</p>` : "");

      removeDeadLinksBtn.style.display = "block";
      removeDeadLinksBtn.onclick = async () => {
        if (!confirm(`确定要移除这 ${deadLinks.length} 个失效书签吗？操作不可撤销！`)) return;

        removeDeadLinksBtn.disabled = true;
        removeDeadLinksBtn.textContent = "移除中...";

        try {
          const ids = deadLinks.map(b => b.id);
          const removeRes = await chrome.runtime.sendMessage({
            type: "remove-bookmarks",
            ids
          });

          if (removeRes?.ok) {
            deadLinksCount.textContent = `已成功移除 ${removeRes.count} 个失效链接。`;
            deadLinksCount.className = "success";
            deadLinksList.innerHTML = "";
            removeDeadLinksBtn.style.display = "none";
          } else {
            throw new Error(removeRes?.error || "移除失败");
          }
        } catch (e) {
          alert(`移除失败: ${e.message}`);
        } finally {
          removeDeadLinksBtn.disabled = false;
          removeDeadLinksBtn.textContent = "移除选中链接";
        }
      };
    }
    deadLinksResult.style.display = "block";

  } catch (error) {
    alert(`检测失败：${error.message}`);
  } finally {
    scanDeadLinksBtn.disabled = false;
    scanDeadLinksBtn.textContent = "开始检测";
    showProgress(false);
  }
}

// ============================
// 历史记录
// ============================
async function loadHistory() {
  try {
    const response = await chrome.runtime.sendMessage({ type: "get-history" });
    const history = response?.data || [];

    if (history.length === 0) {
      historyList.innerHTML = '<p class="empty-message">暂无操作记录</p>';
      undoButton.disabled = true;
      return;
    }

    undoButton.disabled = false;

    historyList.innerHTML = history.map((record, index) => `
      <div class="history-item ${index === 0 ? 'latest' : ''}">
        <div class="history-header">
          <span class="history-time">${formatDate(record.timestamp)}</span>
          <span class="history-mode">${record.mode === "ai" ? "AI" : record.mode === "hybrid" ? "混合" : "关键词"}</span>
        </div>
        <div class="history-stats">
          移动 ${record.stats?.moved || 0} 个书签到 ${Object.keys(record.stats?.categories || {}).length} 个分类
        </div>
        ${index === 0 ? '<span class="history-badge">可撤销</span>' : ''}
      </div>
    `).join("");
  } catch (error) {
    historyList.innerHTML = `<p class="error-message">加载失败：${error.message}</p>`;
  }
}

// ============================
// 撤销功能
// ============================
// ============================
// 撤销功能
// ============================
async function undoOrganize() {
  console.log("[Popup] undoOrganize clicked");
  if (!confirm("确定要撤销上次整理吗？书签将恢复到原来的位置。")) return;

  undoButton.disabled = true;
  statusEl.textContent = "正在撤销...";

  try {
    const response = await chrome.runtime.sendMessage({ type: "undo-organize" });

    if (!response?.ok) {
      throw new Error(response?.error || "撤销失败");
    }

    const data = response.data || response;
    statusEl.textContent = `撤销完成！恢复了 ${data.restored} 个书签。`;
    statusEl.className = "status success";

    await loadHistory();
  } catch (error) {
    statusEl.textContent = `撤销失败：${error.message}`;
    statusEl.className = "status error";
    undoButton.disabled = false;
  }
}

// ============================
// 清除缓存
// ============================
async function clearCache() {
  console.log("[Popup] clearCache clicked");
  if (!confirm("确定要清除 AI 分类缓存吗？")) return;

  try {
    await chrome.runtime.sendMessage({ type: "clear-cache" });
    alert("缓存已清除！");
  } catch (error) {
    alert(`清除失败：${error.message}`);
  }
}

// ============================
// 加载设置
// ============================
async function loadSettings() {
  try {
    const stored = await chrome.storage.sync.get(["rootFolderName", "aiConfig"]);

    if (typeof stored.rootFolderName === "string" && stored.rootFolderName.trim()) {
      rootFolderName = stored.rootFolderName.trim();
    }

    hasAiConfig = stored.aiConfig?.apiKey?.trim()?.length > 0;
  } catch (error) {
    rootFolderName = DEFAULT_ROOT_FOLDER;
    hasAiConfig = false;
  }

  if (targetHint) {
    targetHint.textContent = `整理后将在书签中创建"${rootFolderName}"目录，并在其下生成分类文件夹。`;
  }

  updateAiWarning();
  await loadHistory();
}

// ============================
// 事件监听
// ============================
modeRadios.forEach(radio => {
  radio.addEventListener("change", updateAiWarning);
});

runButton.addEventListener("click", async () => {
  console.log("[Popup] Run button clicked");
  const dryRun = dryRunInput.checked;
  const mode = getSelectedMode();
  const incrementalOnly = incrementalOnlyInput.checked;

  if ((mode === "ai" || mode === "hybrid") && !hasAiConfig) {
    statusEl.textContent = "请先在设置页配置 AI API 密钥。";
    return;
  }

  if (!dryRun) {
    const confirmed = window.confirm(
      `将移动书签到"${rootFolderName}"目录下的分类文件夹。\n建议先使用预演模式确认效果。是否继续？`
    );
    if (!confirmed) {
      statusEl.textContent = "已取消。";
      return;
    }
  }

  statusEl.textContent = "";
  statusEl.className = "status";
  runButton.disabled = true;
  chartContainer.style.display = "none";

  if (mode === "ai" || mode === "hybrid") {
    showProgress(true);
  }

  try {
    const response = await chrome.runtime.sendMessage({
      type: "organize-bookmarks",
      dryRun,
      mode,
      incrementalOnly,
      groupByDomain // Added this line
    });

    if (!response?.ok) {
      throw new Error(response?.error || "未知错误");
    }

    const stats = response.stats || response.data || response;
    lastStats = stats;
    statusEl.textContent = formatStats(stats, dryRun, mode);
    statusEl.className = "status success";

    // 显示图表
    renderPieChart(stats.categories);

    // 更新历史和撤销按钮
    if (!dryRun) {
      await loadHistory();
    }
    // 统一错误处理
    function handleError(error, container = statusEl) {
      const msg = error.message || String(error);
      container.className = "status error";

      if (msg.includes("401") || msg.includes("密钥") || msg.includes("API Key")) {
        container.innerHTML = `
      错误：${msg}<br>
      <button id="fixSettingsBtn" class="action-btn small-btn" style="margin-top: 8px;">前往设置</button>
    `;
        setTimeout(() => {
          document.getElementById("fixSettingsBtn")?.addEventListener("click", () => {
            chrome.runtime.openOptionsPage();
          });
        }, 0);
      } else {
        container.textContent = `错误：${msg}`;
      }
    }

    // ... (in runButton)
  } catch (error) {
    handleError(error, statusEl);
  } finally {
    runButton.disabled = false;
    showProgress(false);
  }
});

undoButton.addEventListener("click", undoOrganize);
refreshPreviewBtn.addEventListener("click", () => loadPreview().catch(e => handleError(e, previewHint)));
findDuplicatesBtn.addEventListener("click", findDuplicates);
scanDeadLinksBtn.addEventListener("click", scanDeadLinks);
clearCacheBtn.addEventListener("click", clearCache);

// 修复部分按钮监听缺失
if (document.getElementById("scanFolders")) {
  document.getElementById("scanFolders").addEventListener("click", scanSimilarFolders);
}
if (document.getElementById("cleanEmptyFolders")) {
  document.getElementById("cleanEmptyFolders").addEventListener("click", cleanEmptyFolders);
}


// 监听进度更新消息
chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "organize-progress" || message?.type === "scan-progress") {
    // console.log("[Popup] Progress:", message); // Reduce noise
    updateProgress(message.current, message.total, message.message);
  }
});

// ============================
// 初始化
// ============================
loadSettings();
