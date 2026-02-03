// ============================
// 公共模块 - 书签整理器
// 包含共享的配置、常量和工具函数
// ============================

// ============================
// 默认配置常量
// ============================
export const DEFAULT_RULES = [
    {
        name: "API密钥",
        keywords: ["接口密钥", "密钥", "令牌", "开发者", "控制台", "云", "计费", "api key", "token", "developer", "console", "cloud"]
    },
    {
        name: "人工智能",
        keywords: ["人工智能", "大模型", "模型", "智能体", "提示词", "机器学习", "ai", "llm", "gpt", "chatgpt", "claude", "gemini", "prompt", "model", "huggingface"]
    },
    {
        name: "文档资料",
        keywords: ["文档", "参考", "指南", "手册", "说明", "开发文档", "doc", "docs", "reference", "guide", "manual", "handbook", "tutorial", "wiki", "spec", "api docs"]
    },
    {
        name: "工具平台",
        keywords: ["控制台", "后台", "仪表盘", "平台", "工具", "门户", "dashboard", "admin", "portal", "tool", "utils", "converter", "generator", "formatter", "json", "regex"]
    },
    {
        name: "学习提升",
        keywords: ["课程", "教程", "学习", "训练营", "学院", "课件", "course", "learn", "study", "academy", "tutorial", "education", "mooc", "udemy", "coursera"]
    },
    {
        name: "技术社区",
        keywords: ["github", "gitlab", "stackoverflow", "v2ex", "juejin", "csdn", "segmentfault", "reddit", "hacker news", "dev.to", "medium", "blog", "forum", "community"]
    },
    {
        name: "设计资源",
        keywords: ["设计", "素材", "图标", "字体", "配色", "插画", "design", "ui", "ux", "icon", "font", "color", "palette", "illustration", "figma", "dribbble", "behance"]
    },
    {
        name: "成人内容",
        keywords: ["18+", "R18", "成人", "色情", "H漫", "福利", "里番", "本子", "Porn", "Hentai", "av", "sex", "x-art"]
    }
];

export const DEFAULT_ROOT_FOLDER = "自动归类";
export const LEGACY_ROOT_FOLDER = "Auto-Categorized";

export const DEFAULT_AI_CONFIG = {
    provider: "custom",
    apiUrl: "",
    apiKey: "",
    model: "",
    batchSize: 20,
    prompt: "",
    concurrency: 3,
    cacheExpire: 7,
    useMetadata: false
};

// 预设 AI 服务商配置
export const AI_PROVIDERS = {
    custom: {
        name: "自定义",
        apiUrl: "",
        models: [],
        info: "手动填写 API 地址和模型名称"
    },
    // 国际服务
    openai: {
        name: "OpenAI",
        apiUrl: "https://api.openai.com/v1",
        models: ["gpt-4o-mini", "gpt-4o", "gpt-4-turbo", "gpt-3.5-turbo"],
        info: "获取密钥：https://platform.openai.com/api-keys"
    },
    anthropic: {
        name: "Anthropic",
        apiUrl: "https://api.anthropic.com/v1",
        models: ["claude-3-5-sonnet-20241022", "claude-3-haiku-20240307"],
        info: "获取密钥：https://console.anthropic.com/settings/keys"
    },
    google: {
        name: "Google Gemini",
        apiUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
        models: ["gemini-2.0-flash-exp", "gemini-1.5-flash", "gemini-1.5-pro"],
        info: "获取密钥：https://aistudio.google.com/apikey"
    },
    groq: {
        name: "Groq",
        apiUrl: "https://api.groq.com/openai/v1",
        models: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "mixtral-8x7b-32768"],
        info: "获取密钥：https://console.groq.com/keys（免费）"
    },
    together: {
        name: "Together AI",
        apiUrl: "https://api.together.xyz/v1",
        models: ["meta-llama/Llama-3.3-70B-Instruct-Turbo", "Qwen/Qwen2.5-72B-Instruct-Turbo", "deepseek-ai/DeepSeek-V3"],
        info: "获取密钥：https://api.together.xyz/settings/api-keys"
    },
    openrouter: {
        name: "OpenRouter",
        apiUrl: "https://openrouter.ai/api/v1",
        models: ["deepseek/deepseek-chat", "anthropic/claude-3.5-sonnet", "google/gemini-2.0-flash-exp:free"],
        info: "获取密钥：https://openrouter.ai/keys"
    },
    // 国内服务
    deepseek: {
        name: "DeepSeek",
        apiUrl: "https://api.deepseek.com/v1",
        models: ["deepseek-chat", "deepseek-reasoner"],
        info: "获取密钥：https://platform.deepseek.com/api_keys（低价推荐）"
    },
    zhipu: {
        name: "智谱 AI",
        apiUrl: "https://open.bigmodel.cn/api/paas/v4",
        models: ["glm-4-flash", "glm-4-plus", "glm-4"],
        info: "获取密钥：https://open.bigmodel.cn/usercenter/apikeys"
    },
    moonshot: {
        name: "Moonshot",
        apiUrl: "https://api.moonshot.cn/v1",
        models: ["moonshot-v1-8k", "moonshot-v1-32k", "moonshot-v1-128k"],
        info: "获取密钥：https://platform.moonshot.cn/console/api-keys"
    },
    qwen: {
        name: "通义千问",
        apiUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
        models: ["qwen-turbo", "qwen-plus", "qwen-max"],
        info: "获取密钥：https://dashscope.console.aliyun.com/apiKey"
    },
    baichuan: {
        name: "百川智能",
        apiUrl: "https://api.baichuan-ai.com/v1",
        models: ["Baichuan4", "Baichuan3-Turbo", "Baichuan3-Turbo-128k"],
        info: "获取密钥：https://platform.baichuan-ai.com/console/apikey"
    },
    minimax: {
        name: "MiniMax",
        apiUrl: "https://api.minimax.chat/v1",
        models: ["abab6.5s-chat", "abab6.5g-chat", "abab5.5-chat"],
        info: "获取密钥：https://platform.minimaxi.com/user-center/basic-information/interface-key"
    },
    yi: {
        name: "零一万物",
        apiUrl: "https://api.lingyiwanwu.com/v1",
        models: ["yi-lightning", "yi-large", "yi-medium"],
        info: "获取密钥：https://platform.lingyiwanwu.com/apikeys"
    },
    doubao: {
        name: "豆包",
        apiUrl: "https://ark.cn-beijing.volces.com/api/v3",
        models: ["doubao-pro-32k", "doubao-lite-32k"],
        info: "获取密钥：https://console.volcengine.com/ark"
    },
    spark: {
        name: "讯飞星火",
        apiUrl: "https://spark-api-open.xf-yun.com/v1",
        models: ["4.0Ultra", "generalv3.5", "generalv3"],
        info: "获取密钥：https://console.xfyun.cn/services/bm35"
    },
    // 本地服务
    ollama: {
        name: "Ollama (本地)",
        apiUrl: "http://localhost:11434/v1",
        models: [],
        info: "需先安装 Ollama：https://ollama.com"
    },
    lmstudio: {
        name: "LM Studio (本地)",
        apiUrl: "http://localhost:1234/v1",
        models: [],
        info: "需先安装 LM Studio：https://lmstudio.ai"
    }
};

// 默认 AI 分类提示词
export const DEFAULT_AI_PROMPT = `你是一个专业的书签分类助手。请根据书签的标题和网址，将每个书签分配到最合适的分类中。

可用的分类有：
{CATEGORIES}

规则：
1. 优先使用以上提供的分类。如果书签适合细分，请使用 "主分类/子分类" 格式（例如 "技术社区/前端开发"）。只有当书签完全不符合现有分类时，才创建一个新的中文分类。
2. 对于登录页（login/signin）、主页（home/index）或无意义的页面，如果能推断出所属平台类型，请归类到该平台类型（如 GitHub 登录页 -> "技术社区"）。无法推断则分类为 "未分类"。
3. 请以 JSON 数组格式返回结果，每个元素包含 id 和 category 字段。

示例：[{"id": "1", "category": "文档资料"}, {"id": "2", "category": "工具平台"}]

只返回 JSON 数组，严禁包含 markdown 格式或任何解释性文字。`;

// ============================
// 缓存配置
// ============================
export const CACHE_CONFIG = {
    expireDays: 7,           // 缓存过期天数
    maxEntries: 5000,        // 最大缓存条目
    storageKey: "aiCache"    // 存储键名
};

// ============================
// 历史记录配置
// ============================
export const HISTORY_CONFIG = {
    maxRecords: 10,          // 最多保留的历史记录数
    storageKey: "moveHistory" // 存储键名
};

// ============================
// 定时整理配置
// ============================
export const SCHEDULE_CONFIG = {
    alarmName: "auto-organize",
    intervals: {
        daily: 24 * 60,        // 分钟
        weekly: 7 * 24 * 60,
        monthly: 30 * 24 * 60
    }
};

// ============================
// 并发配置
// ============================
export const CONCURRENT_CONFIG = {
    maxConcurrency: 3,       // 最大并发数
    rateLimit: 5,            // 每秒最大请求数
    retryCount: 3,           // 失败重试次数
    retryDelay: 1000         // 重试延迟（毫秒）
};

// ============================
// 工具函数
// ============================

/**
 * 文本规范化（小写处理）
 * @param {string} text - 输入文本
 * @returns {string} 规范化后的文本
 */
export function normalize(text) {
    return (text || "").toLowerCase();
}

/**
 * 计算 URL 的哈希值（用于缓存键）
 * @param {string} url - URL 地址
 * @returns {string} 哈希字符串
 */
export function hashUrl(url) {
    let hash = 0;
    const str = url || "";
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // 转换为32位整数
    }
    return hash.toString(36);
}

/**
 * 格式化日期
 * @param {Date|number} date - 日期对象或时间戳
 * @returns {string} 格式化的日期字符串
 */
export function formatDate(date) {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const hours = String(d.getHours()).padStart(2, "0");
    const minutes = String(d.getMinutes()).padStart(2, "0");
    return `${year}-${month}-${day} ${hours}:${minutes}`;
}

/**
 * 防抖函数
 * @param {Function} func - 要防抖的函数
 * @param {number} wait - 等待时间（毫秒）
 * @returns {Function} 防抖后的函数
 */
export function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * 延迟函数
 * @param {number} ms - 延迟毫秒数
 * @returns {Promise<void>}
 */
export function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 生成随机颜色（用于图表）
 * @param {number} index - 颜色索引
 * @returns {string} HSL 颜色值
 */
export function generateColor(index) {
    const hue = (index * 137.508) % 360; // 黄金角分布
    return `hsl(${hue}, 70%, 55%)`;
}

/**
 * 截断文本
 * @param {string} text - 原始文本
 * @param {number} maxLength - 最大长度
 * @returns {string} 截断后的文本
 */
export function truncateText(text, maxLength = 50) {
    if (!text || text.length <= maxLength) return text || "";
    return text.slice(0, maxLength - 3) + "...";
}

/**
 * 从 URL 中提取域名
 * @param {string} url - URL string
 * @returns {string} Domain name (e.g., "google.com")
 */
export function getDomain(url) {
    try {
        const u = new URL(url);
        let hostname = u.hostname;
        // 移除 www. 前缀
        if (hostname.startsWith("www.")) {
            hostname = hostname.slice(4);
        }
        return hostname;
    } catch (e) {
        return "";
    }
}


/**
 * HTML 转义，防止 XSS 攻击
 * @param {string} text - 原始文本
 * @returns {string} 转义后的文本
 */
export function escapeHtml(text) {
    if (!text) return "";
    return String(text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}
