/**
 * 计算两个字符串的 Levenshtein 编辑距离
 * @param {string} a 
 * @param {string} b 
 * @returns {number} 编辑距离
 */
export function levenshteinDistance(a, b) {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;

    const matrix = [];

    // 初始化第一列和第一行
    for (let i = 0; i <= b.length; i++) {
        matrix[i] = [i];
    }
    for (let j = 0; j <= a.length; j++) {
        matrix[0][j] = j;
    }

    // 填充矩阵
    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1, // 替换
                    matrix[i][j - 1] + 1,     // 插入
                    matrix[i - 1][j] + 1      // 删除
                );
            }
        }
    }

    return matrix[b.length][a.length];
}

/**
 * 计算两个字符串的相似度 (0-1)
 * @param {string} a 
 * @param {string} b 
 * @returns {number} 相似度
 */
export function calculateSimilarity(a, b) {
    const maxLength = Math.max(a.length, b.length);
    if (maxLength === 0) return 1.0;
    const distance = levenshteinDistance(a, b);
    return 1.0 - (distance / maxLength);
}

/**
 * 高级 URL 标准化
 * 移除 UTM 参数，统一协议，移除尾部斜杠
 * @param {string} url 
 * @returns {string}
 */
export function normalizeUrlV2(url) {
    try {
        const u = new URL(url);

        // 移除常见的跟踪参数
        const paramsToRemove = [
            'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
            'fbclid', 'gclid', 'ref', 'source'
        ];

        paramsToRemove.forEach(p => u.searchParams.delete(p));

        // 移除末尾斜杠 (如果不是根路径)
        let cleanUrl = u.toString();
        if (cleanUrl.endsWith('/') && u.pathname !== '/') {
            cleanUrl = cleanUrl.slice(0, -1);
        }

        return cleanUrl.toLowerCase();
    } catch (e) {
        return url.toLowerCase();
    }
}

/**
 * 检测链接是否有效
 * @param {string} url 
 * @param {number} timeoutMs 
 * @returns {Promise<boolean>}
 */
export function checkUrlAlive(url, timeoutMs = 5000) {
    return new Promise((resolve) => {
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), timeoutMs);

        fetch(url, { method: 'HEAD', signal: controller.signal, mode: 'no-cors' })
            .then(response => {
                clearTimeout(id);
                // mode: 'no-cors' 返回 type: 'opaque'，status 为 0
                // 这意味着只要没报错，就认为连接成功（虽然不知道状态码）
                // 对于大多数书签检查这足够了
                resolve(true);
            })
            .catch(() => {
                // HEAD 失败尝试 GET
                fetch(url, { method: 'GET', signal: controller.signal, mode: 'no-cors' })
                    .then(() => {
                        clearTimeout(id);
                        resolve(true);
                    })
                    .catch(() => {
                        clearTimeout(id);
                        resolve(false);
                    });
            });
    });
}
