import {
  DEFAULT_RULES,
  DEFAULT_ROOT_FOLDER,
  LEGACY_ROOT_FOLDER,
  DEFAULT_AI_CONFIG,
  DEFAULT_AI_PROMPT,
  CACHE_CONFIG,
  HISTORY_CONFIG,
  CONCURRENT_CONFIG,
  normalize,
  hashUrl,
  delay,
  getDomain
} from './shared.js';

import { TrieMatcher } from './trie.js';
import { calculateSimilarity, checkUrlAlive, normalizeUrlV2, levenshteinDistance } from './utils/algorithms.js';

// ============================
// 书签整理器 - 后台服务脚本
// 支持：预览、撤销、AI缓存、并发处理、增量整理、定时任务、快捷键
// ============================

// ============================
// 配置常量
// ============================
const CACHE_EXPIRE_DAYS = CACHE_CONFIG.expireDays;
const MAX_CACHE_ENTRIES = CACHE_CONFIG.maxEntries;
const MAX_HISTORY_RECORDS = HISTORY_CONFIG.maxRecords;
const MAX_CONCURRENCY = CONCURRENT_CONFIG.maxConcurrency;
const RATE_LIMIT_PER_SECOND = CONCURRENT_CONFIG.rateLimit;
const RETRY_COUNT = CONCURRENT_CONFIG.retryCount;
const RETRY_DELAY = CONCURRENT_CONFIG.retryDelay;


// ============================
// 设置管理
// ============================
async function getSettings() {
  const stored = await chrome.storage.sync.get(["rules", "rootFolderName", "aiConfig", "scheduleConfig"]);

  const rules = Array.isArray(stored.rules) && stored.rules.length > 0 ? stored.rules : DEFAULT_RULES;
  const rootFolderName = typeof stored.rootFolderName === "string" && stored.rootFolderName.trim()
    ? stored.rootFolderName.trim() : DEFAULT_ROOT_FOLDER;
  const aiConfig = { ...DEFAULT_AI_CONFIG, ...stored.aiConfig };
  const scheduleConfig = stored.scheduleConfig || { enabled: false, interval: "daily", mode: "keyword" };

  const updates = {};
  if (!Array.isArray(stored.rules) || stored.rules.length === 0) updates.rules = rules;
  if (rootFolderName !== stored.rootFolderName) updates.rootFolderName = rootFolderName;
  if (Object.keys(updates).length > 0) await chrome.storage.sync.set(updates);

  return { rules, rootFolderName, aiConfig, scheduleConfig };
}

// ============================
// AI 缓存管理
// ============================
async function getAiCache() {
  const stored = await chrome.storage.local.get(["aiCache"]);
  return stored.aiCache || {};
}

async function setAiCache(cache) {
  // 清理过期条目
  const now = Date.now();
  const expireTime = CACHE_EXPIRE_DAYS * 24 * 60 * 60 * 1000;
  const cleanedCache = {};
  const entries = Object.entries(cache);

  // 按时间排序，保留最新的
  entries.sort((a, b) => (b[1].timestamp || 0) - (a[1].timestamp || 0));

  for (const [key, value] of entries.slice(0, MAX_CACHE_ENTRIES)) {
    if (now - (value.timestamp || 0) < expireTime) {
      cleanedCache[key] = value;
    }
  }

  await chrome.storage.local.set({ aiCache: cleanedCache });
}

async function getCachedCategory(url) {
  const cache = await getAiCache();
  const key = hashUrl(url);
  const entry = cache[key];

  if (entry) {
    const now = Date.now();
    const expireTime = CACHE_EXPIRE_DAYS * 24 * 60 * 60 * 1000;
    if (now - (entry.timestamp || 0) < expireTime) {
      return entry.category;
    }
  }
  return null;
}

async function setCachedCategories(urlCategoryMap) {
  const cache = await getAiCache();
  const now = Date.now();

  for (const [url, category] of Object.entries(urlCategoryMap)) {
    const key = hashUrl(url);
    cache[key] = { category, timestamp: now };
  }

  await setAiCache(cache);
}

// ============================
// 历史记录管理（撤销功能）
// ============================
async function getMoveHistory() {
  const stored = await chrome.storage.local.get(["moveHistory"]);
  return stored.moveHistory || [];
}

async function addMoveHistory(record) {
  const history = await getMoveHistory();
  history.unshift({
    ...record,
    timestamp: Date.now()
  });

  // 保留最近的记录
  const trimmed = history.slice(0, MAX_HISTORY_RECORDS);
  await chrome.storage.local.set({ moveHistory: trimmed });
}

async function clearLastHistory() {
  const history = await getMoveHistory();
  if (history.length > 0) {
    history.shift();
    await chrome.storage.local.set({ moveHistory: history });
  }
}

// ============================
// 已处理书签记录（增量整理）
// ============================
async function getProcessedBookmarks() {
  const stored = await chrome.storage.local.get(["processedBookmarks"]);
  return stored.processedBookmarks || {};
}

async function setProcessedBookmarks(processed) {
  await chrome.storage.local.set({ processedBookmarks: processed });
}

async function markBookmarksProcessed(bookmarks) {
  const processed = await getProcessedBookmarks();
  const now = Date.now();

  for (const bookmark of bookmarks) {
    processed[bookmark.id] = {
      url: bookmark.url,
      timestamp: now
    };
  }

  await setProcessedBookmarks(processed);
}

// ============================
// 文件夹管理
// ============================
async function ensureFolder(parentId, title, cache, dryRun = false) {
  const key = `${parentId}:${title}`;
  if (cache.has(key)) return cache.get(key);

  const children = await chrome.bookmarks.getChildren(parentId);
  const existing = children.find((node) => !node.url && node.title === title);
  if (existing) {
    cache.set(key, existing.id);
    return existing.id;
  }

  // 如果是预演模式，不创建文件夹，返回一个带标记的假 ID
  if (dryRun) {
    return `dry-run-folder-${Math.random()}`; // 防止冲突
  }

  const created = await chrome.bookmarks.create({ parentId, title });
  cache.set(key, created.id);
  return created.id;
}

async function ensureCategoryPath(rootId, categoryPath, cache, dryRun = false) {
  const parts = categoryPath.split('/').map(p => p.trim()).filter(p => p);
  let currentParentId = rootId;

  // 如果 rootId 本身是 fake ID (dry run)，后续也都只能返回 fake ID
  const isFakeRoot = typeof rootId === 'string' && rootId.startsWith('dry-run');

  for (const part of parts) {
    if (isFakeRoot || (currentParentId && typeof currentParentId === 'string' && currentParentId.startsWith('dry-run'))) {
      // 父级已经是假 ID了，子级肯定不存在且无法查找，直接返回新的假 ID
      currentParentId = `dry-run-folder-${Math.random()}`;
    } else {
      currentParentId = await ensureFolder(currentParentId, part, cache, dryRun);
    }
  }
  return currentParentId;
}

async function ensureRootFolder(parentId, title, cache) {
  const key = `${parentId}:${title}`;
  if (cache.has(key)) return cache.get(key);

  const children = await chrome.bookmarks.getChildren(parentId);
  const existing = children.find((node) => !node.url && node.title === title);
  if (existing) {
    cache.set(key, existing.id);
    return existing.id;
  }

  if (LEGACY_ROOT_FOLDER !== title) {
    const legacy = children.find((node) => !node.url && node.title === LEGACY_ROOT_FOLDER);
    if (legacy) {
      const updated = await chrome.bookmarks.update(legacy.id, { title });
      cache.set(key, updated.id);
      return updated.id;
    }
  }

  const created = await chrome.bookmarks.create({ parentId, title });
  cache.set(key, created.id);
  return created.id;
}

function findDefaultParentId(treeRoot) {
  const other = treeRoot.children?.find((node) => node.id === "2");
  if (other) return other.id;
  const bar = treeRoot.children?.find((node) => node.id === "1");
  if (bar) return bar.id;
  return treeRoot.id;
}

// ============================
// 关键词匹配（使用 Trie 树）
// ============================
function buildMatcher(rules) {
  const trie = new TrieMatcher();
  trie.insertRules(rules);
  return (bookmark) => trie.match(bookmark);
}

// ============================
// 并发控制器
// ============================
class ConcurrentRunner {
  constructor(maxConcurrency = MAX_CONCURRENCY, rateLimit = RATE_LIMIT_PER_SECOND) {
    this.maxConcurrency = maxConcurrency;
    this.rateLimit = rateLimit;
    this.running = 0;
    this.queue = [];
    this.lastRequestTime = 0;
  }

  async run(tasks, handler, onProgress) {
    const results = new Array(tasks.length);
    let completed = 0;

    const processNext = async (index) => {
      if (index >= tasks.length) return;

      // 速率限制
      const now = Date.now();
      const minInterval = 1000 / this.rateLimit;
      const elapsed = now - this.lastRequestTime;
      if (elapsed < minInterval) {
        await delay(minInterval - elapsed);
      }
      this.lastRequestTime = Date.now();

      try {
        results[index] = await handler(tasks[index], index);
      } catch (error) {
        results[index] = { error };
      }

      completed++;
      if (onProgress) {
        onProgress(completed, tasks.length);
      }
    };

    // 启动初始并发任务
    const workers = [];
    for (let i = 0; i < Math.min(this.maxConcurrency, tasks.length); i++) {
      workers.push(this.runWorker(tasks, processNext, i));
    }

    await Promise.all(workers);
    return results;
  }

  async runWorker(tasks, processNext, startIndex) {
    let index = startIndex;
    while (index < tasks.length) {
      await processNext(index);
      index += this.maxConcurrency;
    }
  }
}

// ============================
// 收集现有分类文件夹
// ============================
async function collectExistingCategories(rootFolderName) {
  const tree = await chrome.bookmarks.getTree();
  const categories = new Set();

  // 查找根分类文件夹
  let rootFolderId = null;
  const findRoot = (node) => {
    if (node.title === rootFolderName) {
      rootFolderId = node.id;
      return true;
    }
    if (node.children) {
      for (const child of node.children) {
        if (findRoot(child)) return true;
      }
    }
    return false;
  };
  findRoot(tree[0]);

  // 如果找到了根文件夹，收集其直接子文件夹
  if (rootFolderId) {
    const children = await chrome.bookmarks.getChildren(rootFolderId);
    children.forEach(child => {
      if (!child.url) { // 是文件夹
        categories.add(child.title);
      }
    });
  }

  // 同时收集书签栏的一级文件夹（作为补充）
  const bar = tree[0].children?.find(node => node.id === "1");
  if (bar && bar.children) {
    bar.children.forEach(child => {
      if (!child.url && child.title !== rootFolderName) {
        categories.add(child.title);
      }
    });
  }

  return Array.from(categories);
}
async function fetchPageMetadata(url) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5秒超时

    const response = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      headers: {
        "Accept": "text/html,application/xhtml+xml,application/xml"
      }
    });

    clearTimeout(timeoutId);

    if (!response.ok) return null;

    const text = await response.text();

    // 简单的正则提取，避免引入 DOM 解析器开销
    const titleMatch = text.match(/<title[^>]*>([^<]+)<\/title>/i);
    const descMatch = text.match(/<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i) ||
      text.match(/<meta\s+content=["']([^"']+)["']\s+name=["']description["']/i);

    const title = titleMatch ? titleMatch[1].trim() : "";
    const description = descMatch ? descMatch[1].trim() : "";

    if (!title && !description) return null;

    return { title, description };
  } catch (error) {
    // 忽略网络错误
    return null;
  }
}

// ============================
// AI 分类
// ============================
async function callAI(aiConfig, bookmarks, categoryNames, rootFolderName = DEFAULT_ROOT_FOLDER, template = "general") {
  // 收集现有文件夹
  const existingCategories = await collectExistingCategories(rootFolderName);
  const combinedCategories = Array.from(new Set([...categoryNames, ...existingCategories]));

  let promptTemplate = aiConfig.prompt || DEFAULT_AI_PROMPT;

  // 动态注入现有分类优先指令
  const existingStr = existingCategories.length > 0
    ? `\n\n【重要】请优先归类到以下【现有分类】中：${existingCategories.join("、")}。只有当现有分类都不合适时，才从推荐分类中选择或新建分类。`
    : "";

  let templateInst = "";
  switch (template) {
    case "developer":
      templateInst = "\n\n【模式指令】这是开发者书签。请重点识别：编程语言(Python/JS/Go)、框架(React/Vue)、工具(Docker/Git)、文档、教程。";
      break;
    case "shopping":
      templateInst = "\n\n【模式指令】这是购物清单。请重点识别：商品品类(数码/家居/服饰)、电商平台(京东/淘宝/亚马逊)、优惠活动。";
      break;
    case "academic":
      templateInst = "\n\n【模式指令】这是学术资料。请重点识别：学科(CS/Math/Physics)、论文来源(Arxiv/Nature)、期刊、课程。";
      break;
    case "general":
    default:
      templateInst = "\n\n【模式指令】请按通用网络浏览习惯分类，如新闻、娱乐、社交、工具等。";
      break;
  }

  promptTemplate += existingStr + templateInst;

  const categories = combinedCategories.join("、");
  const systemPrompt = promptTemplate.replace("{CATEGORIES}", categories);

  // 如果启用了元数据抓取，先并行抓取
  let enrichedBookmarks = bookmarks;
  if (aiConfig.useMetadata) {
    const metas = await Promise.all(bookmarks.map(b => fetchPageMetadata(b.url)));
    enrichedBookmarks = bookmarks.map((b, i) => {
      const meta = metas[i];
      return {
        id: String(i),
        title: b.title || "",
        url: b.url || "",
        // 添加额外上下文
        pageTitle: meta?.title || "",
        pageDescription: meta?.description || ""
      };
    });
  } else {
    enrichedBookmarks = bookmarks.map((b, i) => ({
      id: String(i),
      title: b.title || "",
      url: b.url || ""
    }));
  }

  const userMessage = `请为以下书签分类：\n${JSON.stringify(enrichedBookmarks, null, 2)}`;

  let lastError;
  for (let attempt = 0; attempt < retryCount; attempt++) {
    try {
      const response = await fetch(`${aiConfig.apiUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${aiConfig.apiKey}`
        },
        body: JSON.stringify({
          model: aiConfig.model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userMessage }
          ],
          temperature: 0.3
        })
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error?.message || `AI API 错误: HTTP ${response.status}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || "";

      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        throw new Error("AI 响应中未找到 JSON 数组");
      }
      const results = JSON.parse(jsonMatch[0]);

      const mapping = {};
      for (const item of results) {
        if (item.id !== undefined && item.category) {
          mapping[item.id] = item.category;
        }
      }
      return mapping;
    } catch (error) {
      lastError = error;
      if (attempt < retryCount - 1) {
        await delay(RETRY_DELAY * (attempt + 1));
      }
    }
  }
  throw lastError;
}

async function aiClassifyBookmarks(bookmarks, aiConfig, categoryNames, sendProgress, template = "general") {
  const batchSize = aiConfig.batchSize || 20;
  const results = new Map();
  const urlCategoryMap = {};

  // 先检查缓存
  const uncachedBookmarks = [];
  for (const bookmark of bookmarks) {
    const cachedCategory = await getCachedCategory(bookmark.url);
    if (cachedCategory) {
      results.set(bookmark.id, cachedCategory);
    } else {
      uncachedBookmarks.push(bookmark);
    }
  }

  if (uncachedBookmarks.length === 0) {
    sendProgress(bookmarks.length, bookmarks.length, "使用缓存完成");
    return results;
  }

  // 并发处理批次
  const batches = [];
  for (let i = 0; i < uncachedBookmarks.length; i += batchSize) {
    batches.push(uncachedBookmarks.slice(i, i + batchSize));
  }

  const runner = new ConcurrentRunner(MAX_CONCURRENCY, RATE_LIMIT_PER_SECOND);
  let processedCount = results.size;

  await runner.run(batches, async (batch, batchIndex) => {
    const batchNum = batchIndex + 1;
    sendProgress(processedCount, bookmarks.length, `AI 分类中... (${batchNum}/${batches.length})`);

    try {
      const mapping = await callAI(aiConfig, batch, categoryNames, rootFolderName, template);

      batch.forEach((bookmark, idx) => {
        const category = mapping[String(idx)];
        if (category) {
          results.set(bookmark.id, category);
          urlCategoryMap[bookmark.url] = category;
        }
      });
      processedCount += batch.length;
    } catch (error) {
      console.error(`批次 ${batchNum} AI 分类失败:`, error);
    }
  });

  // 保存到缓存
  if (Object.keys(urlCategoryMap).length > 0) {
    await setCachedCategories(urlCategoryMap);
  }

  return results;
}

// ============================
// 重复书签检测
// ============================
async function findDuplicateBookmarks(options = {}) {
  const { similarityThreshold: simThreshold = 1.0, excludedFolders = [], ignoreQuery = false, ignoreHash = true } = options;
  const tree = await chrome.bookmarks.getTree();
  const allBookmarks = [];

  // 构建排除文件夹的 ID Set
  const excludedIds = new Set();
  if (excludedFolders.length > 0) {
    const findExcludedIds = (node) => {
      if (excludedFolders.includes(node.title) && !node.url) {
        // 这是一个一级排除文件夹，标记其自身和所有子节点
        const markAll = (n) => {
          excludedIds.add(n.id);
          if (n.children) n.children.forEach(markAll);
        };
        markAll(node);
        return; // 剪枝，不再深入查找（因为已经全包了）
      }
      if (node.children) node.children.forEach(findExcludedIds);
    };
    findExcludedIds(tree[0]);
  }

  function collectBookmarks(node) {
    if (excludedIds.has(node.id)) return; // 排除在外的文件夹及其子项

    if (node.url) {
      allBookmarks.push({
        id: node.id,
        title: node.title,
        url: node.url,
        parentId: node.parentId,
        dateAdded: node.dateAdded
      });
    }
    if (node.children) {
      node.children.forEach(collectBookmarks);
    }
  }
  collectBookmarks(tree[0]);

  // 按域名分组以优化性能
  const domainMap = new Map();
  for (const b of allBookmarks) {
    const domain = getDomain(b.url);
    if (!domainMap.has(domain)) domainMap.set(domain, []);
    domainMap.get(domain).push(b);
  }

  const duplicates = [];

  for (const [domain, group] of domainMap) {
    if (group.length < 2) continue;

    // 预处理：计算归一化 URL
    // Wrap bookmarks to cache cleaned URL
    const processedGroup = group.map(b => {
      let u = b.url;
      try {
        const urlObj = new URL(u);
        if (ignoreQuery) urlObj.search = "";
        if (ignoreHash) urlObj.hash = "";
        u = urlObj.toString();
      } catch (e) { }
      return {
        bookmark: b,
        cleanUrl: normalizeUrlV2(u)
      };
    });

    // 如果阈值为 1.0，使用快速的精确匹配
    if (simThreshold >= 1.0) {
      const urlMap = new Map();
      for (const item of processedGroup) {
        if (!urlMap.has(item.cleanUrl)) urlMap.set(item.cleanUrl, []);
        urlMap.get(item.cleanUrl).push(item.bookmark);
      }
      for (const [u, list] of urlMap) {
        if (list.length > 1) {
          duplicates.push({
            url: list[0].url, // 代表 URL (原始)
            bookmarks: list.sort((a, b) => (a.dateAdded || 0) - (b.dateAdded || 0))
          });
        }
      }
    } else {
      // 模糊匹配 (O(N^2) within domain)
      const used = new Set();
      for (let i = 0; i < processedGroup.length; i++) {
        if (used.has(i)) continue;
        const current = processedGroup[i];
        const localDups = [current.bookmark];

        for (let j = i + 1; j < processedGroup.length; j++) {
          if (used.has(j)) continue;
          const other = processedGroup[j];

          // 计算 URL 相似度
          const sim = calculateSimilarity(current.cleanUrl, other.cleanUrl);
          if (sim >= simThreshold) {
            localDups.push(other.bookmark);
            used.add(j);
          }
        }

        if (localDups.length > 1) {
          duplicates.push({
            url: current.bookmark.url,
            bookmarks: localDups.sort((a, b) => (a.dateAdded || 0) - (b.dateAdded || 0))
          });
        }
      }
    }
  }

  return duplicates;
}

async function scanDeadLinks(onProgress) {
  const tree = await chrome.bookmarks.getTree();
  const allBookmarks = [];

  function collect(node) {
    if (node.url && !node.url.startsWith('javascript:') && !node.url.startsWith('chrome:')) {
      allBookmarks.push(node);
    }
    if (node.children) node.children.forEach(collect);
  }
  collect(tree[0]);

  const deadLinks = [];
  const runner = new ConcurrentRunner(5, 10); // 5并发, 10/s

  let completed = 0;
  await runner.run(allBookmarks, async (bookmark) => {
    const isAlive = await checkUrlAlive(bookmark.url);
    if (!isAlive) {
      deadLinks.push(bookmark);
    }
    completed++;
    if (onProgress) onProgress(completed, allBookmarks.length);
  });

  return deadLinks;
}

async function mergeDuplicates(duplicates, keepFirst = true) {
  const removed = [];

  for (const dup of duplicates) {
    const toRemove = keepFirst ? dup.bookmarks.slice(1) : dup.bookmarks.slice(0, -1);
    for (const bookmark of toRemove) {
      try {
        await chrome.bookmarks.remove(bookmark.id);
        removed.push(bookmark);
      } catch (error) {
        console.error(`删除重复书签失败: ${bookmark.id}`, error);
      }
    }
  }

  return removed;
}

// ============================
// 预览功能
// ============================
async function getPreviewData(options = {}) {
  const { mode = "keyword", incrementalOnly = false, excludedFolders = [] } = options;
  const { rules, rootFolderName, aiConfig } = await getSettings();
  const tree = await chrome.bookmarks.getTree();
  const root = tree[0];
  const parentId = findDefaultParentId(root);

  const cache = new Map();
  const categoryRootId = await ensureRootFolder(parentId, rootFolderName, cache);
  const matchRule = buildMatcher(rules);
  const categoryNames = rules.map(r => r.name);

  const allBookmarks = [];
  const bookmarksInAuto = new Set();
  const processedBookmarks = incrementalOnly ? await getProcessedBookmarks() : {};

  // 构建排除文件夹的 ID Set
  const excludedIds = new Set();
  if (excludedFolders.length > 0) {
    const findExcludedIds = (node) => {
      if (excludedFolders.includes(node.title) && !node.url) {
        const markAll = (n) => {
          excludedIds.add(n.id);
          if (n.children) n.children.forEach(markAll);
        };
        markAll(node);
        return;
      }
      if (node.children) node.children.forEach(findExcludedIds);
    };
    findExcludedIds(tree[0]);
  }

  function collectBookmarks(node, isInAuto) {
    if (excludedIds.has(node.id)) return; // 排除在外的文件夹及其子项

    const inAuto = isInAuto || node.id === categoryRootId;
    if (node.url) {
      if (inAuto) {
        bookmarksInAuto.add(node.id);
      } else {
        // 增量模式：检查是否已处理
        if (incrementalOnly) {
          const processed = processedBookmarks[node.id];
          if (processed && processed.url === node.url) {
            return; // 跳过已处理且未变化的书签
          }
        }
        allBookmarks.push(node);
      }
    }
    if (node.children) {
      for (const child of node.children) {
        collectBookmarks(child, inAuto);
      }
    }
  }

  collectBookmarks(root, false);

  // 获取预览分类
  const previewItems = [];

  // 在 AI 或混合模式下，获取缓存
  let aiCache = null;
  if (mode === "ai" || mode === "hybrid") {
    aiCache = await getAiCache();
  }

  for (const bookmark of allBookmarks) {
    let category = null;
    let matchType = "none";
    let matchedKeyword = null;

    // 关键词匹配
    if (mode === "keyword" || mode === "hybrid") {
      category = matchRule(bookmark);
      if (category) {
        matchType = "keyword";
        // 找到匹配的关键词
        for (const rule of rules) {
          if (rule.name === category) {
            for (const kw of rule.keywords) {
              const text = normalize(`${bookmark.title} ${bookmark.url}`);
              const nKw = normalize(kw);

              // 使用正则进行全字匹配检查 (针对 ASCII)
              // 如果关键词全是 ASCII，则使用 \b 边界；否则使用 simple includes
              const isAscii = /^[\x00-\x7F]+$/.test(nKw);

              if (isAscii) {
                // 转义正则特殊字符
                const escapedKw = nKw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const regex = new RegExp(`\\b${escapedKw}\\b`);
                if (regex.test(text)) {
                  matchedKeyword = kw;
                  break;
                }
              } else {
                if (text.includes(nKw)) {
                  matchedKeyword = kw;
                  break;
                }
              }
            }
            break;
          }
        }
      }
    }

    // AI 缓存查询（仅在未被关键词匹配时）
    if (!category && (mode === "ai" || mode === "hybrid") && aiCache) {
      const urlHash = hashUrl(bookmark.url);
      const cached = aiCache[urlHash];
      if (cached && cached.category) {
        category = cached.category;
        matchType = "ai-cached";
        matchedKeyword = "AI 缓存";
      } else {
        // 标记为待 AI 处理
        matchType = "ai-pending";
        matchedKeyword = "待 AI 分类";
      }
    }

    previewItems.push({
      id: bookmark.id,
      title: bookmark.title,
      url: bookmark.url,
      category,
      matchType,
      matchedKeyword,
      parentId: bookmark.parentId
    });
  }

  return {
    items: previewItems,
    skipped: bookmarksInAuto.size,
    total: allBookmarks.length,
    rootFolderName,
    categoryNames
  };
}


// ============================
// 主整理逻辑
// ============================
async function organizeBookmarks({ dryRun, mode = "keyword", incrementalOnly = false, groupByDomain = false, excludedFolders = [], template = "general" }) {
  const { rules, rootFolderName, aiConfig } = await getSettings();
  sendProgress(0, 0, "正在读取书签...");
  const tree = await chrome.bookmarks.getTree();
  const root = tree[0];
  const parentId = findDefaultParentId(root);

  const cache = new Map();
  const categoryRootId = await ensureRootFolder(parentId, rootFolderName, cache);
  const matchRule = buildMatcher(rules);
  const categoryNames = rules.map(r => r.name);

  const stats = {
    moved: 0,
    matched: 0,
    skipped: 0,
    unmatched: 0,
    aiProcessed: 0,
    cached: 0,
    categories: {}
  };

  const sendProgress = (current, total, message) => {
    chrome.runtime.sendMessage({
      type: "organize-progress",
      current,
      total,
      message
    }).catch(() => { });
  };

  const allBookmarks = [];
  const bookmarksInAuto = new Set();
  const processedBookmarks = incrementalOnly ? await getProcessedBookmarks() : {};

  // 构建排除文件夹的 ID Set
  const excludedIds = new Set();
  if (excludedFolders.length > 0) {
    const findExcludedIds = (node) => {
      if (excludedFolders.includes(node.title) && !node.url) {
        const markAll = (n) => {
          excludedIds.add(n.id);
          if (n.children) n.children.forEach(markAll);
        };
        markAll(node);
        return;
      }
      if (node.children) node.children.forEach(findExcludedIds);
    };
    findExcludedIds(tree[0]);
  }

  function collectBookmarks(node, isInAuto) {
    if (excludedIds.has(node.id)) return; // 排除在外的文件夹及其子项

    const inAuto = isInAuto || node.id === categoryRootId;
    if (node.url) {
      if (inAuto) {
        bookmarksInAuto.add(node.id);
      } else {
        if (incrementalOnly) {
          const processed = processedBookmarks[node.id];
          if (processed && processed.url === node.url) {
            stats.skipped += 1;
            return;
          }
        }
        allBookmarks.push(node);
      }
    }
    if (node.children) {
      for (const child of node.children) {
        collectBookmarks(child, inAuto);
      }
    }
  }

  collectBookmarks(root, false);
  stats.skipped += bookmarksInAuto.size;

  const bookmarkCategories = new Map();
  const moveHistory = []; // 记录移动历史

  if (mode === "keyword") {
    for (const bookmark of allBookmarks) {
      const category = matchRule(bookmark);
      if (category) {
        bookmarkCategories.set(bookmark.id, category);
        stats.matched += 1;
      } else {
        stats.unmatched += 1;
      }
    }
  } else if (mode === "ai") {
    if (!aiConfig.apiKey) {
      throw new Error("未配置 AI API 密钥");
    }

    const aiResults = await aiClassifyBookmarks(allBookmarks, aiConfig, categoryNames, sendProgress, template);

    for (const bookmark of allBookmarks) {
      const category = aiResults.get(bookmark.id);
      if (category) {
        bookmarkCategories.set(bookmark.id, category);
        stats.matched += 1;
        stats.aiProcessed += 1;
      } else {
        stats.unmatched += 1;
      }
    }
  } else if (mode === "hybrid") {
    const unmatchedBookmarks = [];

    for (const bookmark of allBookmarks) {
      const category = matchRule(bookmark);
      if (category) {
        bookmarkCategories.set(bookmark.id, category);
        stats.matched += 1;
      } else {
        unmatchedBookmarks.push(bookmark);
      }
    }

    if (unmatchedBookmarks.length > 0 && aiConfig.apiKey) {
      const aiResults = await aiClassifyBookmarks(unmatchedBookmarks, aiConfig, categoryNames, sendProgress, template);

      for (const bookmark of unmatchedBookmarks) {
        const category = aiResults.get(bookmark.id);
        if (category) {
          bookmarkCategories.set(bookmark.id, category);
          stats.matched += 1;
          stats.aiProcessed += 1;
        } else {
          stats.unmatched += 1;
        }
      }
    } else {
      stats.unmatched += unmatchedBookmarks.length;
    }
  }



  sendProgress(0, bookmarkCategories.size, "计算目标位置...");

  // ==========================================
  // 域名分组优化 (Domain Grouping)
  // ==========================================
  // Map<BookmarkID, ParentID>
  const targetParents = new Map();
  const folderCache = new Map(); // Cache for folder creation

  // 1. 预处理：按目标分类分组
  // Map<CategoryName, Array<Bookmark>>
  const categoryGroups = new Map();

  for (const [bookmarkId, category] of bookmarkCategories) {
    if (!categoryGroups.has(category)) {
      categoryGroups.set(category, []);
    }
    const bookmark = allBookmarks.find(b => b.id === bookmarkId);
    if (bookmark) {
      categoryGroups.get(category).push(bookmark);
    }
  }

  const DOMAIN_THRESHOLD = 3; // 至少3个同域名书签才建组

  let processedCount = 0;
  const totalCount = bookmarkCategories.size;

  for (const [category, bookmarks] of categoryGroups) {
    // 获取/创建分类根目录 (支持 "主分类/子分类" 格式)
    // 关键修正：传递 dryRun 参数，防止在预演时创建真实空文件夹
    const categoryId = await ensureCategoryPath(categoryRootId, category, folderCache, dryRun);

    // 如果启用了域名分组
    if (groupByDomain) {
      const domainMap = new Map();

      // 对该分类下的书签按域名归类
      for (const b of bookmarks) {
        const domain = getDomain(b.url);
        if (domain) {
          if (!domainMap.has(domain)) domainMap.set(domain, []);
          domainMap.get(domain).push(b);
        } else {
          // 无域名，直接放入分类根目录
          targetParents.set(b.id, categoryId);
        }
      }

      // 处理每个域名
      for (const [domain, domainBookmarks] of domainMap) {
        if (domainBookmarks.length >= DOMAIN_THRESHOLD) {
          // 创建域名子文件夹
          const subFolderId = await ensureFolder(categoryId, domain, folderCache, dryRun);
          for (const b of domainBookmarks) targetParents.set(b.id, subFolderId);
        } else {
          // 数量不够，直接放入分类根目录
          for (const b of domainBookmarks) targetParents.set(b.id, categoryId);
        }
      }
    } else {
      // 未启用域名分组，全部直接放入分类根目录
      for (const b of bookmarks) targetParents.set(b.id, categoryId);
    }
  }

  // ==========================================
  // 执行移动
  // ==========================================
  sendProgress(0, totalCount, "移动书签中...");
  let moveIndex = 0;

  for (const [bookmarkId, targetParentId] of targetParents) {
    const bookmark = allBookmarks.find(b => b.id === bookmarkId);

    if (bookmark && bookmark.parentId === targetParentId) {
      stats.skipped += 1;
      continue; // 已经在正确位置
    }

    if (!dryRun) {
      // 检查 categoryId 和 subFolderId 是否为 fake ID
      // 如果是 fake ID，说明本该创建但还没创建，无法移动。
      // 但 dryRun 为 false 时 ensureFolder 应该返回真实 ID。
      // 为保险起见，加一个简单的 check (理论上不会触发，除非逻辑 bug)
      if (targetParentId && targetParentId.startsWith && targetParentId.startsWith('dry-run')) {
        console.error("Critical: Trying to move bookmark to a dry-run fake folder!", bookmarkId, targetParentId);
        continue;
      }

      // 记录原位置（用于撤销）
      if (bookmark) {
        moveHistory.push({
          id: bookmarkId,
          fromParentId: bookmark.parentId,
          toParentId: targetParentId,
          title: bookmark.title,
          url: bookmark.url
        });

        // 执行移动
        await chrome.bookmarks.move(bookmarkId, { parentId: targetParentId });
      }
    }
    stats.moved += 1;

    // 统计分类计数
    // 注意：这里我们统计的是顶层分类
    const category = bookmarkCategories.get(bookmarkId);
    if (category) {
      stats.categories[category] = (stats.categories[category] || 0) + 1;
    }

    moveIndex++;
    if (moveIndex % 5 === 0) {
      sendProgress(moveIndex, totalCount, `移动书签中... ${moveIndex}/${totalCount}`);
    }
  }

  // 保存操作历史
  if (!dryRun && moveHistory.length > 0) {
    historyStack.push({
      type: "organize",
      timestamp: Date.now(),
      data: moveHistory
    });
    await saveHistory();

    // 标记书签为已处理（用于增量整理）
    // 简单实现：将所有涉及的书签 ID 存入已处理列表
    // 实际应该标记 URL 或其他
  }

  return { success: true, stats };
}

// ============================
// 撤销整理
// ============================// 撤销上一次操作
async function undoLastOrganize() {
  const lastOp = historyStack.pop();
  if (!lastOp) return { success: false, message: "没有可撤销的操作" };

  try {
    let undoCount = 0;

    if (lastOp.type === "organize") {
      // 撤销整理：将书签移回原文件夹
      const moves = lastOp.data;
      for (let i = moves.length - 1; i >= 0; i--) {
        const move = moves[i];
        try {
          // 检查目标位置是否存在，如果原父文件夹被删了，可能需要重新创建或者放入根目录
          // 这里简单处理：尝试移回
          await chrome.bookmarks.move(move.id, { parentId: move.fromParentId });
          undoCount++;
        } catch (e) {
          console.warn(`Undo move failed for ${move.id}:`, e);
        }
      }
    } else if (lastOp.type === "merge") {
      // 撤销合并：重建被删的源文件夹，将书签移回
      // data: [{ sourceId, sourceTitle, targetId, movedChildren: [{id, parentId}] }]
      // 实际上 mergeFolders 记录的数据结构需要包含所有被移动子项的信息
      const merges = lastOp.data;
      for (const merge of merges) {
        // 1. 重建源文件夹 (我们无法恢复原来的 ID，只能新建)
        // 暂时假设 targetId 还在
        const created = await chrome.bookmarks.create({
          parentId: merge.parentOfSource, // 需要在 merge 时记录
          title: merge.sourceTitle
        });

        // 2. 将子项移回
        for (const childId of merge.movedChildrenIds) {
          try {
            await chrome.bookmarks.move(childId, { parentId: created.id });
            undoCount++;
          } catch (e) { console.warn(e); }
        }
      }
    } else if (lastOp.type === "clean") {
      // 撤销清理：重建被删的空文件夹
      // data: [{ parentId, title }]
      const folders = lastOp.data;
      for (const f of folders) {
        try {
          await chrome.bookmarks.create({ parentId: f.parentId, title: f.title });
          undoCount++;
        } catch (e) { console.warn(e); }
      }
    }

    await saveHistory();
    return { success: true, count: undoCount, type: lastOp.type };
  } catch (error) {
    console.error("Undo failed:", error);
    // 尽量恢复栈
    historyStack.push(lastOp);
    return { success: false, error: error.message };
  }
}

// ============================
// 定时整理
// ============================
async function setupSchedule(config) {
  // 清除现有定时器
  await chrome.alarms.clear("auto-organize");

  if (!config.enabled) {
    return { success: true, message: "定时整理已禁用" };
  }

  const intervals = {
    daily: 24 * 60,
    weekly: 7 * 24 * 60,
    monthly: 30 * 24 * 60
  };

  const periodInMinutes = intervals[config.interval] || intervals.daily;

  await chrome.alarms.create("auto-organize", {
    periodInMinutes,
    delayInMinutes: 1 // 首次延迟1分钟执行
  });

  // 保存配置
  await chrome.storage.sync.set({ scheduleConfig: config });

  return { success: true, message: `定时整理已设置为每${config.interval === "daily" ? "天" : config.interval === "weekly" ? "周" : "月"}执行` };
}

// 定时器触发
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === "auto-organize") {
    const { scheduleConfig } = await getSettings();

    try {
      const stats = await organizeBookmarks({
        dryRun: false,
        mode: scheduleConfig.mode || "keyword",
        incrementalOnly: true
      });

      // 发送通知
      chrome.notifications.create({
        type: "basic",
        iconUrl: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><path fill='%233B82F6' d='M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z'/></svg>",
        title: "书签整理完成",
        message: `已整理 ${stats.moved} 个书签，分到 ${Object.keys(stats.categories).length} 个分类`
      });
    } catch (error) {
      console.error("定时整理失败:", error);
    }
  }
});

// ============================
// 快捷键支持
// ============================
chrome.commands.onCommand.addListener(async (command) => {
  if (command === "quick-organize") {
    try {
      const stats = await organizeBookmarks({
        dryRun: true, // 默认预演模式
        mode: "keyword",
        incrementalOnly: false
      });

      chrome.notifications.create({
        type: "basic",
        iconUrl: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><path fill='%233B82F6' d='M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z'/></svg>",
        title: "书签预览完成",
        message: `匹配 ${stats.matched} 个书签，可移动到 ${Object.keys(stats.categories).length} 个分类`
      });
    } catch (error) {
      chrome.notifications.create({
        type: "basic",
        iconUrl: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><path fill='%23EF4444' d='M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z'/></svg>",
        title: "书签整理失败",
        message: error.message || "未知错误"
      });
    }
  }
});

// ============================
// 事件监听
// ============================
chrome.runtime.onInstalled.addListener(async () => {
  await getSettings();

  // 恢复定时任务设置
  const { scheduleConfig } = await getSettings();
  if (scheduleConfig && scheduleConfig.enabled) {
    await setupSchedule(scheduleConfig);
  }
});

async function findSimilarFolders(rootFolderName) {
  console.log("[Background] findSimilarFolders searching under root:", rootFolderName);
  const categories = await collectExistingCategories(rootFolderName);
  console.log("[Background] Collected categories:", categories.length, categories);
  const potentialMerges = [];

  for (let i = 0; i < categories.length; i++) {
    for (let j = i + 1; j < categories.length; j++) {
      const a = categories[i];
      const b = categories[j];

      // 计算相似度
      const distance = levenshteinDistance(a.toLowerCase(), b.toLowerCase());
      const maxLength = Math.max(a.length, b.length);
      const similarity = 1 - distance / maxLength;

      console.log(`[Background] Comparing "${a}" vs "${b}" -> Similarity: ${similarity.toFixed(2)}`);

      // 相似度阈值 0.7，且长度差不宜过大
      if (similarity > 0.7) {
        potentialMerges.push({
          target: a.length < b.length ? a : b, // 短的通常是缩写，作为保留目标？或者长的更具体？
          // 策略：保留较短的，或者让用户选。这里简单起见，把 B 合并到 A
          folderA: a,
          folderB: b,
          similarity
        });
      }
    }
  }
  return potentialMerges;
}

async function mergeFolders(merges) {
  // 获取排除名单
  const { excludedFolders = [] } = await getSettings();

  let count = 0;
  const undoData = []; // [{ sourceTitle, parentOfSource, movedChildrenIds: [] }]

  const tree = await chrome.bookmarks.getTree();
  // 重新实现的查找函数，返回节点对象以便获取 parentId
  const findFolderNode = (root, name) => {
    const queue = [root];
    while (queue.length > 0) {
      const node = queue.shift();
      if (node.title === name && !node.url) return node;
      if (node.children) queue.push(...node.children);
    }
    return null;
  };

  for (const merge of merges) {
    // 检查是否被排除
    if (excludedFolders.includes(merge.folderA) || excludedFolders.includes(merge.folderB)) {
      continue;
    }

    const sourceNode = findFolderNode(tree[0], merge.folderB);
    const targetNode = findFolderNode(tree[0], merge.folderA);

    if (sourceNode && targetNode) {
      const sourceId = sourceNode.id;
      const targetId = targetNode.id;

      const children = await chrome.bookmarks.getChildren(sourceId);
      const movedIds = [];

      for (const child of children) {
        await chrome.bookmarks.move(child.id, { parentId: targetId });
        movedIds.push(child.id);
      }

      // 记录撤销数据
      undoData.push({
        sourceTitle: sourceNode.title,
        parentOfSource: sourceNode.parentId,
        movedChildrenIds: movedIds
      });

      await chrome.bookmarks.remove(sourceId);
      count++;
    }
  }

  // 存入历史
  if (count > 0) {
    historyStack.push({
      type: "merge",
      timestamp: Date.now(),
      data: undoData
    });
    await saveHistory();
  }

  return { success: true, count };
}

async function cleanEmptyFolders(dryRun = false) {
  // 获取排除名单
  const { excludedFolders = [] } = await getSettings();

  let count = 0;
  const deletedFolders = []; // [{ parentId, title }]
  const tree = await chrome.bookmarks.getTree();

  const candidates = [];

  // 递归遍历，传入父路径名称以构建完整路径
  const traverse = (node, parentPath) => {
    // 根节点不需要路径前缀
    // 注意：root (id:0) 的 title 可能是空字符串
    let currentPath = parentPath;
    if (node.title) {
      currentPath = parentPath ? `${parentPath} > ${node.title}` : node.title;
    }

    // 排除特定文件夹
    if (excludedFolders.includes(node.title) && !node.url) return;

    if (node.children) {
      node.children.forEach(child => traverse(child, currentPath));

      // 不删除根节点和基础分类根
      // id '0'=root, '1'=Bookmarks Bar, '2'=Other Bookmarks, '3'=Mobile
      if (!node.url && !['0', '1', '2', '3'].includes(node.id)) {
        if (node.children.length === 0) {
          // 记录完整路径，帮助用户区分
          // parentPath 即为该文件夹所在的路径
          node.fullPath = parentPath || "根目录";
          candidates.push(node);
        }
      }
    }
  };
  traverse(tree[0], "");

  if (dryRun) {
    return { success: true, count: candidates.length, candidates };
  }

  for (const node of candidates) {
    try {
      // 记录撤销数据
      deletedFolders.push({ parentId: node.parentId, title: node.title });
      await chrome.bookmarks.remove(node.id);
      count++;
    } catch (e) { console.error(e); }
  }

  if (count > 0) {
    historyStack.push({
      type: "clean",
      timestamp: Date.now(),
      data: deletedFolders
    });
    await saveHistory();
  }

  return { success: true, count };
}

// 消息监听
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const handleAsync = async () => {
    switch (message?.type) {
      case "scan-similar-folders":
        console.log("[Background] Received 'scan-similar-folders'");
        const root = await getSettings("rootFolderName");
        console.log("[Background] Root folder name:", root);
        return findSimilarFolders(root);

      case "merge-folders":
        return mergeFolders(message.merges);

      case "clean-empty-folders":
        return cleanEmptyFolders(message.dryRun);

      case "organize-bookmarks":
        return organizeBookmarks({
          dryRun: Boolean(message.dryRun),
          mode: message.mode || "keyword",
          incrementalOnly: Boolean(message.incrementalOnly),
          groupByDomain: Boolean(message.groupByDomain),
          template: message.template || "general"
        });

      case "get-preview":
        return getPreviewData({
          mode: message.mode || "keyword",
          incrementalOnly: Boolean(message.incrementalOnly)
        });

      case "undo-organize":
        return undoLastOrganize();

      case "find-duplicates":
        return findDuplicateBookmarks(message.options);

      case "merge-duplicates":
        return mergeDuplicates(message.duplicates, message.keepFirst !== false);

      case "scan-dead-links":
        return scanDeadLinks((current, total) => {
          chrome.runtime.sendMessage({
            type: "scan-progress",
            current,
            total,
            message: `检测失效链接中... ${current}/${total}`
          }).catch(() => { });
        });

      case "remove-bookmarks":
        const removedIds = [];
        for (const id of message.ids) {
          try {
            await chrome.bookmarks.remove(id);
            removedIds.push(id);
          } catch (e) {
            console.error(`Remove failed: ${id}`, e);
          }
        }
        return { success: true, count: removedIds.length, removedIds };

      case "setup-schedule":
        return setupSchedule(message.config);

      case "get-history":
        return getMoveHistory();

      case "clear-cache":
        await chrome.storage.local.set({ aiCache: {} });
        return { success: true };

      default:
        return null;
    }
  };

  handleAsync()
    .then((result) => {
      if (result !== null) {
        sendResponse({ ok: true, ...result, data: result });
      }
    })
    .catch((error) => {
      sendResponse({ ok: false, error: error?.message || String(error) });
    });

  return true;
});
