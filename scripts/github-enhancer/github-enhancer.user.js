// ==UserScript==
// @name         GitHub/Gitee 增强脚本
// @namespace    http://tampermonkey.net/
// @version      0.3
// @description  利用 build size、dependency graph、commit preview、repo size 和 floating TOC 增强 GitHub 和 Gitee。
// @author       You
// @match        https://github.com/*
// @match        https://gitee.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_registerMenuCommand
// @connect      bundlephobia.com
// @connect      raw.githubusercontent.com
// @connect      api.github.com
// @connect      gitee.com
// @run-at       document-idle
// @noframes
// ==/UserScript==

(function () {
    'use strict';

    // --- Configuration & Logger ---
    // --- 配置 & 日志 ---
    // --- Configuration & Logger ---
    const DEFAULT_TOC_SETTINGS = {
        highlightOffset: 120,
        highlightStyles: {
            activeColorLight: '#0a3069',
            activeColorDark: '#58a6ff',
            bgLight: 'rgba(10,48,105,0.08)',
            bgDark: 'rgba(88,166,255,0.12)',
            fontWeight: '600'
        }
    };

    const DEFAULT_CONFIG = {
        features: {
            buildSize: true,        // 构建大小
            repoSize: true,         // 仓库大小
            toc: true,              // 悬浮目录
            commitPreview: true,    // 提交预览
            dependencyGraph: true,  // 依赖图表
            copyButton: true        // 代码复制按钮
        },
        tocSettings: {
            highlightOffset: DEFAULT_TOC_SETTINGS.highlightOffset,
            highlightStyles: { ...DEFAULT_TOC_SETTINGS.highlightStyles }
        },
        api: {
            bundlephobia: 'https://bundlephobia.com/api/size?package=',
            githubRepo: 'https://api.github.com/repos'
        },
        token: '', // GitHub Personal Access Token
        cacheExpiry: 24 * 60 * 60 * 1000 // 24 hours
    };

    let CONFIG = { ...DEFAULT_CONFIG };
    const CACHE_KEYS_KEY = 'gh_enhancer_cache_keys';
    const TOC_TRANSLATIONS_KEY = 'gh_enhancer_toc_translations';

    const TOC_TRANSLATIONS = {
        'table of contents': '目录',
        'getting started': '快速开始',
        'quick start': '快速开始',
        'release notes': '发布说明',
        'known issues': '已知问题',
        'dev dependencies': '开发依赖',
        'dependencies': '依赖',
        'api reference': 'API 参考',
        'command line': '命令行',
        'contributing': '贡献指南'
    };

    const TOC_WORD_TRANSLATIONS = {
        'overview': '概览',
        'introduction': '简介',
        'intro': '简介',
        'features': '功能',
        'feature': '功能',
        'install': '安装',
        'installation': '安装',
        'setup': '设置',
        'usage': '使用说明',
        'configuration': '配置',
        'config': '配置',
        'options': '选项',
        'examples': '示例',
        'example': '示例',
        'guide': '指南',
        'documentation': '文档',
        'docs': '文档',
        'reference': '参考',
        'faq': '常见问题',
        'changelog': '更新日志',
        'roadmap': '路线图',
        'contributing': '贡献',
        'contribution': '贡献',
        'license': '许可证',
        'credits': '致谢',
        'acknowledgements': '致谢',
        'authors': '作者',
        'support': '支持',
        'security': '安全',
        'requirements': '要求',
        'troubleshooting': '故障排查',
        'known': '已知',
        'issues': '问题',
        'release': '发布',
        'notes': '说明',
        'api': 'API',
        'cli': 'CLI',
        'ci': 'CI',
        'cd': 'CD',
        'ci/cd': 'CI/CD',
        'build': '构建',
        'test': '测试',
        'testing': '测试',
        'deploy': '部署',
        'deployment': '部署',
        'dependencies': '依赖',
        'dev': '开发',
        'table': '目录',
        'contents': '内容'
    };

    const normalizeHeading = (text) => text
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    const isDarkMode = () => {
        const mode = document.documentElement.getAttribute('data-color-mode');
        if (mode === 'dark') return true;
        if (mode === 'light') return false;
        if (mode === 'auto') {
            return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        }
        if (document.body.classList.contains('theme-dark')) return true;
        if (document.body.classList.contains('theme-light')) return false;
        return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    };

    const normalizeTocTranslations = (stored) => {
        let data = stored;
        if (typeof stored === 'string') {
            try {
                data = JSON.parse(stored);
            } catch (e) {
                data = {};
            }
        }
        if (!data || typeof data !== 'object' || Array.isArray(data)) return {};

        const normalized = {};
        Object.keys(data).forEach((key) => {
            const value = data[key];
            if (typeof value !== 'string' || typeof key !== 'string') return;
            const normalizedKey = normalizeHeading(key);
            if (!normalizedKey) return;
            const trimmedValue = value.trim();
            if (!trimmedValue) return;
            normalized[normalizedKey] = trimmedValue;
        });
        return normalized;
    };

    const clampNumber = (value, min, max) => Math.min(max, Math.max(min, value));

    const normalizeTocSettings = (stored) => {
        const normalized = {
            highlightOffset: DEFAULT_TOC_SETTINGS.highlightOffset,
            highlightStyles: { ...DEFAULT_TOC_SETTINGS.highlightStyles }
        };
        if (!stored || typeof stored !== 'object') return normalized;

        if (typeof stored.highlightOffset === 'number' && Number.isFinite(stored.highlightOffset)) {
            normalized.highlightOffset = clampNumber(Math.round(stored.highlightOffset), 0, 300);
        }

        const storedStyles = stored.highlightStyles && typeof stored.highlightStyles === 'object'
            ? stored.highlightStyles
            : {};

        Object.keys(normalized.highlightStyles).forEach((key) => {
            const value = storedStyles[key];
            if (typeof value === 'string' && value.trim()) {
                normalized.highlightStyles[key] = value.trim();
            } else if (key === 'fontWeight' && typeof value === 'number' && Number.isFinite(value)) {
                normalized.highlightStyles[key] = String(Math.round(value));
            }
        });

        return normalized;
    };

    let USER_TOC_TRANSLATIONS = normalizeTocTranslations(
        GM_getValue(TOC_TRANSLATIONS_KEY, {})
    );

    const hasChinese = (text) => /[\u4e00-\u9fff]/.test(text);

    const translateHeading = (text) => {
        const normalized = normalizeHeading(text);
        if (USER_TOC_TRANSLATIONS[normalized]) return USER_TOC_TRANSLATIONS[normalized];
        if (TOC_TRANSLATIONS[normalized]) return TOC_TRANSLATIONS[normalized];

        const tokens = text.match(/[A-Za-z0-9+./#]+/g) || [];
        if (tokens.length === 0) return text;

        let changed = false;
        const translated = tokens.map((token) => {
            const mapped = TOC_WORD_TRANSLATIONS[token.toLowerCase()];
            if (mapped && mapped !== token) changed = true;
            return mapped || token;
        }).join(' ');
        return changed ? translated : text;
    };

    const buildTocText = (text) => {
        const original = text.trim();
        if (!original) return original;
        if (hasChinese(original)) return original;

        const translated = translateHeading(original);
        if (!translated || normalizeHeading(translated) === normalizeHeading(original)) return original;
        return `${translated} / ${original}`;
    };

    const normalizeStoredConfig = (stored) => {
        const features = { ...DEFAULT_CONFIG.features };
        let token = '';
        let tocSettings = normalizeTocSettings(DEFAULT_CONFIG.tocSettings);

        if (stored && typeof stored === 'object') {
            const storedFeatures = stored.features && typeof stored.features === 'object' ? stored.features : {};
            Object.keys(features).forEach((key) => {
                if (typeof storedFeatures[key] === 'boolean') {
                    features[key] = storedFeatures[key];
                }
            });
            if (typeof stored.token === 'string') {
                token = stored.token.trim();
            }
            if (stored.tocSettings) {
                tocSettings = normalizeTocSettings(stored.tocSettings);
            }
        }
        return { features, token, tocSettings };
    };

    // 从存储中加载配置
    const storedConfig = GM_getValue('gh_enhancer_config');
    const normalized = normalizeStoredConfig(storedConfig);
    CONFIG.features = normalized.features;
    CONFIG.token = normalized.token;
    CONFIG.tocSettings = normalized.tocSettings;

    const saveConfig = () => {
        GM_setValue('gh_enhancer_config', {
            features: CONFIG.features,
            token: CONFIG.token,
            tocSettings: CONFIG.tocSettings
        });
    };

    const Logger = {
        log: (msg) => console.log(`[GitHub/Gitee Enhancer] ${msg}`),
        error: (msg) => {
            console.error(`[GitHub/Gitee Enhancer] ${msg}`);
            Toast.error(msg);
        },
        warn: (msg) => console.warn(`[GitHub/Gitee Enhancer] ${msg}`)
    };

    // --- UI 组件 ---
    class Toast {
        static init() {
            if (document.getElementById('gh-enhancer-toast-container')) return;
            const container = document.createElement('div');
            container.id = 'gh-enhancer-toast-container';
            container.style.cssText = `
                position: fixed; top: 20px; right: 20px; z-index: 10001;
                display: flex; flex-direction: column; gap: 10px;
                pointer-events: none;
            `;
            document.body.appendChild(container);
        }

        static show(message, type = 'info', duration = 3000, onClick = null) {
            this.init();
            const container = document.getElementById('gh-enhancer-toast-container');

            const toast = document.createElement('div');
            const bgColors = {
                info: '#0366d6',
                success: '#2ea44f',
                error: '#d73a49',
                warning: '#dbab09'
            };

            toast.style.cssText = `
                background: ${bgColors[type] || bgColors.info};
                color: #fff;
                padding: 10px 16px;
                border-radius: 6px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                font-family: -apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;
                font-size: 14px;
                opacity: 0;
                transform: translateX(20px);
                transition: all 0.3s ease;
                pointer-events: auto;
                max-width: 300px;
                cursor: ${onClick ? 'pointer' : 'default'};
            `;
            toast.textContent = message;

            if (onClick) {
                toast.title = '点击设置';
                toast.addEventListener('click', (e) => {
                    e.stopPropagation();
                    onClick();
                    toast.style.opacity = '0';
                    setTimeout(() => toast.remove(), 300);
                });
            }

            container.appendChild(toast);

            // 动画进入
            requestAnimationFrame(() => {
                toast.style.opacity = '1';
                toast.style.transform = 'translateX(0)';
            });

            setTimeout(() => {
                toast.style.opacity = '0';
                toast.style.transform = 'translateX(20px)';
                toast.addEventListener('transitionend', () => toast.remove());
            }, duration);
        }

        static info(msg) { this.show(msg, 'info'); }
        static success(msg) { this.show(msg, 'success'); }
        static error(msg) { this.show(msg, 'error', 5000); }
    }

    // --- 工具类 ---
    class Utils {
        static async request(url, options = {}) {
            return new Promise((resolve, reject) => {
                const requestOptions = {
                    method: options.method || 'GET',
                    url: url,
                    headers: options.headers || {},
                    onload: (response) => {
                        if (response.status >= 200 && response.status < 300) {
                            resolve(response.responseText);
                        } else {
                            reject(new Error(`Request failed with status ${response.status}`));
                        }
                    },
                    onerror: (err) => reject(err)
                };
                if (typeof options.timeoutMs === 'number' && Number.isFinite(options.timeoutMs)) {
                    requestOptions.timeout = Math.max(0, Math.round(options.timeoutMs));
                    requestOptions.ontimeout = () => reject(new Error('Request timeout'));
                }
                GM_xmlhttpRequest(requestOptions);
            });
        }

        static formatBytes(bytes, decimals = 2) {
            if (bytes === 0) return '0 Bytes';
            const k = 1024;
            const dm = decimals < 0 ? 0 : decimals;
            const sizes = ['Bytes', 'KB', 'MB', 'GB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
        }

        static getCache(key) {
            const cached = GM_getValue(key);
            if (!cached) return null;
            const now = Date.now();
            if (now - cached.timestamp > CONFIG.cacheExpiry) {
                return null;
            }
            return cached.data;
        }

        static setCache(key, data) {
            GM_setValue(key, {
                data: data,
                timestamp: Date.now()
            });
            const keys = GM_getValue(CACHE_KEYS_KEY, []);
            if (Array.isArray(keys) && !keys.includes(key)) {
                keys.push(key);
                GM_setValue(CACHE_KEYS_KEY, keys);
            }
        }

        static clearCache() {
            const keys = GM_getValue(CACHE_KEYS_KEY, []);
            if (Array.isArray(keys)) {
                keys.forEach((key) => {
                    GM_deleteValue(key);
                });
            }
            GM_deleteValue(CACHE_KEYS_KEY);
        }

        static createBadge(label, value, color = '#4c1') {
            const badge = document.createElement('div');
            badge.className = 'gh-enhancer-badge';
            badge.style.cssText = 'display: inline-flex; align-items: center; margin-left: 10px; font-family: -apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif; font-size: 11px; vertical-align: middle;';
            badge.innerHTML = `
                <span style="background:#555; color:#fff; padding: 3px 6px; border-radius: 3px 0 0 3px;">${label}</span>
                <span style="background:${color}; color:#fff; padding: 3px 6px; border-radius: 0 3px 3px 0;">${value}</span>
            `;
            return badge;
        }
    }

    // --- 核心类 ---
    class GitHubEnhancer {
        constructor() {
            this.isGitHub = window.location.hostname.includes('github.com');
            this.isGitee = window.location.hostname.includes('gitee.com');
            this._navTimeout = null;
            this._tocScrollHandler = null;
            this._tocResizeHandler = null;
            this._tocUpdateActive = null;
            this._tocSettingsSaveTimer = null;
            this._tocOffsetLineTimer = null;
            this._commitPreviewMemory = new Map();
            this._commitPreviewInFlight = new Map();
            this.registerMenu();
        }

        setToken() {
            const url = 'https://github.com/settings/tokens/new?description=GitHub%20Enhancer&scopes=public_repo';
            const val = prompt(`请输入 GitHub PAT (获取地址: ${url}):`, CONFIG.token);
            if (val !== null) {
                CONFIG.token = val.trim();
                saveConfig();
                Toast.success('Token 已保存，请刷新页面');
            }
        }

        checkToken() {
            if (this.isGitHub && !CONFIG.token) {
                const tokenUrl = 'https://github.com/settings/tokens/new?description=GitHub%20Enhancer&scopes=public_repo';
                Logger.warn(`GitHub Token 未设置。请设置 Token 以启用所有功能。\n获取链接: ${tokenUrl}`);
                Toast.show('GitHub Token 未设置 (点击设置)', 'warning', 10000, () => this.setToken());
            }
        }

        editTocTranslations() {
            const current = normalizeTocTranslations(GM_getValue(TOC_TRANSLATIONS_KEY, {}));
            const defaultSample = {
                'getting started': '快速开始',
                'usage': '使用说明',
                'release notes': '发布说明'
            };
            const content = Object.keys(current).length > 0 ? current : defaultSample;
            const input = prompt(
                '请输入 JSON 格式的 TOC 翻译映射（英文标题 -> 中文）。示例：\n' +
                '{\n  "getting started": "快速开始"\n}\n\n' +
                '留空或取消则不修改。',
                JSON.stringify(content, null, 2)
            );

            if (input === null) return;
            const trimmed = input.trim();
            if (!trimmed) {
                Toast.error('未输入内容，未修改。');
                return;
            }

            let parsed;
            try {
                parsed = JSON.parse(trimmed);
            } catch (e) {
                Toast.error('JSON 解析失败，请检查格式。');
                return;
            }

            const normalized = normalizeTocTranslations(parsed);
            GM_setValue(TOC_TRANSLATIONS_KEY, normalized);
            USER_TOC_TRANSLATIONS = normalized;
            this.removeTOC();
            if (CONFIG.features.toc) this.featureTOC();
            Toast.success('TOC 翻译已保存并刷新。');
        }

        editTocHighlightSettings() {
            const current = CONFIG.tocSettings ? normalizeTocSettings(CONFIG.tocSettings) : normalizeTocSettings(null);
            const input = prompt(
                '请输入 JSON 格式的 TOC 高亮设置。\n' +
                '字段说明：\n' +
                '- highlightOffset: 触发高亮的顶部偏移(px)\n' +
                '- highlightStyles: 高亮样式配置\n\n' +
                '示例：\n' +
                '{\n' +
                '  "highlightOffset": 120,\n' +
                '  "highlightStyles": {\n' +
                '    "activeColorLight": "#0a3069",\n' +
                '    "activeColorDark": "#58a6ff",\n' +
                '    "bgLight": "rgba(10,48,105,0.08)",\n' +
                '    "bgDark": "rgba(88,166,255,0.12)",\n' +
                '    "fontWeight": "600"\n' +
                '  }\n' +
                '}\n\n' +
                '留空或取消则不修改。',
                JSON.stringify(current, null, 2)
            );

            if (input === null) return;
            const trimmed = input.trim();
            if (!trimmed) {
                Toast.error('未输入内容，未修改。');
                return;
            }

            let parsed;
            try {
                parsed = JSON.parse(trimmed);
            } catch (e) {
                Toast.error('JSON 解析失败，请检查格式。');
                return;
            }

            const normalized = normalizeTocSettings(parsed);
            CONFIG.tocSettings = normalized;
            saveConfig();
            this.removeTOC();
            if (CONFIG.features.toc) this.featureTOC();
            Toast.success('TOC 高亮设置已保存并刷新。');
        }

        registerMenu() {
            const toggle = (key, name) => {
                const status = CONFIG.features[key] ? '✅' : '❌';
                GM_registerMenuCommand(`${status} ${name}`, () => {
                    CONFIG.features[key] = !CONFIG.features[key];
                    saveConfig();
                    location.reload();
                });
            };

            toggle('buildSize', 'Build Size');
            toggle('repoSize', 'Repo Size');
            toggle('toc', '浮动目录 / Floating TOC');
            toggle('commitPreview', 'Commit Preview');
            toggle('dependencyGraph', 'Dependency Graph');
            toggle('copyButton', 'Code Copy Button');

            GM_registerMenuCommand('🔑 设置 GitHub Token', () => {
                this.setToken();
            });
            GM_registerMenuCommand('🧹 清空缓存 / Clear Cache', () => {
                Utils.clearCache();
                Toast.success('缓存已清空');
            });
            GM_registerMenuCommand('🧩 自定义 TOC 翻译 / TOC Translation', () => {
                this.editTocTranslations();
            });
            GM_registerMenuCommand('🎯 TOC 高亮设置 / TOC Highlight', () => {
                this.editTocHighlightSettings();
            });
        }

        init() {
            Logger.log('Initializing...');
            Toast.success('GitHub Enhancer Loaded');
            this.checkToken();
            this.setupNavigationObserver();
            // 初始运行
            this.run();
        }

        setupNavigationObserver() {
            // 1. Monkey-patch History API (历史记录 API 补丁)
            const wrapHistory = (type) => {
                const orig = history[type];
                return (...args) => {
                    const rv = orig.apply(history, args);
                    this.onNavigate();
                    return rv;
                };
            };
            history.pushState = wrapHistory('pushState');
            history.replaceState = wrapHistory('replaceState');
            window.addEventListener('popstate', () => this.onNavigate());

            // 2. GitHub Turbo / Pjax 事件
            document.addEventListener('turbo:load', () => this.onNavigate());
            document.addEventListener('pjax:end', () => this.onNavigate());

            // 3. MutationObserver 回退 (用于检测标题变化)
            const titleObserver = new MutationObserver(() => {
                this.onNavigate();
            });
            const title = document.querySelector('title');
            if (title) titleObserver.observe(title, { childList: true });
        }

        onNavigate() {
            if (this._navTimeout) clearTimeout(this._navTimeout);
            this._navTimeout = setTimeout(() => {
                Logger.log('检测到导航。正在重新运行功能...');
                this.run();
            }, 500);
        }

        async run() {
            // 如果部分导航未清除，则移除旧的 TOC
            this.removeTOC();

            // 根据配置运行功能
            if (CONFIG.features.buildSize) this.safeRun(this.featureBuildSize.bind(this), 'BuildSize');
            if (CONFIG.features.dependencyGraph) this.safeRun(this.featureDependencyGraph.bind(this), 'DependencyGraph');
            if (CONFIG.features.commitPreview) this.safeRun(this.featureCommitPreview.bind(this), 'CommitPreview');
            if (CONFIG.features.repoSize) this.safeRun(this.featureRepoSize.bind(this), 'RepoSize');
            if (CONFIG.features.toc) this.safeRun(this.featureTOC.bind(this), 'TOC');
            if (CONFIG.features.copyButton) this.safeRun(this.featureCopyButton.bind(this), 'CopyButton');
        }

        async safeRun(fn, name) {
            try {
                await fn();
            } catch (e) {
                Logger.warn(`${name} Error: ${e.message}`);
            }
        }

        // --- 共享助手 ---
        getPackageJsonUrl() {
            if (this.isGitHub) {
                const fileLink = document.querySelector('a[title="package.json"]') ||
                    Array.from(document.querySelectorAll('.js-navigation-open')).find(el => el.textContent.trim() === 'package.json');

                if (fileLink) return fileLink.href.replace('/blob/', '/raw/');
            } else if (this.isGitee) {
                const fileLink = document.querySelector('a[title="package.json"]') ||
                    Array.from(document.querySelectorAll('.file_name a')).find(l => l.textContent.trim() === 'package.json');

                if (fileLink) return fileLink.href.replace('/blob/', '/raw/');
            }
            return null;
        }

        getRepoIdentifier() {
            const pathParts = window.location.pathname.split('/').filter(Boolean);
            if (pathParts.length >= 2) {
                return { owner: pathParts[0], repo: pathParts[1] };
            }
            return null;
        }

        // --- Feature: Repo Size ---
        async featureRepoSize() {
            if (document.getElementById('gh-enhancer-repo-size')) return;

            // 位置
            // GitHub: .pagehead-actions (Star/Fork 区域)
            // Gitee: .git-project-header-actions
            const container = this.isGitHub
                ? document.querySelector('.pagehead-actions')
                : document.querySelector('.git-project-header-actions');

            if (!container) {
                Logger.warn('RepoSize: Container not found');
                return;
            }

            const { owner, repo } = this.getRepoIdentifier() || {};
            if (!owner || !repo) return;

            let size = 0;
            const cacheKey = `repo-size-${owner}-${repo}`;

            let data = Utils.getCache(cacheKey);

            if (data) {
                size = data;
            } else {
                if (this.isGitHub) {
                    try {
                        const apiUrl = `${CONFIG.api.githubRepo}/${owner}/${repo}`;
                        const headers = {};
                        if (CONFIG.token) {
                            headers['Authorization'] = `token ${CONFIG.token}`;
                        }
                        const resp = await Utils.request(apiUrl, { headers });
                        const json = JSON.parse(resp);
                        size = json.size * 1024; // API returns in KB
                        Utils.setCache(cacheKey, size);
                    } catch (e) {
                        if (e.message.includes('403')) {
                            Logger.warn('RepoSize: API Rate Limit Exceeded. Feature disabled temporarily.');
                            Utils.setCache(cacheKey, 0); // Cache failure to prevent retry loops
                        } else {
                            Logger.warn(`RepoSize API Error: ${e.message}`);
                        }
                        return;
                    }
                } else {
                    // Gitee 逻辑: 没有 Token 很难通过公共 API 获取。
                    // 暂时跳过 Gitee 以避免由于变更或错误数据导致的问题。
                    return;
                }
            }

            const badge = document.createElement('li');
            badge.id = 'gh-enhancer-repo-size';
            
            // Re-check existence to prevent race conditions
            if (document.getElementById('gh-enhancer-repo-size')) return;

            // GitHub list item style
            badge.className = this.isGitHub ? 'd-none d-sm-inline-flex' : 'item';
            badge.style.cssText = this.isGitHub ? 'margin-right: 16px; vertical-align: middle;' : 'display:inline-block; margin-left:10px;';

            const innerHtmlGitHub = `
                <div class="d-flex">
                    <span class="btn btn-sm btn-with-count tooltipped tooltipped-s" aria-label="Repository Size">
                        <span style="margin-right:4px">💾</span> ${Utils.formatBytes(size)}
                    </span>
                </div>
            `;

            const innerHtmlGitee = `
                <div class="btn btn-sm" style="cursor:default;">
                    <span>💾 ${Utils.formatBytes(size)}</span>
                </div>
            `;

            badge.innerHTML = this.isGitHub ? innerHtmlGitHub : innerHtmlGitee;

            if (this.isGitHub) {
                container.prepend(badge);
            } else {
                container.appendChild(badge);
            }
        }

        // --- 功能: 悬浮目录 (TOC) ---
        featureTOC() {
            // 查找内容容器
            // GitHub: .markdown-body 或 article
            // Gitee: .markdown-body
            const content = document.querySelector('.markdown-body') || document.querySelector('article');
            if (!content) {
                Logger.warn('TOC: No content container found');
                return;
            }

            const headers = Array.from(content.querySelectorAll('h1, h2, h3, h4, h5, h6'));
            if (headers.length < 2) {
                Logger.warn(`TOC: Too few headers (${headers.length})`);
                return;
            }

            this.createTOC(headers);
        }

        createTOC(headers) {
            const toc = document.createElement('div');
            toc.id = 'gh-enhancer-toc';

            const isDark = isDarkMode();

            toc.style.cssText = `
                position: fixed;
                top: 100px;
                right: 20px;
                width: 250px;
                max-height: calc(100vh - 150px);
                overflow-y: auto;
                background: ${isDark ? '#0d1117' : '#fff'};
                border: 1px solid ${isDark ? '#30363d' : '#e1e4e8'};
                border-radius: 6px;
                padding: 10px;
                box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                z-index: 1000;
                font-size: 12px;
                font-family: -apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;
            `;

            const title = document.createElement('div');
            title.style.fontWeight = 'bold';
            title.style.marginBottom = '10px';
            title.style.paddingBottom = '5px';
            title.style.borderBottom = `1px solid ${isDark ? '#30363d' : '#eee'}`;
            title.style.cursor = 'pointer';
            title.innerHTML = '目录 / Table of Contents <span>▼</span>';

            const highlightControl = document.createElement('div');
            highlightControl.style.cssText = `
                display: flex;
                align-items: center;
                gap: 6px;
                font-size: 11px;
                color: ${isDark ? '#9da7b3' : '#57606a'};
                margin-bottom: 8px;
            `;

            const highlightLabel = document.createElement('span');
            highlightLabel.textContent = '高亮阈值';

            const highlightValue = document.createElement('span');
            const currentSettings = normalizeTocSettings(CONFIG.tocSettings);
            highlightValue.textContent = `${currentSettings.highlightOffset}px`;

            const highlightRange = document.createElement('input');
            highlightRange.type = 'range';
            highlightRange.min = '0';
            highlightRange.max = '300';
            highlightRange.step = '5';
            highlightRange.value = String(currentSettings.highlightOffset);
            highlightRange.style.cssText = 'flex: 1;';

            highlightRange.addEventListener('input', () => {
                const value = clampNumber(Number(highlightRange.value), 0, 300);
                highlightValue.textContent = `${value}px`;
                CONFIG.tocSettings = normalizeTocSettings({
                    ...CONFIG.tocSettings,
                    highlightOffset: value
                });
                this.showTocOffsetLine(value);
                if (this._tocSettingsSaveTimer) clearTimeout(this._tocSettingsSaveTimer);
                this._tocSettingsSaveTimer = setTimeout(() => {
                    saveConfig();
                    this._tocSettingsSaveTimer = null;
                }, 300);
                if (this._tocUpdateActive) this._tocUpdateActive();
            });

            highlightControl.appendChild(highlightLabel);
            highlightControl.appendChild(highlightRange);
            highlightControl.appendChild(highlightValue);

            const list = document.createElement('ul');
            list.style.cssText = 'list-style: none; padding: 0; margin: 0;';

            headers.forEach((h, index) => {
                if (!h.id) h.id = `toc-heading-${index}`; // Ensure ID exists

                const level = parseInt(h.tagName.substring(1));
                const item = document.createElement('li');
                item.style.paddingLeft = `${(level - 1) * 10}px`;
                item.style.marginBottom = '4px';

                const link = document.createElement('a');
                link.href = `#${h.id}`;
                const headerText = h.textContent.trim();
                link.textContent = buildTocText(headerText);
                link.title = `${headerText} (Alt/Shift 复制链接)`;
                link.dataset.tocTarget = h.id;
                link.style.textDecoration = 'none';
                link.style.color = isDark ? '#c9d1d9' : '#0366d6';
                link.style.display = 'block';
                link.style.overflow = 'hidden';
                link.style.textOverflow = 'ellipsis';
                link.style.whiteSpace = 'nowrap';

                link.onclick = async (e) => {
                    e.preventDefault();
                    if (e.altKey || e.shiftKey) {
                        const baseUrl = window.location.href.split('#')[0];
                        const targetUrl = `${baseUrl}#${h.id}`;
                        try {
                            await navigator.clipboard.writeText(targetUrl);
                            Toast.success('已复制章节链接');
                        } catch (err) {
                            Toast.error('复制失败，请手动复制。');
                        }
                        return;
                    }
                    h.scrollIntoView({ behavior: 'smooth' });
                };

                item.appendChild(link);
                list.appendChild(item);
            });

            // Toggle
            let collapsed = window.innerWidth < 1100;
            const updateCollapseState = () => {
                list.style.display = collapsed ? 'none' : 'block';
                highlightControl.style.display = collapsed ? 'none' : 'flex';
                title.querySelector('span').textContent = collapsed ? '▶' : '▼';
            };
            updateCollapseState();
            title.onclick = () => {
                collapsed = !collapsed;
                updateCollapseState();
            };

            toc.appendChild(title);
            toc.appendChild(highlightControl);
            toc.appendChild(list);
            document.body.appendChild(toc);

            this.bindTOCScrollSpy(headers, list);
        }

        removeTOC() {
            const toc = document.getElementById('gh-enhancer-toc');
            if (toc) toc.remove();
            if (this._tocScrollHandler) {
                window.removeEventListener('scroll', this._tocScrollHandler);
                this._tocScrollHandler = null;
            }
            if (this._tocResizeHandler) {
                window.removeEventListener('resize', this._tocResizeHandler);
                this._tocResizeHandler = null;
            }
            this._tocUpdateActive = null;
            if (this._tocSettingsSaveTimer) {
                clearTimeout(this._tocSettingsSaveTimer);
                this._tocSettingsSaveTimer = null;
            }
            if (this._tocOffsetLineTimer) {
                clearTimeout(this._tocOffsetLineTimer);
                this._tocOffsetLineTimer = null;
            }
            const offsetLine = document.getElementById('gh-enhancer-toc-offset-line');
            if (offsetLine) offsetLine.remove();
        }

        showTocOffsetLine(offset) {
            let line = document.getElementById('gh-enhancer-toc-offset-line');
            if (!line) {
                line = document.createElement('div');
                line.id = 'gh-enhancer-toc-offset-line';
                line.style.cssText = `
                    position: fixed;
                    left: 0;
                    right: 0;
                    height: 0;
                    border-top: 1px dashed rgba(255, 0, 0, 0.5);
                    z-index: 10002;
                    pointer-events: none;
                    opacity: 0;
                    transition: opacity 0.2s ease;
                `;
                document.body.appendChild(line);
            }
            line.style.top = `${offset}px`;
            line.style.opacity = '1';
            if (this._tocOffsetLineTimer) clearTimeout(this._tocOffsetLineTimer);
            this._tocOffsetLineTimer = setTimeout(() => {
                line.style.opacity = '0';
                setTimeout(() => {
                    if (line && line.parentNode) line.remove();
                }, 250);
                this._tocOffsetLineTimer = null;
            }, 700);
        }

        getCommitPreviewFromMemory(url) {
            if (!this._commitPreviewMemory.has(url)) return null;
            const value = this._commitPreviewMemory.get(url);
            return value || null;
        }

        setCommitPreviewMemory(url, html) {
            if (!html) return;
            this._commitPreviewMemory.set(url, html);
            if (this._commitPreviewMemory.size > 50) {
                const firstKey = this._commitPreviewMemory.keys().next().value;
                this._commitPreviewMemory.delete(firstKey);
            }
        }

        async getCommitPreviewHtml(url, cacheKey) {
            if (cacheKey) {
                const cached = Utils.getCache(cacheKey);
                if (cached) return cached;
            }

            const memoryCached = this.getCommitPreviewFromMemory(url);
            if (memoryCached) return memoryCached;

            if (this._commitPreviewInFlight.has(url)) {
                return this._commitPreviewInFlight.get(url);
            }

            const promise = this.fetchCommitDetails(url)
                .then((html) => {
                    this._commitPreviewInFlight.delete(url);
                    this.setCommitPreviewMemory(url, html);
                    if (cacheKey) Utils.setCache(cacheKey, html);
                    return html;
                })
                .catch((err) => {
                    this._commitPreviewInFlight.delete(url);
                    throw err;
                });

            this._commitPreviewInFlight.set(url, promise);
            return promise;
        }

        bindTOCScrollSpy(headers, list) {
            const links = Array.from(list.querySelectorAll('a[data-toc-target]'));
            if (links.length === 0 || headers.length === 0) return;

            const setActive = (activeId) => {
                const currentSettings = normalizeTocSettings(CONFIG.tocSettings);
                const currentStyles = currentSettings.highlightStyles;
                const isDark = isDarkMode();
                const activeColor = isDark ? currentStyles.activeColorDark : currentStyles.activeColorLight;
                const activeBackground = isDark ? currentStyles.bgDark : currentStyles.bgLight;
                const activeFontWeight = currentStyles.fontWeight || '600';

                links.forEach((link) => {
                    const isActive = link.dataset.tocTarget === activeId;
                    link.style.fontWeight = isActive ? activeFontWeight : '400';
                    link.style.color = isActive
                        ? activeColor
                        : (isDark ? '#c9d1d9' : '#0366d6');
                    link.style.background = isActive
                        ? activeBackground
                        : 'transparent';
                    link.style.borderRadius = '4px';
                    link.style.padding = '2px 4px';
                });
            };

            const updateActive = () => {
                const tocSettings = normalizeTocSettings(CONFIG.tocSettings);
                const highlightOffset = tocSettings.highlightOffset;
                let activeId = headers[0].id;
                let bestScore = Number.POSITIVE_INFINITY;
                for (let i = 0; i < headers.length; i += 1) {
                    const rect = headers[i].getBoundingClientRect();
                    const distance = Math.abs(rect.top - highlightOffset);
                    const bias = rect.top > highlightOffset ? 24 : 0;
                    const score = distance + bias;
                    if (score < bestScore) {
                        bestScore = score;
                        activeId = headers[i].id;
                    }
                }
                setActive(activeId);
            };

            let ticking = false;
            const onScroll = () => {
                if (ticking) return;
                ticking = true;
                requestAnimationFrame(() => {
                    ticking = false;
                    updateActive();
                });
            };
            const onResize = () => updateActive();

            this._tocScrollHandler = onScroll;
            this._tocResizeHandler = onResize;
            this._tocUpdateActive = updateActive;
            window.addEventListener('scroll', onScroll, { passive: true });
            window.addEventListener('resize', onResize);
            updateActive();
        }

        // --- 功能: 构建大小 ---
        async featureBuildSize() {
            if (document.querySelector('.gh-enhancer-badge')) return;

            const packageUrl = this.getPackageJsonUrl();
            if (!packageUrl) return;

            const container = this.isGitHub
                ? (document.querySelector('.file-navigation') || document.querySelector('#readme'))
                : (document.querySelector('.git-project-header-actions') || document.querySelector('.file_list_tree'));

            if (!container) return;

            let packageJson;
            try {
                const jsonStr = await Utils.request(packageUrl);
                packageJson = JSON.parse(jsonStr);
            } catch (e) {
                return;
            }

            if (!packageJson.name) return;

            const pkgName = packageJson.name;
            const pkgNameEncoded = encodeURIComponent(pkgName);
            let data = Utils.getCache(`build-size-${pkgName}`);
            if (!data) {
                try {
                    const response = await Utils.request(`${CONFIG.api.bundlephobia}${pkgNameEncoded}`);
                    data = JSON.parse(response);
                    Utils.setCache(`build-size-${pkgName}`, data);
                } catch (e) {
                    return;
                }
            }

            const sizeBadge = Utils.createBadge('minified', Utils.formatBytes(data.size));
            const gzipBadge = Utils.createBadge('minified + gzip', Utils.formatBytes(data.gzip));

            // Re-check existence to prevent race conditions
            if (document.querySelector('.gh-enhancer-badge-container') || document.querySelector('.gh-enhancer-badge')) return;

            const badgeContainer = document.createElement('div');
            badgeContainer.className = 'gh-enhancer-badge-container';
            badgeContainer.style.cssText = 'display: inline-block; vertical-align: middle; margin-top: 5px; margin-left: 10px;';
            badgeContainer.appendChild(sizeBadge);
            badgeContainer.appendChild(gzipBadge);

            if (this.isGitee) {
                container.parentNode.insertBefore(badgeContainer, container.nextSibling);
            } else {
                container.appendChild(badgeContainer);
            }
        }

        // --- 功能: 依赖图表 ---
        async featureDependencyGraph() {
            if (document.getElementById('gh-enhancer-deps-btn')) return;

            const packageUrl = this.getPackageJsonUrl();
            if (!packageUrl) return;

            const target = this.isGitee
                ? document.querySelector('.git-project-header-actions')
                : document.querySelector('.file-navigation');

            if (!target) return;

            const btn = document.createElement('a');
            btn.id = 'gh-enhancer-deps-btn';
            btn.className = 'btn btn-sm';
            btn.innerHTML = '📊 Deps';
            btn.style.marginLeft = '10px';
            btn.style.cursor = 'pointer';

            btn.onclick = async () => {
                const modalId = 'gh-enhancer-modal';
                if (document.getElementById(modalId)) return;

                btn.innerHTML = '⏳ Loading...';
                try {
                    const jsonStr = await Utils.request(packageUrl);
                    const pkg = JSON.parse(jsonStr);
                    this.showDepsModal(pkg);
                } catch (e) {
                    Toast.error('Failed to load dependencies.');
                } finally {
                    btn.innerHTML = '📊 Deps';
                }
            };

            target.appendChild(btn);
        }

        showDepsModal(pkg) {
            const generateList = (deps) => {
                if (!deps || Object.keys(deps).length === 0) return '<p style="color:#666; font-style:italic;">None</p>';
                return Object.entries(deps).map(([name, version]) => `
                    <div style="display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px dashed #eee;">
                        <a href="${CONFIG.api.bundlephobia}${encodeURIComponent(name)}" target="_blank" rel="noopener noreferrer" style="color:#0969da; text-decoration:none; font-family:monospace;">${name}</a>
                        <span style="color:#666; font-family:monospace;">${version}</span>
                    </div>
                `).join('');
            };

            const content = `
                <div style="display:flex; gap:20px; height:100%;">
                    <div style="flex:1; overflow-y:auto; padding-right:10px;">
                        <h4 style="margin:0 0 10px 0; border-bottom:2px solid #eee; padding-bottom:5px;">Dependencies</h4>
                        ${generateList(pkg.dependencies)}
                    </div>
                    <div style="width:1px; background:#eee;"></div>
                    <div style="flex:1; overflow-y:auto; padding-left:10px;">
                        <h4 style="margin:0 0 10px 0; border-bottom:2px solid #eee; padding-bottom:5px;">Dev Dependencies</h4>
                        ${generateList(pkg.devDependencies)}
                    </div>
                </div>
            `;

            this.createModal(`${pkg.name} v${pkg.version || '?'}`, content);
        }

        createModal(title, content) {
            const modalId = 'gh-enhancer-modal';
            const existing = document.getElementById(modalId);
            if (existing) existing.remove();

            const isDark = isDarkMode();

            const overlay = document.createElement('div');
            overlay.id = modalId;
            overlay.style.cssText = `
                position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                background: rgba(0,0,0,0.6); z-index: 9999;
                display: flex; justify-content: center; align-items: center;
                backdrop-filter: blur(2px);
            `;

            const card = document.createElement('div');
            card.style.cssText = `
                background: ${isDark ? '#0d1117' : '#fff'};
                color: ${isDark ? '#c9d1d9' : '#24292f'};
                width: 700px; max-width: 90vw; height: 600px; max-height: 80vh;
                border-radius: 8px;
                box-shadow: 0 8px 24px rgba(0,0,0,0.2);
                display: flex; flex-direction: column;
                font-family: -apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;
            `;

            const header = document.createElement('div');
            header.style.cssText = `
                padding: 16px; border-bottom: 1px solid ${isDark ? '#30363d' : '#e1e4e8'};
                display: flex; justify-content: space-between; align-items: center;
                font-weight: 600; font-size: 16px;
            `;
            header.innerHTML = `<span>${title}</span><span id="${modalId}-close" style="cursor:pointer; font-size:24px; line-height:1;">&times;</span>`;

            const body = document.createElement('div');
            body.style.cssText = 'flex: 1; padding: 16px; overflow: hidden; font-size: 14px;';
            body.innerHTML = content;

            card.appendChild(header);
            card.appendChild(body);
            overlay.appendChild(card);
            document.body.appendChild(overlay);

            const close = () => overlay.remove();
            document.getElementById(`${modalId}-close`).onclick = close;
            overlay.onclick = (e) => { if (e.target === overlay) close(); };
        }

        // --- 功能: 提交预览 ---
        featureCommitPreview() {
            const selector = this.isGitee
                ? '.commit-id'
                : '.Box-header a.text-mono, [data-test-selector="commit-tease-commit-message"]';

            const commitLinks = document.querySelectorAll(selector);

            commitLinks.forEach(link => {
                if (link.dataset.ghEnhancerAttached) return;
                link.dataset.ghEnhancerAttached = 'true';

                let tooltip = null;
                let timer = null;

                const cleanup = () => {
                    if (timer) clearTimeout(timer);
                    const t = document.getElementById('gh-enhancer-tooltip');
                    if (t) t.remove();
                };

                link.addEventListener('mouseenter', (e) => {
                    const url = link.href;
                    if (!url) return;

                    timer = setTimeout(async () => {
                        const rect = link.getBoundingClientRect();
                        const x = rect.left + window.scrollX;
                        const y = rect.bottom + window.scrollY;

                        tooltip = this.createTooltip(x, y, 'Loading commit details...');

                        try {
                            const hashMatch = url.match(/[0-9a-f]{40}$/);
                            const cacheKey = hashMatch ? `commit-${hashMatch[0]}` : null;
                            const html = await this.getCommitPreviewHtml(url, cacheKey);

                            if (tooltip && document.contains(tooltip)) {
                                tooltip.innerHTML = html;
                            }
                        } catch (err) {
                            if (tooltip) tooltip.innerHTML = 'Error loading preview';
                        }
                    }, 600);
                });

                link.addEventListener('mouseleave', cleanup);
                link.addEventListener('click', cleanup);
            });
        }

        createTooltip(x, y, content) {
            const tooltipId = 'gh-enhancer-tooltip';
            const existing = document.getElementById(tooltipId);
            if (existing) existing.remove();

            const tooltip = document.createElement('div');
            tooltip.id = tooltipId;

            const isDark = isDarkMode();

            tooltip.style.cssText = `
                position: absolute;
                top: ${y + 5}px; left: ${x}px;
                background: ${isDark ? '#0d1117' : '#fff'};
                border: 1px solid ${isDark ? '#30363d' : '#ddd'};
                color: ${isDark ? '#c9d1d9' : '#333'};
                padding: 12px;
                border-radius: 6px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                z-index: 10000;
                min-width: 250px; max-width: 350px;
                font-size: 13px;
                font-family: -apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;
                pointer-events: none; 
            `;
            tooltip.innerHTML = content;
            document.body.appendChild(tooltip);
            return tooltip;
        }

        async fetchCommitDetails(url) {
            const html = await Utils.request(url, { timeoutMs: 10000 });
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');

            const stats = doc.querySelector('.toc-diff-stats')
                || doc.querySelector('.diffbar-item.diffstat')
                || doc.querySelector('#toc .stat');

            const statsText = stats ? stats.textContent.trim().replace(/\s+/g, ' ') : '';

            const files = Array.from(doc.querySelectorAll('.file-header .file-info a[title], .file-header .file-info span[title]'))
                .slice(0, 8)
                .map(el => el.getAttribute('title') || el.textContent.trim());

            const fileListHtml = files.length > 0
                ? '<ul style="padding-left:15px; margin:8px 0 0 0; list-style-type: disc;">' + files.map(f => `<li style="margin-bottom:2px; word-break:break-all;">${f}</li>`).join('') + '</ul>'
                : '<div style="margin-top:5px; color:#777;">No file changes detected or too many files.</div>';

            return `
                <div style="font-weight:600; margin-bottom:5px; border-bottom:1px solid #eee; padding-bottom:5px;">Commit Details</div>
                <div style="font-weight:500;">${statsText}</div>
                ${fileListHtml}
                ${files.length >= 8 ? '<div style="font-style:italic; color:#777; margin-top:5px;">...and more</div>' : ''}
            `;
        }
        // --- 功能: 复制代码按钮 ---
        featureCopyButton() {
            const codeBlocks = document.querySelectorAll('pre:not(.gh-enhancer-copy-handled)');
            codeBlocks.forEach(pre => {
                pre.classList.add('gh-enhancer-copy-handled');

                // 如果内部已经有复制按钮则跳过 (GitHub 通常在顶级文件视图中有，但有时在评论/README 中没有)
                if (pre.closest('.blob-wrapper') && this.isGitHub) return; // GitHub file view usually has one

                const btn = document.createElement('button');
                btn.className = 'gh-enhancer-copy-btn';
                btn.innerHTML = '📋';
                btn.title = 'Copy to clipboard';
                btn.style.cssText = `
                    position: absolute; top: 6px; right: 6px; z-index: 10;
                    padding: 4px 8px; background: rgba(255,255,255,0.9); border: 1px solid #ccc;
                    border-radius: 4px; cursor: pointer; visibility: hidden; opacity: 0;
                    transition: all 0.2s; font-size: 14px; line-height: 1;
                    color: #333;
                `;

                if (getComputedStyle(pre).position === 'static') {
                    pre.style.position = 'relative';
                }

                pre.appendChild(btn);

                pre.addEventListener('mouseenter', () => {
                    btn.style.visibility = 'visible';
                    btn.style.opacity = '1';
                });
                pre.addEventListener('mouseleave', () => {
                    btn.style.opacity = '0';
                    setTimeout(() => btn.style.visibility = 'hidden', 200);
                });

                btn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    e.preventDefault();

                    const code = pre.querySelector('code') ? pre.querySelector('code').innerText : pre.innerText;
                    // Remove the button text itself if it was somehow grabbed (unlikely with innerText on pre if button is absolute)
                    // But just in case, clone and remove button
                    const clone = pre.cloneNode(true);
                    const btnClone = clone.querySelector('.gh-enhancer-copy-btn');
                    if (btnClone) btnClone.remove();
                    const textToCopy = clone.innerText || clone.textContent;

                    try {
                        await navigator.clipboard.writeText(textToCopy.trim());
                        btn.innerHTML = '✅';
                        setTimeout(() => btn.innerHTML = '📋', 2000);
                    } catch (err) {
                        btn.innerHTML = '❌';
                        console.error('Copy failed', err);
                    }
                });
            });
        }
    }

    new GitHubEnhancer().init();

})();
