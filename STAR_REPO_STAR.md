# 仓库 STAR 亮点总结（简历可用）

## 项目概览

- 浏览器扩展：Bookmark Organizer、Terminology Sidebar
- 用户脚本：Email Ad Cleaner、GitHub/Gitee Enhancer、Immersive Reader
- Web 工具：AI Editor Matrix

## STAR 条目

### 1) Terminology Sidebar：高性能术语识别与高亮

- **S**：需要在复杂网页中实时识别海量术语，且不能阻塞主线程或造成页面卡顿。
- **T**：在 content script 中实现高吞吐匹配与无侵入高亮，同时兼容 CSP 限制与旧版浏览器。
- **A**：通过 iframe 代理初始化 Worker，采用批量分片扫描与异步结果回传机制；高亮层使用 CSS Custom Highlight API，并提供 DOM 回退方案。
- **R**：覆盖 2,290 条双语词条（EN 1,145 / ZH 1,145）、4 个领域数据包、2 个语言包，列表构建上限 2,000 条，适配高术语密度页面。

证据： [scanner.js:L1-L218](file:///e:/Project/Jiaoben/extensions/terminology-sidebar/src/content/scanner.js#L1-L218) ｜ [highlighter.js:L1-L102](file:///e:/Project/Jiaoben/extensions/terminology-sidebar/src/content/highlighter.js#L1-L102)

### 2) GitHub/Gitee Enhancer：SPA 适配与缓存策略

- **S**：GitHub/Gitee 使用 Turbo/Pjax 导航导致脚本在单页路由切换中失效，频繁请求 API 又易触发限流。
- **T**：在 SPA 路由中稳定重注入功能，并减少外部 API 请求次数。
- **A**：Monkey-patch History API + 监听 turbo/pjax 事件 + MutationObserver 兜底；引入本地缓存与过期控制、清空缓存机制。
- **R**：提供 6 个功能开关，缓存过期为 24h，并附清空缓存入口，降低 API 频次。

证据： [github-enhancer.user.js:L596-L620](file:///e:/Project/Jiaoben/scripts/github-enhancer/github-enhancer.user.js#L596-L620) ｜ [github-enhancer.user.js:L360-L424](file:///e:/Project/Jiaoben/scripts/github-enhancer/github-enhancer.user.js#L360-L424)

### 3) Email Ad Cleaner：AI + 规则双引擎与失败回退

- **S**：跨 Gmail/Outlook/QQ/网易等平台的广告邮件识别准确率难以兼顾，AI 失败时也必须可用。
- **T**：建立 AI + 规则混合识别链路，并保证超时/失败回退到规则引擎。
- **A**：实现 AI 请求的超时与错误处理，AI 结果与规则打分融合，支持混合/仅 AI/仅规则模式切换。
- **R**：覆盖 8 个邮箱匹配入口/4 平台，规则库包含 18 个域名关键词、21 个发件人关键词、41/25/14 个高/中/低权重标题词，以及 8 个退订关键词。

证据： [email-ad-cleaner.user.js:L319-L448](file:///e:/Project/Jiaoben/scripts/email-ad-cleaner/email-ad-cleaner.user.js#L319-L448) ｜ [email-ad-cleaner.user.js:L1668-L1734](file:///e:/Project/Jiaoben/scripts/email-ad-cleaner/email-ad-cleaner.user.js#L1668-L1734)

### 4) Bookmark Organizer：高效匹配与并发治理

- **S**：大规模书签分类与清理需要高效规则匹配，同时要避免外部请求过载。
- **T**：设计低延迟匹配器与稳定的并发治理参数。
- **A**：构建 Trie + 正则混合匹配引擎并加入单词边界约束；配置并发上限、速率限制、重试次数与延迟。
- **R**：并发上限 3、速率 5 req/s、失败重试 3 次、重试延迟 1000ms，具备稳定的流控保护参数。

证据： [trie.js:L1-L188](file:///e:/Project/Jiaoben/extensions/bookmark-organizer/trie.js#L1-L188) ｜ [shared.js:L200-L226](file:///e:/Project/Jiaoben/extensions/bookmark-organizer/shared.js#L200-L226)

### 5) AI Editor Matrix：数据驱动渲染与容错加载

- **S**：需要用轻量前端展示多维度对比数据，并保证数据加载失败时页面可用。
- **T**：实现纯前端的数据加载、过滤、搜索、排序与渲染。
- **A**：基于 data.json 异步拉取数据，执行转义与校验；提供本地 fallback 数据并统一走筛选与渲染逻辑。
- **R**：覆盖 16 款编辑器、23 个价格档位、62 个特性标签、22 个模型标签，平均每个编辑器 3.94 个特性。

证据： [script.js:L323-L398](file:///e:/Project/Jiaoben/web/ai-editor-comparison/script.js#L323-L398) ｜ [script.js:L421-L456](file:///e:/Project/Jiaoben/web/ai-editor-comparison/script.js#L421-L456)

## 技术难题与解决方案（提炼版）

- **SPA 路由失效**：通过 History API 劫持 + turbo/pjax 事件 + MutationObserver 兜底保证功能重注入。证据：[github-enhancer.user.js:L596-L620](file:///e:/Project/Jiaoben/scripts/github-enhancer/github-enhancer.user.js#L596-L620)
- **术语匹配阻塞主线程**：将匹配逻辑下沉到 Worker 并用消息回传聚合结果。证据：[scanner.js:L1-L218](file:///e:/Project/Jiaoben/extensions/terminology-sidebar/src/content/scanner.js#L1-L218)
- **高亮性能与兼容性**：使用 CSS Custom Highlight API 并提供 DOM 回退路径。证据：[highlighter.js:L1-L102](file:///e:/Project/Jiaoben/extensions/terminology-sidebar/src/content/highlighter.js#L1-L102)
- **AI 不稳定导致不可用**：AI 超时/错误返回后回退规则引擎，支持混合/仅 AI/仅规则模式。证据：[email-ad-cleaner.user.js:L319-L448](file:///e:/Project/Jiaoben/scripts/email-ad-cleaner/email-ad-cleaner.user.js#L319-L448)
- **并发与速率风险**：设置最大并发、速率上限与重试延迟，防止外部调用过载。证据：[shared.js:L200-L226](file:///e:/Project/Jiaoben/extensions/bookmark-organizer/shared.js#L200-L226)

## 证据索引（核心路径）

- [scanner.js](file:///e:/Project/Jiaoben/extensions/terminology-sidebar/src/content/scanner.js)
- [highlighter.js](file:///e:/Project/Jiaoben/extensions/terminology-sidebar/src/content/highlighter.js)
- [github-enhancer.user.js](file:///e:/Project/Jiaoben/scripts/github-enhancer/github-enhancer.user.js)
- [email-ad-cleaner.user.js](file:///e:/Project/Jiaoben/scripts/email-ad-cleaner/email-ad-cleaner.user.js)
- [trie.js](file:///e:/Project/Jiaoben/extensions/bookmark-organizer/trie.js)
- [shared.js](file:///e:/Project/Jiaoben/extensions/bookmark-organizer/shared.js)
- [script.js](file:///e:/Project/Jiaoben/web/ai-editor-comparison/script.js)

## 量化指标摘要

- Terminology Sidebar：EN 1,145 / ZH 1,145 词条，4 个领域数据包，2 个语言包，列表上限 2,000 条
- GitHub/Gitee Enhancer：6 个功能开关，缓存过期 24h
- Email Ad Cleaner：8 个邮箱匹配入口，规则库 18 域名词/21 发件人词/41-25-14 标题词/8 退订词
- Bookmark Organizer：并发 3，限速 5 req/s，重试 3 次，重试延迟 1000ms
- AI Editor Matrix：16 编辑器/23 档位/62 特性/22 模型，均值 3.94 特性/编辑器
