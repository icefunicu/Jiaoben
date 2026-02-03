// ============================
// Trie 树匹配器 - 高效关键词匹配
// ============================

/**
 * Trie 树节点
 */
export class TrieNode {
    constructor() {
        this.children = new Map();
        this.isEnd = false;
        this.categories = new Set(); // 一个关键词可能对应多个分类
    }
}

/**
 * Trie 树匹配器
 * 用于高效的多关键词匹配
 */
export class TrieMatcher {
    constructor() {
        this.root = new TrieNode();
        this.regexRules = []; // 正则表达式规则
    }

    /**
     * 插入关键词
     * @param {string} keyword - 关键词
     * @param {string} category - 分类名称
     */
    insert(keyword, category) {
        if (!keyword || !category) return;

        const normalizedKeyword = keyword.toLowerCase();
        let node = this.root;

        for (const char of normalizedKeyword) {
            if (!node.children.has(char)) {
                node.children.set(char, new TrieNode());
            }
            node = node.children.get(char);
        }

        node.isEnd = true;
        node.categories.add(category);
    }

    /**
     * 批量插入规则
     * @param {Array<{name: string, keywords: string[]}>} rules - 规则数组
     */
    insertRules(rules) {
        for (const rule of rules) {
            if (!rule || !rule.name || !Array.isArray(rule.keywords)) continue;

            for (const keyword of rule.keywords) {
                // 检查是否是正则表达式（以 / 开头和结尾）
                if (keyword.startsWith("/") && keyword.endsWith("/") && keyword.length > 2) {
                    try {
                        const pattern = keyword.slice(1, -1);
                        this.regexRules.push({
                            regex: new RegExp(pattern, "i"),
                            category: rule.name
                        });
                    } catch (e) {
                        // 无效的正则表达式，当作普通关键词处理
                        this.insert(keyword, rule.name);
                    }
                } else {
                    this.insert(keyword, rule.name);
                }
            }
        }
    }

    /**
     * 在文本中查找所有匹配的关键词
     * @param {string} text - 要搜索的文本
     * @returns {Set<string>} 匹配到的分类集合
     */
    findMatches(text) {
        const matches = new Set();
        const normalizedText = (text || "").toLowerCase();

        // Trie 树匹配
        for (let i = 0; i < normalizedText.length; i++) {
            let node = this.root;
            let j = i;

            while (j < normalizedText.length && node.children.has(normalizedText[j])) {
                node = node.children.get(normalizedText[j]);

                if (node.isEnd) {
                    // 检查单词边界 (Word Boundary Check)
                    // 如果匹配的是 ASCII 字母/数字，则要求前后不能也是字母/数字
                    // 这防止 "Maven" 匹配 "av"，"Button" 匹配 "on" 等
                    const firstChar = normalizedText[i];
                    const lastChar = normalizedText[j];
                    const prevChar = normalizedText[i - 1];
                    const nextChar = normalizedText[j + 1];

                    const isAlphaNum = (c) => /[a-z0-9_]/i.test(c);

                    // 开始边界检查：如果首字符是字母数字，且前一字符也是，则无效
                    const startInvalid = isAlphaNum(firstChar) && isAlphaNum(prevChar);

                    // 结束边界检查：如果尾字符是字母数字，且后一字符也是，则无效
                    const endInvalid = isAlphaNum(lastChar) && isAlphaNum(nextChar);

                    if (!startInvalid && !endInvalid) {
                        for (const category of node.categories) {
                            matches.add(category);
                        }
                    }
                }

                j++;
            }
        }

        // 正则表达式匹配
        for (const rule of this.regexRules) {
            if (rule.regex.test(text)) {
                matches.add(rule.category);
            }
        }

        return matches;
    }

    /**
     * 匹配书签，返回第一个匹配的分类
     * @param {{title: string, url: string}} bookmark - 书签对象
     * @returns {string|null} 匹配的分类名称，或 null
     */
    match(bookmark) {
        const haystack = `${bookmark.title || ""} ${bookmark.url || ""}`;
        const matches = this.findMatches(haystack);

        // 返回第一个匹配的分类
        if (matches.size > 0) {
            return matches.values().next().value;
        }

        return null;
    }

    /**
     * 匹配书签，返回所有匹配的分类
     * @param {{title: string, url: string}} bookmark - 书签对象
     * @returns {string[]} 所有匹配的分类数组
     */
    matchAll(bookmark) {
        const haystack = `${bookmark.title || ""} ${bookmark.url || ""}`;
        const matches = this.findMatches(haystack);
        return Array.from(matches);
    }

    /**
     * 清空 Trie 树
     */
    clear() {
        this.root = new TrieNode();
        this.regexRules = [];
    }

    /**
     * 获取统计信息
     * @returns {{keywordCount: number, regexCount: number}}
     */
    getStats() {
        let keywordCount = 0;

        const countNodes = (node) => {
            if (node.isEnd) keywordCount++;
            for (const child of node.children.values()) {
                countNodes(child);
            }
        };

        countNodes(this.root);

        return {
            keywordCount,

            regexCount: this.regexRules.length
        };
    }
}


