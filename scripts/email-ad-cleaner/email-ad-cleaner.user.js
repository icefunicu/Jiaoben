// ==UserScript==
// @name         邮件广告清理助手
// @namespace    https://github.com/email-ad-cleaner
// @version      2.1.1
// @description  智能识别并清理邮箱广告邮件 | AI+规则双引擎 | 支持Gmail/Outlook/QQ邮箱/163/126
// @author       EmailAdCleaner
// @match        https://mail.google.com/*
// @match        https://outlook.live.com/*
// @match        https://outlook.office.com/*
// @match        https://outlook.office365.com/*
// @match        https://mail.qq.com/*
// @match        https://wx.mail.qq.com/*
// @match        https://mail.163.com/*
// @match        https://mail.126.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @connect      open.bigmodel.cn
// @run-at       document-idle
// @license      MIT
// ==/UserScript==

// 外部请求清单：
// - https://open.bigmodel.cn/api/paas/v4/chat/completions: 目的=AI 判别广告邮件; 触发=开启 AI 模式并配置 API Key 或点击“测试连接”; 失败策略=返回 null 并回退到规则引擎/提示失败; 开关=设置中的 AI 开关

(function () {
    'use strict';

    console.log('[邮件广告清理助手] 脚本开始加载...');

    // ============================================
    // 配置常量
    // ============================================
    const CONFIG = {
        // 广告识别阈值 (0-100)
        threshold: 60,
        // 扫描延迟(毫秒)
        scanDelay: 500,
        // 每页扫描数量
        scanLimit: 50
    };

    // 营销域名关键词
    const MARKETING_DOMAINS = [
        'newsletter', 'marketing', 'promo', 'campaign', 'edm', 'mail',
        'notify', 'info', 'news', 'update', 'service', 'noreply',
        'mailer', 'bulk', 'mass', 'blast', 'broadcast', 'send'
    ];

    // 营销邮箱关键词
    const MARKETING_EMAILS = [
        'noreply', 'no-reply', 'no_reply', 'donotreply', 'do-not-reply',
        'newsletter', 'marketing', 'promo', 'notification', 'alert',
        'support', 'service', 'info', 'news', 'update', 'system',
        'admin', 'postmaster', 'mailer', 'daemon', 'bounce'
    ];

    // 广告标题关键词 (按权重分类)
    // 广告标题关键词 (按权重分类)
    const AD_KEYWORDS = {
        high: [ // 高权重 - 明显的营销词汇
            '限时', '促销', '优惠', '折扣', '特价', '秒杀', '清仓', '狂欢',
            '免费领', '红包', '中奖', '抽奖', '会员专享', '独家', '劲爆',
            '疯抢', '抢购', '立减', '满减', '返现', '立省', '省钱',
            'Sale', 'Discount', 'Free', 'Offer', 'Deal', 'Save', 'Clearance',
            '618', '双11', '双十一', '双12', '双十二', '黑五', 'Black Friday',
            'Cyber Monday', '年货节', '圣诞大促', '新年特惠', '开学季'
        ],
        medium: [ // 中权重 - 可能的推广词汇
            '订阅', '推荐', '精选', '热门', '新品', '上新', '首发',
            '活动', '福利', '礼包', '积分', '兑换', '升级', '专属',
            '邀请', '回馈', '感恩', '周年', '庆典', '盛典',
            'Weekly', 'Monthly', 'Newsletter', 'Highlights', 'Top Picks'
        ],
        low: [ // 低权重 - 常见但不确定的词汇
            '通知', '提醒', '更新', '周报', '月报', '简报', '快讯',
            '资讯', '动态', '汇总', '盘点', '回顾', 'Digest', 'Update'
        ]
    };

    // 退订链接关键词
    const UNSUBSCRIBE_KEYWORDS = [
        '退订', '取消订阅', 'unsubscribe', 'opt-out', 'optout',
        '不再接收', '停止接收', '移除订阅'
    ];

    // ============================================
    // 平台配置
    // ============================================
    const PLATFORMS = {
        gmail: {
            name: 'Gmail',
            match: /mail\.google\.com/,
            selectors: {
                mailList: 'tr.zA',
                sender: '.yW span[email], .yW [data-hovercard-id]',
                subject: '.bog, .y6 span',
                checkbox: '.oZ-jc',
                deleteBtn: '[act="10"]',
                container: '.AO'
            }
        },
        outlook: {
            name: 'Outlook',
            match: /outlook\.(live|office|office365)\.com/,
            selectors: {
                mailList: '[data-convid], [aria-label*="对话"]',
                sender: '[data-testid="ItemSender"], .OZZZK',
                subject: '[data-testid="ItemSubject"], .hcptT',
                checkbox: 'input[type="checkbox"]',
                deleteBtn: '[aria-label*="删除"], [aria-label*="Delete"]',
                container: '[role="main"]'
            }
        },
        qqmail: {
            name: 'QQ邮箱',
            match: /(mail|wx\.mail)\.qq\.com/,
            selectors: {
                mailList: '.list_item, .mail-list-item',
                sender: '.from, .mail-from',
                subject: '.title, .mail-subject',
                checkbox: 'input[type="checkbox"]',
                deleteBtn: '#delete, .del-btn',
                container: '#mailList, .mail-list'
            }
        },
        netease: {
            name: '网易邮箱',
            match: /mail\.(163|126)\.com/,
            selectors: {
                mailList: '[data-node="mailListItem"], .mItem',
                sender: '.nM, .from',
                subject: '.subj, .title',
                checkbox: 'input[type="checkbox"]',
                deleteBtn: '#_mail_toolbar_delete, .nui-btn-del',
                container: '#dvContainer, .mail-list'
            }
        }
    };

    // ============================================
    // 存储管理
    // ============================================
    // ============================
    // 存储管理 (带缓存优化)
    // ============================
    const ConfigCache = {
        data: null,
        isDirty: false,

        // 默认配置
        defaults: {
            whitelist: [],
            blacklist: [],
            customKeywords: { high: [], medium: [], low: [] },
            settings: {
                threshold: CONFIG.threshold,
                darkMode: 'auto',
                previewMode: false,
                autoScan: false,
                scanPages: 1
            },
            stats: { totalCleaned: 0, lastCleanDate: null, topSenders: {} },
            aiSettings: {
                enabled: false,
                apiKey: '',
                mode: 'hybrid' // 'ai_only' | 'hybrid' | 'rules_only'
            }
        },

        init() {
            if (this.data) return;
            this.data = {};
            // 批量加载所有配置
            for (const key of Object.keys(this.defaults)) {
                try {
                    const value = GM_getValue(key, null);
                    this.data[key] = value !== null ? JSON.parse(value) : JSON.parse(JSON.stringify(this.defaults[key]));
                } catch {
                    this.data[key] = JSON.parse(JSON.stringify(this.defaults[key]));
                }
            }
            console.log('[配置缓存] 初始化完成');
        },

        get(key) {
            if (!this.data) this.init();
            return this.data[key];
        },

        set(key, value) {
            if (!this.data) this.init();
            this.data[key] = value;
            // 异步保存到 GM_setValue，避免阻塞
            Promise.resolve().then(() => {
                GM_setValue(key, JSON.stringify(value));
            });
        }
    };

    const Storage = {
        // 白名单管理
        getWhitelist() {
            return ConfigCache.get('whitelist');
        },
        addToWhitelist(email) {
            const list = [...this.getWhitelist()];
            const normalized = email.toLowerCase().trim();
            if (!list.includes(normalized)) {
                list.push(normalized);
                ConfigCache.set('whitelist', list);
                return true;
            }
            return false;
        },
        removeFromWhitelist(email) {
            const list = this.getWhitelist().filter(e => e !== email.toLowerCase());
            ConfigCache.set('whitelist', list);
        },
        // 黑名单管理
        getBlacklist() {
            return ConfigCache.get('blacklist');
        },
        addToBlacklist(email) {
            const list = [...this.getBlacklist()];
            const normalized = email.toLowerCase().trim();
            if (!list.includes(normalized)) {
                list.push(normalized);
                ConfigCache.set('blacklist', list);
                return true;
            }
            return false;
        },
        removeFromBlacklist(email) {
            const list = this.getBlacklist().filter(e => e !== email.toLowerCase());
            ConfigCache.set('blacklist', list);
        },
        // 自定义关键词管理
        getCustomKeywords() {
            return ConfigCache.get('customKeywords');
        },
        addCustomKeyword(keyword, weight = 'medium') {
            const keywords = JSON.parse(JSON.stringify(this.getCustomKeywords())); // Deep copy
            if (!keywords[weight].includes(keyword)) {
                keywords[weight].push(keyword);
                ConfigCache.set('customKeywords', keywords);
                return true;
            }
            return false;
        },
        removeCustomKeyword(keyword, weight) {
            const keywords = JSON.parse(JSON.stringify(this.getCustomKeywords()));
            keywords[weight] = keywords[weight].filter(k => k !== keyword);
            ConfigCache.set('customKeywords', keywords);
        },
        // 设置管理
        getSettings() {
            return ConfigCache.get('settings');
        },
        saveSettings(settings) {
            ConfigCache.set('settings', settings);
        },
        // 统计数据
        getStats() {
            return ConfigCache.get('stats');
        },
        updateStats(count, senders) {
            const stats = JSON.parse(JSON.stringify(this.getStats()));
            stats.totalCleaned += count;
            stats.lastCleanDate = new Date().toISOString();
            senders.forEach(s => {
                const sender = s.toLowerCase();
                stats.topSenders[sender] = (stats.topSenders[sender] || 0) + 1;
            });
            ConfigCache.set('stats', stats);
        },
        // 导入导出
        exportConfig() {
            return JSON.stringify({
                whitelist: this.getWhitelist(),
                blacklist: this.getBlacklist(),
                customKeywords: this.getCustomKeywords(),
                settings: this.getSettings()
            }, null, 2);
        },
        importConfig(jsonStr) {
            try {
                const data = JSON.parse(jsonStr);
                // 验证并导入
                if (data.whitelist) ConfigCache.set('whitelist', data.whitelist);
                if (data.blacklist) ConfigCache.set('blacklist', data.blacklist);
                if (data.customKeywords) ConfigCache.set('customKeywords', data.customKeywords);
                if (data.settings) ConfigCache.set('settings', data.settings);
                return true;
            } catch {
                return false;
            }
        },
        // 重置所有数据
        resetAll() {
            const defaults = ConfigCache.defaults;
            ConfigCache.set('whitelist', defaults.whitelist);
            ConfigCache.set('blacklist', defaults.blacklist);
            ConfigCache.set('customKeywords', defaults.customKeywords);
            ConfigCache.set('settings', defaults.settings);
            ConfigCache.set('stats', defaults.stats);
        },
        // AI 设置管理
        getAISettings() {
            return ConfigCache.get('aiSettings');
        },
        saveAISettings(settings) {
            ConfigCache.set('aiSettings', settings);
        }
    };

    // ============================================
    // AI 客户端 - 智谱 GLM-4-Flash (免费)
    // ============================================
    const AIClient = {
        API_URL: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',

        // 生成 JWT Token (智谱 API 需要)
        generateToken(apiKey) {
            // 智谱 API 支持直接使用 API Key (格式 id.secret)
            // 如果需要 JWT 签名，需引入额外的 crypto 库，此处为保持轻量直接透传


            // 简化签名 (实际生产应使用 HMAC-SHA256)
            // 智谱 API 也支持直接使用 API Key
            return apiKey;
        },

        // 分析邮件是否为广告 (优化版本)
        async analyze(mails, apiKey, onProgress) {
            if (!apiKey || mails.length === 0) return null;

            // 限制最多分析10封邮件，避免请求过慢
            const MAX_BATCH = 10;
            const mailsToAnalyze = mails.slice(0, MAX_BATCH);

            if (onProgress) onProgress(`AI 分析中 (${mailsToAnalyze.length}封)...`);

            const mailsText = mailsToAnalyze.map((m, i) =>
                `${i + 1}. ${m.sender} - ${m.subject}`
            ).join('\n');

            // 优化 Prompt，增加 Few-Shot 示例以提高准确率
            const prompt = `你是一个专业的邮件反垃圾系统。请判断以下邮件是否为广告/推广/营销邮件。
规则：
1. 包含"退订"、"Unsubscribe"、"促销"、"优惠"等通常是广告。
2. 包含系统通知、验证码、账单、个人对话通常不是广告。
3. 即使是 Newsletter，如果是纯资讯类的也可以标记为 false，但如果是营销性质的标记为 true。

请分析以下邮件列表，并返回 JSON 数组。

示例输入:
1. Apple - Your receipt for iCloud+
2. JD.com - 618 大促最后一天，全场5折起！
3. GitHub - [Jiaoben] Pull request #1 merged

示例输出:
[{"i":1,"ad":false,"c":90,"r":"账单收据"},{"i":2,"ad":true,"c":95,"r":"大促广告"},{"i":3,"ad":false,"c":85,"r":"代码通知"}]

待分析邮件:
${mailsText}

请仅返回 JSON 数组，不要返回 markdown 代码块：`;

            return new Promise((resolve) => {
                // 15秒超时
                const timeout = setTimeout(() => {
                    console.log('[AI] 请求超时');
                    resolve(null);
                }, 15000);

                GM_xmlhttpRequest({
                    method: 'POST',
                    url: this.API_URL,
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${apiKey}`
                    },
                    data: JSON.stringify({
                        model: 'glm-4-flash',
                        messages: [{ role: 'user', content: prompt }],
                        temperature: 0.1,
                        max_tokens: 512  // 减少 token 数量加快响应
                    }),
                    timeout: 15000,
                    onload: (response) => {
                        clearTimeout(timeout);
                        try {
                            if (response.status !== 200) {
                                console.error('[AI] API 错误:', response.responseText);
                                resolve(null);
                                return;
                            }
                            const data = JSON.parse(response.responseText);
                            const content = data.choices?.[0]?.message?.content || '';
                            const jsonMatch = content.match(/\[[\s\S]*\]/);
                            if (jsonMatch) {
                                // 转换简化格式为标准格式
                                const results = JSON.parse(jsonMatch[0]);
                                resolve(results.map(r => ({
                                    index: r.i || r.index,
                                    isAd: r.ad ?? r.isAd,
                                    confidence: r.c || r.confidence || 50,
                                    reason: r.r || r.reason || ''
                                })));
                            } else {
                                resolve(null);
                            }
                        } catch (e) {
                            console.error('[AI] 解析失败:', e);
                            resolve(null);
                        }
                    },
                    onerror: (error) => {
                        clearTimeout(timeout);
                        console.error('[AI] 请求失败:', error);
                        resolve(null);
                    }
                });
            });
        },

        // 检查 API Key 是否有效
        async testKey(apiKey) {
            return new Promise((resolve) => {
                GM_xmlhttpRequest({
                    method: 'POST',
                    url: this.API_URL,
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${apiKey}`
                    },
                    data: JSON.stringify({
                        model: 'glm-4-flash',
                        messages: [{ role: 'user', content: '测试' }],
                        max_tokens: 10
                    }),
                    onload: (response) => resolve(response.status === 200),
                    onerror: () => resolve(false)
                });
            });
        }
    };

    // ============================================
    // 广告识别引擎
    // ============================================
    const AdDetector = {
        regexCache: new Map(),

        // 通配符匹配 (支持 * 匹配任意字符) - 带缓存优化
        wildcardMatch(pattern, str) {
            if (!this.regexCache.has(pattern)) {
                const regexPattern = pattern
                    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
                    .replace(/\*/g, '.*')
                    .replace(/\?/g, '.');
                this.regexCache.set(pattern, new RegExp(`^${regexPattern}$`, 'i'));
            }
            return this.regexCache.get(pattern).test(str);
        },

        // 检查邮箱是否匹配列表（支持通配符）
        matchesList(email, list) {
            const normalized = email.toLowerCase();
            for (const pattern of list) {
                if (pattern.includes('*') || pattern.includes('?')) {
                    if (this.wildcardMatch(pattern, normalized)) return pattern;
                } else if (normalized === pattern || normalized.includes(pattern)) {
                    return pattern;
                }
            }
            return null;
        },

        // 计算邮件的广告分数
        calculateScore(mail) {
            let score = 0;
            const details = [];
            const senderLower = mail.sender.toLowerCase();

            // 检查白名单（优先级最高）
            const whiteMatch = this.matchesList(senderLower, Storage.getWhitelist());
            if (whiteMatch) {
                return { score: 0, isAd: false, details: [`✅ 在白名单中: ${whiteMatch}`] };
            }

            // 检查黑名单（直接标记为广告）
            const blackMatch = this.matchesList(senderLower, Storage.getBlacklist());
            if (blackMatch) {
                return { score: 100, isAd: true, details: [`🚫 在黑名单中: ${blackMatch}`] };
            }

            // 1. 检查发件人域名 (30分)
            const domain = mail.sender.split('@')[1] || '';
            for (const keyword of MARKETING_DOMAINS) {
                if (domain.toLowerCase().includes(keyword)) {
                    score += 30;
                    details.push(`📧 域名包含营销关键词: ${keyword}`);
                    break;
                }
            }

            // 2. 检查发件人地址 (25分)
            const emailPrefix = mail.sender.split('@')[0] || '';
            for (const keyword of MARKETING_EMAILS) {
                if (emailPrefix.toLowerCase().includes(keyword)) {
                    score += 25;
                    details.push(`📮 邮箱包含营销关键词: ${keyword}`);
                    break;
                }
            }

            // 3. 检查标题关键词 - 内置 + 自定义 (25分)
            const subject = mail.subject.toLowerCase();
            let subjectScore = 0;
            const customKeywords = Storage.getCustomKeywords();

            // 合并内置和自定义关键词
            const allKeywords = {
                high: [...AD_KEYWORDS.high, ...customKeywords.high],
                medium: [...AD_KEYWORDS.medium, ...customKeywords.medium],
                low: [...AD_KEYWORDS.low, ...customKeywords.low]
            };

            for (const keyword of allKeywords.high) {
                if (subject.includes(keyword.toLowerCase())) {
                    subjectScore = 25;
                    details.push(`🔴 标题包含高权重关键词: ${keyword}`);
                    break;
                }
            }
            if (subjectScore === 0) {
                for (const keyword of allKeywords.medium) {
                    if (subject.includes(keyword.toLowerCase())) {
                        subjectScore = 15;
                        details.push(`🟡 标题包含中权重关键词: ${keyword}`);
                        break;
                    }
                }
            }
            if (subjectScore === 0) {
                for (const keyword of allKeywords.low) {
                    if (subject.includes(keyword.toLowerCase())) {
                        subjectScore = 8;
                        details.push(`🟢 标题包含低权重关键词: ${keyword}`);
                        break;
                    }
                }
            }
            score += subjectScore;

            // 4. 检查退订链接关键词 (20分)
            if (mail.content) {
                const content = mail.content.toLowerCase();
                for (const keyword of UNSUBSCRIBE_KEYWORDS) {
                    if (content.includes(keyword.toLowerCase())) {
                        score += 20;
                        details.push(`🔗 内容包含退订链接: ${keyword}`);
                        break;
                    }
                }
            }

            const threshold = Storage.getSettings().threshold || CONFIG.threshold;
            return {
                score,
                isAd: score >= threshold,
                details
            };
        }
    };

    // ============================================
    // 平台适配器
    // ============================================
    class PlatformAdapter {
        constructor() {
            this.platform = this.detectPlatform();
            this.config = this.platform ? PLATFORMS[this.platform] : null;
        }

        detectPlatform() {
            const url = window.location.href;
            for (const [key, platform] of Object.entries(PLATFORMS)) {
                if (platform.match.test(url)) {
                    return key;
                }
            }
            return null;
        }

        // 获取邮件列表
        getMailList() {
            if (!this.config) return [];

            const mails = [];
            const elements = document.querySelectorAll(this.config.selectors.mailList);

            elements.forEach((el, index) => {
                const senderEl = el.querySelector(this.config.selectors.sender);
                const subjectEl = el.querySelector(this.config.selectors.subject);

                if (senderEl || subjectEl) {
                    mails.push({
                        id: index,
                        element: el,
                        sender: this.extractSender(senderEl),
                        subject: subjectEl?.textContent?.trim() || '',
                        content: '' // 内容需要点击邮件才能获取
                    });
                }
            });

            return mails;
        }

        extractSender(el) {
            if (!el) return '';
            // 尝试获取email属性
            const email = el.getAttribute('email') ||
                el.getAttribute('data-hovercard-id') ||
                el.getAttribute('title') ||
                el.textContent;
            return email?.trim() || '';
        }

        // 选中邮件
        selectMail(mail) {
            const checkbox = mail.element.querySelector(this.config.selectors.checkbox);
            if (checkbox && !checkbox.checked) {
                checkbox.click();
            }
        }

        // 取消选中
        deselectMail(mail) {
            const checkbox = mail.element.querySelector(this.config.selectors.checkbox);
            if (checkbox && checkbox.checked) {
                checkbox.click();
            }
        }

        // 删除选中的邮件
        deleteSelected() {
            const deleteBtn = document.querySelector(this.config.selectors.deleteBtn);
            if (deleteBtn) {
                deleteBtn.click();
                return true;
            }
            return false;
        }

        // 高亮标记邮件
        highlightMail(mail, isAd) {
            if (isAd) {
                mail.element.style.backgroundColor = 'rgba(255, 193, 7, 0.15)';
                mail.element.style.borderLeft = '3px solid #ffc107';
            } else {
                mail.element.style.backgroundColor = '';
                mail.element.style.borderLeft = '';
            }
        }
    }

    // ============================================
    // Toast 通知系统
    // ============================================
    const Toast = {
        container: null,
        init() {
            if (this.container) return;
            this.container = document.createElement('div');
            this.container.id = 'eac-toast-container';
            this.container.style.cssText = `
                position: fixed; bottom: 100px; right: 20px; z-index: 9999999;
                display: flex; flex-direction: column; gap: 8px; pointer-events: none;
            `;
            document.body.appendChild(this.container);
        },
        show(message, type = 'info', duration = 3000) {
            this.init();
            const toast = document.createElement('div');
            const colors = { success: '#28a745', error: '#dc3545', warning: '#ffc107', info: '#10B981' };
            const icons = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' };
            toast.style.cssText = `
                background: ${colors[type]}; color: white; padding: 12px 20px;
                border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                display: flex; align-items: center; gap: 8px; pointer-events: auto;
                animation: eacToastIn 0.3s ease; font-size: 14px;
            `;
            // 使用 DOM API 代替 innerHTML
            const icon = document.createElement('span');
            icon.textContent = icons[type];
            const text = document.createElement('span');
            text.textContent = message;
            toast.appendChild(icon);
            toast.appendChild(text);
            this.container.appendChild(toast);
            setTimeout(() => {
                toast.style.animation = 'eacToastOut 0.3s ease forwards';
                setTimeout(() => toast.remove(), 300);
            }, duration);
        },
        success(msg) { this.show(msg, 'success'); },
        error(msg) { this.show(msg, 'error'); },
        warning(msg) { this.show(msg, 'warning'); },
        info(msg) { this.show(msg, 'info'); }
    };

    // ============================================
    // 安全 HTML 解析 (绕过 Trusted Types)
    // ============================================
    let trustedPolicy = null;

    // 尝试创建 Trusted Types Policy
    try {
        if (window.trustedTypes && window.trustedTypes.createPolicy) {
            trustedPolicy = window.trustedTypes.createPolicy('eac-policy', {
                createHTML: (input) => input
            });
        }
    } catch (e) {
        console.log('[邮件广告清理助手] 无法创建 Trusted Types Policy，使用备用方案');
    }

    function safeSetHTML(element, html) {
        // 清空元素
        while (element.firstChild) {
            element.removeChild(element.firstChild);
        }

        try {
            // 方案1: 使用 Trusted Types Policy
            if (trustedPolicy) {
                element.innerHTML = trustedPolicy.createHTML(html);
                return;
            }

            // 方案2: 使用 Range.createContextualFragment
            const range = document.createRange();
            range.selectNodeContents(element);
            const fragment = range.createContextualFragment(html);
            element.appendChild(fragment);
        } catch (e) {
            // 方案3: 在 iframe 中解析
            console.log('[邮件广告清理助手] 使用 iframe 备用方案');
            const iframe = document.createElement('iframe');
            iframe.style.display = 'none';
            document.body.appendChild(iframe);
            iframe.contentDocument.body.innerHTML = html;
            Array.from(iframe.contentDocument.body.childNodes).forEach(node => {
                element.appendChild(document.adoptNode(node.cloneNode(true)));
            });
            iframe.remove();
        }
    }

    // ============================================
    // UI管理器
    // ============================================
    const UI = {
        container: null,
        isMinimized: true,
        scanResults: [],
        isScanning: false, // 新增状态标记
        isDragging: false,
        dragOffset: { x: 0, y: 0 },

        init() {
            console.log('[邮件广告清理助手] UI.init 开始执行');
            try {
                this.injectStyles();
                console.log('[邮件广告清理助手] 样式注入完成');
                this.createContainer();
                console.log('[邮件广告清理助手] 容器创建完成');
                this.bindEvents();
                console.log('[邮件广告清理助手] 事件绑定完成');
                this.bindKeyboardShortcuts();
                this.applyDarkMode();
                console.log('[邮件广告清理助手] UI 初始化全部完成');
            } catch (e) {
                console.error('[邮件广告清理助手] UI 初始化失败:', e);
            }
        },

        injectStyles() {
            GM_addStyle(`
                #eac-container {
                    position: fixed;
                    bottom: 20px;
                    right: 20px;
                    z-index: 999999;
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                    font-size: 14px;
                }
                #eac-toggle {
                    width: 56px;
                    height: 56px;
                    border-radius: 50%;
                    background: linear-gradient(135deg, #10B981 0%, #059669 100%);
                    border: none;
                    cursor: pointer;
                    box-shadow: 0 4px 15px rgba(16, 185, 129, 0.4);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: all 0.3s ease;
                }
                #eac-toggle:hover {
                    transform: scale(1.1);
                    box-shadow: 0 6px 20px rgba(16, 185, 129, 0.5);
                }
                #eac-toggle svg {
                    width: 28px;
                    height: 28px;
                    fill: white;
                }
                #eac-panel {
                    display: none;
                    width: 380px;
                    max-height: 500px;
                    background: white;
                    border-radius: 12px;
                    box-shadow: 0 10px 40px rgba(0,0,0,0.15);
                    overflow: hidden;
                }
                #eac-panel.active {
                    display: block;
                    animation: eacSlideIn 0.3s ease;
                }
                @keyframes eacSlideIn {
                    from { opacity: 0; transform: translateY(20px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                #eac-header {
                    background: linear-gradient(135deg, #10B981 0%, #059669 100%);
                    color: white;
                    padding: 16px;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }
                #eac-header h3 {
                    margin: 0;
                    font-size: 16px;
                    font-weight: 600;
                }
                #eac-header-btns button {
                    background: rgba(255,255,255,0.2);
                    border: none;
                    color: white;
                    width: 28px;
                    height: 28px;
                    border-radius: 6px;
                    cursor: pointer;
                    margin-left: 8px;
                    font-size: 16px;
                }
                #eac-header-btns button:hover {
                    background: rgba(255,255,255,0.3);
                }
                #eac-toolbar {
                    padding: 12px 16px;
                    border-bottom: 1px solid #eee;
                    display: flex;
                    gap: 10px;
                    align-items: center;
                }
                #eac-scan-btn {
                    background: linear-gradient(135deg, #10B981 0%, #059669 100%);
                    color: white;
                    border: none;
                    padding: 10px 20px;
                    border-radius: 8px;
                    cursor: pointer;
                    font-weight: 500;
                    transition: all 0.2s;
                }
                #eac-scan-btn:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 4px 12px rgba(16, 185, 129, 0.4);
                }
                #eac-scan-btn:disabled {
                    background: #ccc;
                    cursor: not-allowed;
                    transform: none;
                    box-shadow: none;
                }
                #eac-status {
                    color: #666;
                    font-size: 13px;
                }
                #eac-actions {
                    padding: 10px 16px;
                    border-bottom: 1px solid #eee;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    background: #f8f9fa;
                }
                #eac-select-all {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    cursor: pointer;
                }
                #eac-select-all input {
                    width: 18px;
                    height: 18px;
                    cursor: pointer;
                }
                #eac-delete-btn {
                    background: #dc3545;
                    color: white;
                    border: none;
                    padding: 8px 16px;
                    border-radius: 6px;
                    cursor: pointer;
                    font-weight: 500;
                    display: flex;
                    align-items: center;
                    gap: 6px;
                }
                #eac-delete-btn:hover {
                    background: #c82333;
                }
                #eac-delete-btn:disabled {
                    background: #ccc;
                    cursor: not-allowed;
                }
                #eac-list {
                    max-height: 280px;
                    overflow-y: auto;
                }
                .eac-mail-item {
                    padding: 12px 16px;
                    border-bottom: 1px solid #f0f0f0;
                    display: flex;
                    align-items: flex-start;
                    gap: 12px;
                    transition: background 0.2s;
                }
                .eac-mail-item:hover {
                    background: #f8f9fa;
                }
                .eac-mail-item input {
                    width: 18px;
                    height: 18px;
                    margin-top: 2px;
                    cursor: pointer;
                    flex-shrink: 0;
                }
                .eac-mail-info {
                    flex: 1;
                    min-width: 0;
                }
                .eac-mail-subject {
                    font-weight: 500;
                    color: #333;
                    margin-bottom: 4px;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }
                .eac-mail-sender {
                    font-size: 12px;
                    color: #888;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }
                .eac-mail-score {
                    font-size: 11px;
                    color: white;
                    background: #ffc107;
                    padding: 2px 8px;
                    border-radius: 10px;
                    flex-shrink: 0;
                }
                .eac-mail-score.high {
                    background: #dc3545;
                }
                .eac-mail-actions {
                    display: flex;
                    gap: 4px;
                    flex-shrink: 0;
                }
                .eac-whitelist-btn {
                    background: none;
                    border: 1px solid #28a745;
                    color: #28a745;
                    width: 24px;
                    height: 24px;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 12px;
                }
                .eac-whitelist-btn:hover {
                    background: #28a745;
                    color: white;
                }
                #eac-empty {
                    padding: 40px 20px;
                    text-align: center;
                    color: #888;
                }
                #eac-empty svg {
                    width: 48px;
                    height: 48px;
                    fill: #ddd;
                    margin-bottom: 12px;
                }
                #eac-footer {
                    padding: 12px 16px;
                    border-top: 1px solid #eee;
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                    background: linear-gradient(135deg, #f8f9fa 0%, #fff 100%);
                }
                .eac-footer-row {
                    display: flex;
                    justify-content: center;
                    gap: 6px;
                }
                :root {
                    --eac-primary: #3B82F6;
                    --eac-secondary: #60A5FA;
                    --eac-cta: #F97316;
                    --eac-bg: #F8FAFC;
                    --eac-text: #1E293B;
                    --eac-border: #E2E8F0;
                }
                #eac-container {
                    font-family: 'Fira Sans', -apple-system, sans-serif;
                    position: fixed;
                    bottom: 20px;
                    right: 20px;
                    z-index: 9999999;
                    box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
                    border-radius: 12px;
                    background: white;
                    color: var(--eac-text);
                    width: 320px;
                    transition: all 0.3s ease;
                }
                .eac-footer-btn {
                    background: white;
                    border: 1px solid #e0e0e0;
                    color: #555;
                    cursor: pointer;
                    font-size: 11px;
                    padding: 6px 10px;
                    border-radius: 6px;
                    display: flex;
                    align-items: center;
                    gap: 4px;
                    transition: all 0.2s;
                }
                .eac-footer-btn:hover {
                    background: #10B981;
                    color: white;
                    border-color: #10B981;
                    transform: translateY(-1px);
                }
                .eac-footer-btn span {
                    font-size: 12px;
                }
                #eac-settings-modal {
                    display: none;
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background: rgba(0,0,0,0.5);
                    z-index: 9999999;
                    align-items: center;
                    justify-content: center;
                }
                #eac-settings-modal.active {
                    display: flex;
                }
                #eac-settings-content {
                    background: white;
                    border-radius: 12px;
                    padding: 24px;
                    width: 360px;
                    max-height: 80vh;
                    overflow-y: auto;
                }
                #eac-settings-content h4 {
                    margin: 0 0 20px;
                    color: #333;
                }
                .eac-setting-item {
                    margin-bottom: 16px;
                }
                .eac-setting-item label {
                    display: block;
                    margin-bottom: 6px;
                    color: #555;
                    font-size: 13px;
                }
                .eac-setting-item input[type="range"] {
                    width: 100%;
                }
                .eac-setting-item input[type="number"] {
                    width: 80px;
                    padding: 6px 10px;
                    border: 1px solid #ddd;
                    border-radius: 6px;
                }
                #eac-settings-btns {
                    display: flex;
                    justify-content: flex-end;
                    gap: 10px;
                    margin-top: 20px;
                }
                #eac-settings-btns button {
                    padding: 8px 16px;
                    border-radius: 6px;
                    cursor: pointer;
                }
                #eac-settings-save {
                    background: #10B981;
                    color: white;
                    border: none;
                }
                #eac-settings-cancel {
                    background: white;
                    border: 1px solid #ddd;
                    color: #666;
                }
                #eac-confirm-modal {
                    display: none;
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background: rgba(0,0,0,0.5);
                    z-index: 9999999;
                    align-items: center;
                    justify-content: center;
                }
                #eac-confirm-modal.active {
                    display: flex;
                }
                #eac-confirm-content {
                    background: white;
                    border-radius: 12px;
                    padding: 24px;
                    width: 320px;
                    text-align: center;
                }
                #eac-confirm-content p {
                    margin: 0 0 20px;
                    color: #333;
                }
                #eac-confirm-btns {
                    display: flex;
                    justify-content: center;
                    gap: 12px;
                }
                #eac-confirm-yes {
                    background: #dc3545;
                    color: white;
                    border: none;
                    padding: 10px 24px;
                    border-radius: 6px;
                    cursor: pointer;
                }
                #eac-confirm-no {
                    background: white;
                    border: 1px solid #ddd;
                    color: #666;
                    padding: 10px 24px;
                    border-radius: 6px;
                    cursor: pointer;
                }
                /* Toast 动画 */
                @keyframes eacToastIn {
                    from { opacity: 0; transform: translateX(100px); }
                    to { opacity: 1; transform: translateX(0); }
                }
                @keyframes eacToastOut {
                    from { opacity: 1; transform: translateX(0); }
                    to { opacity: 0; transform: translateX(100px); }
                }
                /* 进度条 */
                #eac-progress {
                    height: 3px;
                    background: rgba(16, 185, 129, 0.2);
                    overflow: hidden;
                }
                #eac-progress-bar {
                    height: 100%;
                    background: linear-gradient(135deg, #10B981 0%, #059669 100%);
                    width: 0;
                    transition: width 0.3s ease;
                }
                /* 评分详情展开 */
                .eac-mail-details {
                    display: none;
                    padding: 8px 16px 12px 46px;
                    background: #f8f9fa;
                    font-size: 12px;
                    color: #666;
                    border-bottom: 1px solid #f0f0f0;
                }
                .eac-mail-details.show { display: block; }
                .eac-mail-details li { margin: 4px 0; }
                /* 深色模式 */
                .eac-dark #eac-panel { background: #1e1e1e; }
                .eac-dark #eac-toolbar { border-color: #333; }
                .eac-dark #eac-actions { background: #252525; border-color: #333; }
                .eac-dark #eac-list { background: #1e1e1e; }
                .eac-dark .eac-mail-item { border-color: #333; }
                .eac-dark .eac-mail-item:hover { background: #252525; }
                .eac-dark .eac-mail-subject { color: #e0e0e0; }
                .eac-dark .eac-mail-sender { color: #888; }
                .eac-dark #eac-footer { background: linear-gradient(135deg, #252525 0%, #1e1e1e 100%); border-color: #333; }
                .eac-dark .eac-footer-btn { background: #333; border-color: #444; color: #ccc; }
                .eac-dark .eac-footer-btn:hover { background: #10B981; color: white; border-color: #10B981; }
                .eac-dark #eac-settings-content, .eac-dark #eac-confirm-content { background: #1e1e1e; }
                .eac-dark #eac-settings-content h4, .eac-dark #eac-confirm-content p { color: #e0e0e0; }
                .eac-dark .eac-setting-item label { color: #aaa; }
                .eac-dark #eac-status { color: #aaa; }
                .eac-dark #eac-empty { color: #888; }
                .eac-dark .eac-mail-details { background: #252525; color: #aaa; }
                .eac-dark .eac-mail-details { background: #252525; color: #aaa; }
                
                /* Rules Modal & Stats Modal Styles */
                .eac-modal {
                    display: none;
                    position: fixed;
                    top: 0; left: 0; width: 100%; height: 100%;
                    background: rgba(0,0,0,0.5);
                    z-index: 99999999;
                    align-items: center;
                    justify-content: center;
                }
                .eac-modal.active { display: flex; }
                .eac-modal-content {
                    background: white;
                    border-radius: 12px;
                    width: 500px;
                    max-height: 85vh;
                    display: flex;
                    flex-direction: column;
                    box-shadow: 0 20px 50px rgba(0,0,0,0.2);
                    overflow: hidden;
                }
                .eac-modal-header {
                    padding: 16px 20px;
                    border-bottom: 1px solid #eee;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    background: #f8f9fa;
                }
                .eac-modal-header h4 { margin: 0; font-size: 16px; color: #333; }
                .eac-modal-close {
                    background: none; border: none; font-size: 20px; color: #999; cursor: pointer;
                }
                .eac-modal-close:hover { color: #333; }
                
                .eac-modal-body { padding: 20px; overflow-y: auto; flex: 1; }
                
                /* Rules Table */
                .eac-rules-tabs {
                    display: flex; gap: 10px; margin-bottom: 15px; border-bottom: 1px solid #eee; padding-bottom: 10px;
                }
                .eac-rules-tab {
                    padding: 6px 12px; border-radius: 6px; cursor: pointer; color: #666; font-weight: 500;
                }
                .eac-rules-tab.active { background: #10B981; color: white; }
                
                .eac-rules-input-group {
                    display: flex; gap: 8px; margin-bottom: 15px;
                }
                .eac-rules-input {
                    flex: 1; padding: 8px 12px; border: 1px solid #ddd; border-radius: 6px;
                }
                .eac-rules-add-btn {
                    background: #10B981; color: white; border: none; padding: 0 16px; border-radius: 6px; cursor: pointer;
                }
                
                .eac-rules-list {
                    border: 1px solid #eee; border-radius: 8px; max-height: 300px; overflow-y: auto;
                }
                .eac-rule-item {
                    display: flex; justify-content: space-between; align-items: center;
                    padding: 10px 14px; border-bottom: 1px solid #eee;
                }
                .eac-rule-item:last-child { border-bottom: none; }
                .eac-rule-item:hover { background: #f8f9fa; }
                .eac-rule-text { font-family: monospace; }
                .eac-rule-del {
                    color: #dc3545; cursor: pointer; opacity: 0.6; padding: 4px;
                }
                .eac-rule-del:hover { opacity: 1; background: rgba(220, 53, 69, 0.1); border-radius: 4px; }
                
                /* Stats */
                .eac-stats-grid {
                    display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 20px;
                }
                .eac-stat-card {
                    background: #f8f9fa; padding: 15px; border-radius: 8px; text-align: center;
                }
                .eac-stat-num { font-size: 24px; font-weight: bold; color: #10B981; display: block; }
                .eac-stat-label { font-size: 13px; color: #666; }
                
                .eac-top-list { list-style: none; padding: 0; margin: 0; }
                .eac-top-item {
                    display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px dashed #eee;
                }
                
                /* Dark Mode for Modals */
                .eac-dark .eac-modal-content { background: #1e1e1e; color: #e0e0e0; }
                .eac-dark .eac-modal-header { background: #252525; border-color: #333; }
                .eac-dark .eac-modal-header h4 { color: #e0e0e0; }
                .eac-dark .eac-rules-tab { color: #aaa; }
                .eac-dark .eac-rules-tab.active { color: white; }
                .eac-dark .eac-rules-input { background: #252525; border-color: #444; color: white; }
                .eac-dark .eac-rules-list { border-color: #333; }
                .eac-dark .eac-rule-item { border-color: #333; }
                .eac-dark .eac-rule-item:hover { background: #252525; }
                .eac-dark .eac-stat-card { background: #252525; }
                .eac-dark .eac-stat-label { color: #aaa; }
                .eac-dark .eac-top-item { border-color: #333; }
            `);
        },

        createContainer() {
            const html = `
                <div id="eac-container">
                    <button id="eac-toggle" title="邮件广告清理助手">
                        <svg viewBox="0 0 24 24"><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/></svg>
                    </button>
                    <div id="eac-panel">
                        <div id="eac-header">
                            <h3 style="display:flex;align-items:center;gap:8px;">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                                广告清理助手
                            </h3>
                            <div id="eac-header-btns">
                                <button id="eac-minimize" title="最小化">－</button>
                                <button id="eac-close" title="关闭">×</button>
                            </div>
                        </div>
                        <div id="eac-toolbar">
                            <button id="eac-scan-btn">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                                扫描邮件
                            </button>
                            <span id="eac-status">点击扫描开始检测</span>
                        </div>
                        <div id="eac-actions" style="display:none;">
                            <label id="eac-select-all">
                                <input type="checkbox" id="eac-select-all-cb">
                                <span>全选 (<span id="eac-count">0</span>)</span>
                            </label>
                            <button id="eac-delete-btn" disabled>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                                移到垃圾箱
                            </button>
                        </div>
                        <div id="eac-list">
                            <div id="eac-empty">
                                <svg viewBox="0 0 24 24"><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/></svg>
                                <p>点击"扫描邮件"开始检测广告邮件</p>
                            </div>
                        </div>
                        <div id="eac-footer">
                            <div class="eac-footer-row">
                                <button id="eac-settings-btn" class="eac-footer-btn" title="设置"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg></button>
                                <button id="eac-whitelist-btn" class="eac-footer-btn" title="白名单"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg></button>
                                <button id="eac-blacklist-btn" class="eac-footer-btn" title="黑名单"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg></button>
                                <button id="eac-stats-btn" class="eac-footer-btn" title="统计"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg></button>
                            </div>
                            <div class="eac-footer-row">
                                <button id="eac-export-btn" class="eac-footer-btn" title="导出"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg></button>
                                <button id="eac-import-btn" class="eac-footer-btn" title="导入"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg></button>
                                <button id="eac-help-btn" class="eac-footer-btn" title="帮助"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></button>
                            </div>
                        </div>
                    </div>
                </div>
                <div id="eac-settings-modal" class="eac-modal">
                    <div class="eac-modal-content" id="eac-settings-content">
                        <div class="eac-modal-header">
                            <h4 style="display:flex;align-items:center;gap:8px;">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                                设置
                            </h4>
                            <button class="eac-modal-close" data-target="eac-settings-modal">×</button>
                        </div>
                        <div class="eac-modal-body">
                            <div class="eac-setting-item">
                                <label>广告识别阈值: <span id="eac-threshold-val">60</span></label>
                                <input type="range" id="eac-threshold" min="30" max="90" value="60">
                                <small style="color:#888;">分数高于此值将被标记为广告 (30-90)</small>
                            </div>
                            <div class="eac-setting-item">
                                <label><input type="checkbox" id="eac-autoscan"> 启用自动扫描</label>
                                <small style="color:#888;">邮件列表变化时自动检测 (实验性)</small>
                            </div>
                            <hr style="border:none;border-top:1px solid #eee;margin:16px 0;">
                            <h4>
                                <svg width="16" height="16" style="vertical-align:-2px;margin-right:4px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/></svg>
                                AI 智能识别
                            </h4>
                            <div class="eac-setting-item">
                                <label><input type="checkbox" id="eac-ai-enabled"> 启用 AI 辅助识别</label>
                                <small style="color:#888;">使用智谱 GLM-4-Flash (免费)</small>
                            </div>
                            <div class="eac-setting-item">
                                <label>API Key:</label>
                                <input type="password" id="eac-ai-apikey" placeholder="从 open.bigmodel.cn 获取" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;margin-top:4px;">
                                <button id="eac-ai-test" style="margin-top:8px;padding:6px 12px;border:1px solid #10B981;background:white;color:#10B981;border-radius:4px;cursor:pointer;">测试连接</button>
                            </div>
                            <div class="eac-setting-item">
                                <label>识别模式:</label>
                                <select id="eac-ai-mode" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;margin-top:4px;">
                                    <option value="hybrid">混合模式 (AI + 规则)</option>
                                    <option value="ai_only">仅 AI 识别</option>
                                    <option value="rules_only">仅规则识别</option>
                                </select>
                            </div>
                            <div id="eac-settings-btns">
                                <button id="eac-settings-cancel" class="eac-modal-close" data-target="eac-settings-modal">取消</button>
                                <button id="eac-settings-save">保存</button>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Rules Modal -->
                <div id="eac-rules-modal" class="eac-modal">
                    <div class="eac-modal-content">
                        <div class="eac-modal-header">
                            <h4 style="display:flex;align-items:center;gap:8px;">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                                规则管理
                            </h4>
                            <button class="eac-modal-close" data-target="eac-rules-modal">×</button>
                        </div>
                        <div class="eac-modal-body">
                            <div class="eac-rules-tabs">
                                <div class="eac-rules-tab active" data-tab="whitelist">白名单</div>
                                <div class="eac-rules-tab" data-tab="blacklist">黑名单</div>
                            </div>
                            <div class="eac-rules-input-group">
                                <input type="text" id="eac-rule-input" class="eac-rules-input" placeholder="输入邮箱或域名 (支持 * 通配符)">
                                <button id="eac-rule-add-btn" class="eac-rules-add-btn">添加</button>
                            </div>
                            <div id="eac-rules-list" class="eac-rules-list">
                                <!-- Rules inserted here -->
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Stats Modal -->
                <div id="eac-stats-modal" class="eac-modal">
                    <div class="eac-modal-content">
                        <div class="eac-modal-header">
                            <h4 style="display:flex;align-items:center;gap:8px;">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
                                清理统计
                            </h4>
                            <button class="eac-modal-close" data-target="eac-stats-modal">×</button>
                        </div>
                        <div class="eac-modal-body">
                            <div class="eac-stats-grid">
                                <div class="eac-stat-card">
                                    <span class="eac-stat-num" id="eac-stat-total">0</span>
                                    <span class="eac-stat-label">历史清理总数</span>
                                </div>
                                <div class="eac-stat-card">
                                    <span class="eac-stat-label" id="eac-stat-last">从未</span>
                                    <span class="eac-stat-label">上次清理时间</span>
                                </div>
                            </div>
                            <h4 style="display:flex;align-items:center;gap:8px;">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>
                                拦截来源 Top 5
                            </h4>
                            <ul id="eac-stat-top" class="eac-top-list">
                                <!-- Top list -->
                            </ul>
                        </div>
                    </div>
                </div>
                <div id="eac-confirm-modal">
                    <div id="eac-confirm-content">
                        <p>确定要将选中的 <span id="eac-confirm-count">0</span> 封邮件移到垃圾箱吗？</p>
                        <div id="eac-confirm-btns">
                            <button id="eac-confirm-no">取消</button>
                            <button id="eac-confirm-yes">确定</button>
                        </div>
                    </div>
                </div>
            `;

            const div = document.createElement('div');
            safeSetHTML(div, html);
            document.body.appendChild(div);
            this.container = document.getElementById('eac-container');
        },

        bindEvents() {
            // 切换面板
            document.getElementById('eac-toggle').addEventListener('click', () => {
                this.togglePanel();
            });

            // 最小化/关闭
            document.getElementById('eac-minimize').addEventListener('click', () => {
                this.togglePanel();
            });
            document.getElementById('eac-close').addEventListener('click', () => {
                this.togglePanel();
            });

            // 扫描按钮
            document.getElementById('eac-scan-btn').addEventListener('click', () => {
                this.startScan();
            });

            // 全选
            document.getElementById('eac-select-all-cb').addEventListener('change', (e) => {
                this.toggleSelectAll(e.target.checked);
            });

            // 删除按钮
            document.getElementById('eac-delete-btn').addEventListener('click', () => {
                this.showConfirmModal();
            });

            // 设置
            document.getElementById('eac-settings-btn').addEventListener('click', () => {
                this.showSettings();
            });
            document.getElementById('eac-settings-cancel').addEventListener('click', () => {
                this.hideSettings();
            });
            document.getElementById('eac-settings-save').addEventListener('click', () => {
                this.saveSettings();
            });
            document.getElementById('eac-threshold').addEventListener('input', (e) => {
                document.getElementById('eac-threshold-val').textContent = e.target.value;
            });

            // 确认弹窗
            document.getElementById('eac-confirm-no').addEventListener('click', () => {
                this.hideConfirmModal();
            });
            document.getElementById('eac-confirm-yes').addEventListener('click', () => {
                this.executeDelete();
            });

            // 白名单按钮
            document.getElementById('eac-whitelist-btn').addEventListener('click', () => {
                this.showWhitelist();
            });

            // 黑名单按钮
            document.getElementById('eac-blacklist-btn').addEventListener('click', () => {
                this.showBlacklist();
            });

            // 统计按钮
            document.getElementById('eac-stats-btn').addEventListener('click', () => {
                this.showStats();
            });

            // 导出按钮
            document.getElementById('eac-export-btn').addEventListener('click', () => {
                this.exportConfig();
            });

            // 导入按钮
            document.getElementById('eac-import-btn').addEventListener('click', () => {
                this.importConfig();
            });

            // 帮助按钮
            document.getElementById('eac-help-btn').addEventListener('click', () => {
                alert('📧 邮件广告清理助手 v2.1\n\n' +
                    '🔍 使用方法:\n' +
                    '1. 点击"扫描邮件"扫描当前列表\n' +
                    '2. 勾选要清理的邮件\n' +
                    '3. 点击"移到垃圾箱"清理\n\n' +
                    '🛡 规则管理:\n' +
                    '• 支持从白名单/黑名单列表添加和删除\n' +
                    '• 支持通配符 (例如 *@spam.com)\n\n' +
                    '🤖 AI 智能识别:\n' +
                    '• 可在设置中开启 AI 辅助\n' +
                    '• 混合模式下，AI 结果将提高规则评分');
            });

            // Modal Close Buttons
            document.querySelectorAll('.eac-modal-close').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const targetId = e.target.dataset.target;
                    if (targetId) {
                        document.getElementById(targetId).classList.remove('active');
                    }
                });
            });

            // Rules Tabs
            document.querySelectorAll('.eac-rules-tab').forEach(tab => {
                tab.addEventListener('click', (e) => {
                    this.currentRulesTab = e.target.dataset.tab;
                    this.openRulesModal(); // Re-render
                });
            });

            // Rule Add Button
            document.getElementById('eac-rule-add-btn').addEventListener('click', () => {
                this.addRule();
            });
            document.getElementById('eac-rule-input').addEventListener('keydown', (e) => {
                if (e.key === 'Enter') this.addRule();
            });
        },

        togglePanel() {
            const panel = document.getElementById('eac-panel');
            const toggle = document.getElementById('eac-toggle');
            this.isMinimized = !this.isMinimized;

            if (this.isMinimized) {
                panel.classList.remove('active');
                toggle.style.display = 'flex';
            } else {
                panel.classList.add('active');
                toggle.style.display = 'none';
            }
        },

        async startScan(isAuto = false) {
            if (this.isScanning) return; // 防止重复执行
            this.isScanning = true;

            const btn = document.getElementById('eac-scan-btn');
            const status = document.getElementById('eac-status');

            if (!isAuto) {
                btn.disabled = true;
                btn.textContent = '⏳ 扫描中...';
                status.textContent = '正在扫描邮件列表...';
            }

            await new Promise(r => setTimeout(r, CONFIG.scanDelay));

            const adapter = new PlatformAdapter();
            if (!adapter.platform) {
                if (!isAuto) {
                    status.textContent = '❌ 不支持当前邮箱平台';
                    btn.disabled = false;
                    btn.textContent = '🔍 扫描邮件';
                }
                this.isScanning = false;
                return;
            }

            const mails = adapter.getMailList();
            this.scanResults = [];

            // 获取 AI 设置
            const aiSettings = Storage.getAISettings();
            let aiResults = null;

            // 如果启用了 AI 并且有 API Key
            if (aiSettings.enabled && aiSettings.apiKey && aiSettings.mode !== 'rules_only') {
                status.textContent = '🤖 AI 分析中 (最多15秒)...';
                const startTime = Date.now();
                aiResults = await AIClient.analyze(mails, aiSettings.apiKey, (msg) => {
                    status.textContent = `🤖 ${msg}`;
                });
                const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
                if (aiResults) {
                    const adCount = aiResults.filter(r => r.isAd).length;
                    Toast.success(`AI分析完成(${elapsed}s)，识别${adCount}封广告`);
                } else {
                    Toast.warning('AI分析超时或失败，使用规则识别');
                }
            }

            // 处理每封邮件
            mails.forEach((mail, index) => {
                let score = 0;
                let details = [];
                let isAd = false;

                // 规则识别
                if (aiSettings.mode !== 'ai_only') {
                    const ruleResult = AdDetector.calculateScore(mail);
                    score = ruleResult.score;
                    details = [...ruleResult.details];
                    isAd = ruleResult.isAd;
                }

                // AI 识别结果合并
                if (aiResults) {
                    const aiResult = aiResults.find(r => r.index === index + 1);
                    if (aiResult) {
                        if (aiSettings.mode === 'ai_only') {
                            // 仅 AI 模式
                            score = aiResult.confidence;
                            isAd = aiResult.isAd;
                            details = [`🤖 AI: ${aiResult.reason}`];
                        } else {
                            // 混合模式：AI 结果加权
                            if (aiResult.isAd) {
                                const aiScore = Math.round(aiResult.confidence * 0.4);
                                score += aiScore;
                                details.push(`🤖 AI判定(+${aiScore}): ${aiResult.reason}`);
                                isAd = score >= (Storage.getSettings().threshold || CONFIG.threshold);
                            }
                        }
                    }
                }

                if (isAd) {
                    this.scanResults.push({
                        ...mail,
                        score: Math.min(score, 100),
                        details,
                        selected: true
                    });
                    adapter.highlightMail(mail, true);
                }
            });

            this.renderResults();

            if (isAuto) {
                // 自动模式下，只有发现新广告才提示
                if (this.scanResults.length > 0) {
                    status.textContent = `自动扫描: 发现 ${this.scanResults.length} 封广告`;
                    // 避免太频繁打扰，仅在首次发现或数量增加时提示(这里简化处理)
                }
            } else {
                status.textContent = `发现 ${this.scanResults.length} 封疑似广告邮件`;
                btn.disabled = false;
                btn.textContent = '🔍 重新扫描';
            }

            this.isScanning = false;
        },

        renderResults() {
            const list = document.getElementById('eac-list');
            const actions = document.getElementById('eac-actions');
            const count = document.getElementById('eac-count');

            if (this.scanResults.length === 0) {
                safeSetHTML(list, `
                    <div id="eac-empty">
                        <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>
                        <p>未发现广告邮件 ✨</p>
                    </div>
                `);
                actions.style.display = 'none';
                return;
            }

            actions.style.display = 'flex';
            count.textContent = this.scanResults.length;

            safeSetHTML(list, this.scanResults.map((mail, index) => `
                <div class="eac-mail-item" data-index="${index}">
                    <input type="checkbox" class="eac-item-cb" ${mail.selected ? 'checked' : ''}>
                    <div class="eac-mail-info">
                        <div class="eac-mail-subject" title="${this.escapeHtml(mail.subject)}">${this.escapeHtml(mail.subject) || '(无主题)'}</div>
                        <div class="eac-mail-sender" title="${this.escapeHtml(mail.sender)}">${this.escapeHtml(mail.sender)}</div>
                    </div>
                    <span class="eac-mail-score ${mail.score >= 80 ? 'high' : ''}" title="点击查看详情">${mail.score}分</span>
                    <div class="eac-mail-actions">
                        <button class="eac-whitelist-btn" title="加入白名单">✓</button>
                        <button class="eac-blacklist-btn" title="加入黑名单">×</button>
                    </div>
                </div>
            `).join(''));

            // 绑定复选框事件
            list.querySelectorAll('.eac-item-cb').forEach((cb, index) => {
                cb.addEventListener('change', () => {
                    this.scanResults[index].selected = cb.checked;
                    this.updateDeleteButton();
                });
            });

            // 绑定白名单按钮事件
            list.querySelectorAll('.eac-whitelist-btn').forEach((btn, index) => {
                btn.addEventListener('click', () => {
                    const mail = this.scanResults[index];
                    Storage.addToWhitelist(mail.sender);
                    this.scanResults.splice(index, 1);
                    this.renderResults();
                    Toast.success(`已将 ${mail.sender} 加入白名单`);
                });
            });

            // 绑定黑名单按钮事件
            list.querySelectorAll('.eac-blacklist-btn').forEach((btn, index) => {
                btn.addEventListener('click', () => {
                    const mail = this.scanResults[index];
                    Storage.addToBlacklist(mail.sender);
                    Toast.info(`已将 ${mail.sender} 加入黑名单`);
                });
            });

            this.updateDeleteButton();
        },

        escapeHtml(str) {
            if (!str) return '';
            return str.replace(/[&<>"']/g, (m) => ({
                '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
            })[m]);
        },

        toggleSelectAll(checked) {
            this.scanResults.forEach(mail => mail.selected = checked);
            document.querySelectorAll('.eac-item-cb').forEach(cb => cb.checked = checked);
            this.updateDeleteButton();
        },

        updateDeleteButton() {
            const selected = this.scanResults.filter(m => m.selected).length;
            const btn = document.getElementById('eac-delete-btn');
            const selectAllCb = document.getElementById('eac-select-all-cb');

            btn.disabled = selected === 0;
            btn.textContent = `🗑 移到垃圾箱 (${selected})`;
            selectAllCb.checked = selected === this.scanResults.length && this.scanResults.length > 0;
        },

        showConfirmModal() {
            const selected = this.scanResults.filter(m => m.selected).length;
            document.getElementById('eac-confirm-count').textContent = selected;
            document.getElementById('eac-confirm-modal').classList.add('active');
        },

        hideConfirmModal() {
            document.getElementById('eac-confirm-modal').classList.remove('active');
        },

        executeDelete() {
            this.hideConfirmModal();

            const adapter = new PlatformAdapter();
            const selected = this.scanResults.filter(m => m.selected);

            // 选中要删除的邮件
            selected.forEach(mail => {
                adapter.selectMail(mail);
            });

            // 延迟执行删除
            setTimeout(() => {
                const success = adapter.deleteSelected();
                if (success) {
                    // 更新统计数据
                    Storage.updateStats(selected.length, selected.map(m => m.sender));
                    // 从结果中移除已删除的邮件
                    this.scanResults = this.scanResults.filter(m => !m.selected);
                    this.renderResults();
                    document.getElementById('eac-status').textContent = `已清理 ${selected.length} 封邮件`;
                    Toast.success(`已成功清理 ${selected.length} 封广告邮件`);
                } else {
                    Toast.error('删除失败，请手动操作或刷新页面重试');
                }
            }, 500);
        },

        showSettings() {
            // 加载普通设置
            const settings = Storage.getSettings();
            document.getElementById('eac-threshold').value = settings.threshold;
            document.getElementById('eac-threshold-val').textContent = settings.threshold;
            document.getElementById('eac-autoscan').checked = settings.autoScan || false;

            // 加载 AI 设置
            const aiSettings = Storage.getAISettings();
            document.getElementById('eac-ai-enabled').checked = aiSettings.enabled;
            document.getElementById('eac-ai-apikey').value = aiSettings.apiKey || '';
            document.getElementById('eac-ai-mode').value = aiSettings.mode || 'hybrid';

            // ... (AI test button logic) ...
            const testBtn = document.getElementById('eac-ai-test');
            testBtn.onclick = async () => {
                const apiKey = document.getElementById('eac-ai-apikey').value.trim();
                // ... (existing logic) ...
                if (!apiKey) {
                    Toast.warning('请先输入 API Key');
                    return;
                }
                testBtn.textContent = '测试中...';
                testBtn.disabled = true;
                const ok = await AIClient.testKey(apiKey);
                testBtn.textContent = '测试连接';
                testBtn.disabled = false;
                if (ok) {
                    Toast.success('连接成功！');
                } else {
                    Toast.error('连接失败，请检查 API Key');
                }
            };

            document.getElementById('eac-settings-modal').classList.add('active');
        },

        showSettings() {
            document.getElementById('eac-settings-modal').classList.add('active');
            // Load current settings
            document.getElementById('eac-threshold').value = Storage.getSettings().threshold || CONFIG.threshold;
            document.getElementById('eac-threshold-val').textContent = document.getElementById('eac-threshold').value;
            document.getElementById('eac-autoscan').checked = Storage.getSettings().autoScan;

            const aiSettings = Storage.getAISettings();
            document.getElementById('eac-ai-enabled').checked = aiSettings.enabled;
            document.getElementById('eac-ai-apikey').value = aiSettings.apiKey || '';
            document.getElementById('eac-ai-mode').value = aiSettings.mode || 'hybrid';
        },

        hideSettings() {
            document.getElementById('eac-settings-modal').classList.remove('active');
        },

        saveSettings() {
            // 保存普通设置
            const threshold = parseInt(document.getElementById('eac-threshold').value);
            const autoScan = document.getElementById('eac-autoscan').checked;

            const currentSettings = Storage.getSettings();
            const settingsChanged = currentSettings.autoScan !== autoScan;

            Storage.saveSettings({ ...currentSettings, threshold, autoScan });

            // 保存 AI 设置
            const aiEnabled = document.getElementById('eac-ai-enabled').checked;
            const apiKey = document.getElementById('eac-ai-apikey').value.trim();
            const aiMode = document.getElementById('eac-ai-mode').value;
            Storage.saveAISettings({ enabled: aiEnabled, apiKey, mode: aiMode });

            this.hideSettings();
            Toast.success('设置已保存');

            // 如果自动扫描设置变更，重启扫描器
            if (settingsChanged) {
                AutoScanner.restart();
            }
        },

        // 规则管理相关
        currentRulesTab: 'whitelist',

        showWhitelist() {
            this.currentRulesTab = 'whitelist';
            this.openRulesModal();
        },

        showBlacklist() {
            this.currentRulesTab = 'blacklist';
            this.openRulesModal();
        },

        openRulesModal() {
            const modal = document.getElementById('eac-rules-modal');
            modal.classList.add('active');
            this.renderRules();

            // 更新 Tab 状态
            document.querySelectorAll('.eac-rules-tab').forEach(t => {
                t.classList.toggle('active', t.dataset.tab === this.currentRulesTab);
            });
        },

        renderRules() {
            const listEl = document.getElementById('eac-rules-list');
            listEl.innerHTML = '';
            const list = this.currentRulesTab === 'whitelist' ? Storage.getWhitelist() : Storage.getBlacklist();

            if (list.length === 0) {
                listEl.innerHTML = '<div style="padding:20px;text-align:center;color:#999;">暂无规则</div>';
                return;
            }

            list.forEach(item => {
                const el = document.createElement('div');
                el.className = 'eac-rule-item';
                el.innerHTML = `
                    <span class="eac-rule-text">${item}</span>
                    <span class="eac-rule-del" title="删除">🗑</span>
                `;
                el.querySelector('.eac-rule-del').addEventListener('click', () => {
                    this.removeRule(item);
                });
                listEl.appendChild(el);
            });
        },

        addRule() {
            const input = document.getElementById('eac-rule-input');
            const val = input.value.trim();
            if (!val) return;

            const success = this.currentRulesTab === 'whitelist'
                ? Storage.addToWhitelist(val)
                : Storage.addToBlacklist(val);

            if (success) {
                input.value = '';
                this.renderRules();
                Toast.success(`已添加到${this.currentRulesTab === 'whitelist' ? '白名单' : '黑名单'}`);
            } else {
                Toast.warning('规则已存在');
            }
        },

        removeRule(val) {
            if (this.currentRulesTab === 'whitelist') {
                Storage.removeFromWhitelist(val);
            } else {
                Storage.removeFromBlacklist(val);
            }
            this.renderRules();
        },

        // 显示统计面板
        showStats() {
            const modal = document.getElementById('eac-stats-modal');
            const stats = Storage.getStats();

            document.getElementById('eac-stat-total').textContent = stats.totalCleaned;
            document.getElementById('eac-stat-last').textContent = stats.lastCleanDate ? new Date(stats.lastCleanDate).toLocaleDateString() : '从未';

            const topList = document.getElementById('eac-stat-top');
            topList.innerHTML = '';

            const topSenders = Object.entries(stats.topSenders)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5);

            if (topSenders.length === 0) {
                topList.innerHTML = '<li style="text-align:center;color:#999;padding:10px;">暂无数据</li>';
            } else {
                topSenders.forEach(([email, count]) => {
                    topList.innerHTML += `
                        <li class="eac-top-item">
                            <span style="font-family:monospace;">${email}</span>
                            <b>${count}</b>
                        </li>
                    `;
                });
            }

            modal.classList.add('active');
        },

        // 导出配置
        exportConfig() {
            const config = Storage.exportConfig();
            const blob = new Blob([config], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `email-ad-cleaner-config-${new Date().toISOString().slice(0, 10)}.json`;
            a.click();
            URL.revokeObjectURL(url);
            Toast.success('配置已导出');
        },

        // 导入配置
        importConfig() {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json';
            input.onchange = (e) => {
                const file = e.target.files[0];
                if (file) {
                    const reader = new FileReader();
                    reader.onload = (e) => {
                        if (Storage.importConfig(e.target.result)) {
                            Toast.success('配置导入成功');
                        } else {
                            Toast.error('配置导入失败');
                        }
                    };
                    reader.readAsText(file);
                }
            };
            input.click();
        },

        // 键盘快捷键绑定
        bindKeyboardShortcuts() {
            document.addEventListener('keydown', (e) => {
                // Ctrl+Shift+S - 快速扫描
                if (e.ctrlKey && e.shiftKey && e.key === 'S') {
                    e.preventDefault();
                    if (!this.isMinimized) {
                        this.startScan();
                    }
                }
                // Ctrl+Shift+D - 删除选中
                if (e.ctrlKey && e.shiftKey && e.key === 'D') {
                    e.preventDefault();
                    const selected = this.scanResults.filter(m => m.selected).length;
                    if (selected > 0) {
                        this.showConfirmModal();
                    }
                }
                // Esc - 关闭面板
                if (e.key === 'Escape') {
                    if (!this.isMinimized) {
                        this.togglePanel();
                    }
                    this.hideSettings();
                    this.hideConfirmModal();
                }
            });
        },

        // 应用深色模式
        applyDarkMode() {
            const settings = Storage.getSettings();
            const isDark = settings.darkMode === 'dark' ||
                (settings.darkMode === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);

            if (isDark) {
                this.container?.classList.add('eac-dark');
            } else {
                this.container?.classList.remove('eac-dark');
            }

            // 监听系统主题变化
            window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
                if (Storage.getSettings().darkMode === 'auto') {
                    this.applyDarkMode();
                }
            });
        }
    };


    // ============================================
    // 工具函数
    // ============================================
    const Utils = {
        // 等待元素出现
        waitForElement(selector, timeout = 10000) {
            return new Promise((resolve) => {
                if (document.querySelector(selector)) {
                    return resolve(document.querySelector(selector));
                }

                const observer = new MutationObserver(() => {
                    const el = document.querySelector(selector);
                    if (el) {
                        resolve(el);
                        observer.disconnect();
                    }
                });

                observer.observe(document.body, {
                    childList: true,
                    subtree: true
                });

                if (timeout > 0) {
                    setTimeout(() => {
                        observer.disconnect();
                        resolve(null);
                    }, timeout);
                }
            });
        },

        // 防抖函数
        debounce(func, wait) {
            let timeout;
            return function (...args) {
                clearTimeout(timeout);
                timeout = setTimeout(() => func.apply(this, args), wait);
            };
        }
    };

    // ============================================
    // 自动扫描管理器
    // ============================================
    const AutoScanner = {
        observer: null,
        isScanning: false,

        init() {
            const settings = Storage.getSettings();
            if (settings.autoScan) {
                this.start();
            }
        },

        start() {
            if (this.observer) return;

            console.log('[邮件广告清理助手] 启动自动扫描监听...');
            const adapter = new PlatformAdapter();
            if (!adapter.config) return;

            // 针对不同平台的容器策略
            // 部分平台(如Gmail)是动态加载的，可能需要监听更大的范围
            let targetNode = document.body;
            const containerSelector = adapter.config.selectors.container;

            // 尝试获取具体容器，如果不存在则监听 body
            const container = document.querySelector(containerSelector);
            if (container) targetNode = container;

            this.observer = new MutationObserver(Utils.debounce(() => {
                // 页面变化时触发
                // 检查是否正在扫描，避免重复
                // 检查 UI 面板是否显示，如果显示则可能用户正在操作，暂不自动扫描(或者根据需求)
                // 这里我们选择：只要检测到列表变化，且当前不在扫描中，就尝试扫描

                // 再次检查目标容器是否存在(针对单页应用切换路由的情况)
                const currentAdapter = new PlatformAdapter();
                if (!currentAdapter.platform) return;

                if (!UI.isScanning) { //通过 UI 上的状态标记
                    // 只扫描，不自动删除，标记高亮
                    // 为了避免干扰，自动扫描模式下可以不弹出 Toast，或者只在发现广告时提示
                    UI.startScan(true); // true 表示自动模式
                }
            }, 1500)); // 较长的防抖时间，确保页面加载稳定

            this.observer.observe(targetNode, {
                childList: true,
                subtree: true
            });
        },

        stop() {
            if (this.observer) {
                this.observer.disconnect();
                this.observer = null;
                console.log('[邮件广告清理助手] 停止自动扫描监听');
            }
        },

        restart() {
            this.stop();
            this.init();
        }
    };

    // ============================================
    // 主程序
    // ============================================
    async function init() {
        console.log('[邮件广告清理助手] 初始化中...');

        // 1. 等待核心元素加载
        // 由于不同平台加载速度不同，这里尝试先检测平台
        const tempAdapter = new PlatformAdapter();
        if (!tempAdapter.platform) {
            // 可能是 URL 匹配但内容还没加载（如 GmailLoading），或者完全不匹配
            // 简单的重试机制
        }

        // 我们使用一个通用的策略：等待 document.body 稳定，或者等待特定的邮件列表容器出现
        // 这里为了稳健，先尝试探测平台
        let adapter = new PlatformAdapter();
        let retryCount = 0;

        while (!adapter.platform && retryCount < 5) {
            await new Promise(r => setTimeout(r, 1000));
            adapter = new PlatformAdapter();
            retryCount++;
        }

        if (!adapter.platform) {
            console.log('[邮件广告清理助手] 未检测到支持的邮箱平台，脚本停止。');
            return;
        }

        console.log(`[邮件广告清理助手] 平台锁定: ${adapter.config.name}`);

        // 等待邮件列表容器出现
        const container = await Utils.waitForElement(adapter.config.selectors.container, 30000);

        if (!container) {
            console.log('[邮件广告清理助手] 超时未找到邮件列表容器 (可能需手动刷新)');
        } else {
            console.log('[邮件广告清理助手] 邮件容器已就绪');
        }

        // 初始化 UI
        UI.init();

        // 初始化自动扫描
        AutoScanner.init();
    }

    // 启动
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
