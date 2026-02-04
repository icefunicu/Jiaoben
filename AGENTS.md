# AGENTS

本仓库的约定：**每个一级目录（或其直系子目录）视为一个独立项目**，项目之间 **不得交叉依赖/共享代码/互相引用配置**。  
（例如：`extensions/` 下每个扩展目录都是一个项目；`scripts/` 下每个脚本目录是一个项目。）

---

## 通用规范（适用于所有项目）

### 1) 边界与隔离（强制）
- **禁止跨项目引用**：不得从其它项目目录 `import/require`、复制粘贴共享模块、或在构建流程中读取其它项目文件。
- **禁止共享运行时数据**：`storage` 的 key 命名必须带项目前缀，避免与其它项目冲突。
- **禁止共享消息通道**：message type/channel 必须带项目前缀。

### 2) 权限、注入与隐私（强制）
- **最小权限**：Extension 的 `permissions/host_permissions`、Userscript 的 `@match/@grant` 必须精确。
- **最小注入**：只在必要页面注入 content script / DOM 逻辑；避免全站常驻监听/高频轮询。
- **网络请求可审计**：任何外部请求必须说明：目的、触发条件、失败策略、可关闭开关（如适用）。
- **数据最小化**：仅处理实现功能所需数据；禁止采集敏感信息（密码/验证码/支付/证件/整页内容上传）。

### 3) 可控与可回滚（强制）
- 新增功能尽量可通过配置/开关禁用。
- 存储结构建议带 `schemaVersion`（或等价字段），变更需迁移策略（至少不崩溃）。

### 4) 可验证性（强制）
- 任何变更必须给出可复现的验证命令（至少 1 条），命令与预期结果写在提交/PR 说明中。
- 触及权限/匹配范围/外部请求/存储结构时，必须给出 `rg`（或等价）命令与输出证据。
- 对外请求必须在项目 README 或入口文件头部维护“外部请求清单”：域名、用途、触发条件、失败策略、开关。
- 任何“例外/临时放宽”必须在本文件标注：范围、原因、计划整改时间或触发条件。

---

# 项目清单（以当前目录结构为准）

## 1) 扩展：Bookmark Organizer（书签整理智能体）

**项目目录**：`extensions/bookmark-organizer/`
**主要文件**（入口/资源）：
- `extensions/bookmark-organizer/manifest.json`
- `extensions/bookmark-organizer/background.js`
- `extensions/bookmark-organizer/popup.html`
- `extensions/bookmark-organizer/popup.js`
- `extensions/bookmark-organizer/options.html`
- `extensions/bookmark-organizer/options.js`
- `extensions/bookmark-organizer/shared.js`
- `extensions/bookmark-organizer/utils/algorithms.js`
- `extensions/bookmark-organizer/trie.js`
- `extensions/bookmark-organizer/styles.css`

### 角色描述
自动化管理用户书签：AI 语义分类、增量整理、重复检测与清理、链接健康检查、本地缓存。

### 主要能力（精简）
- **智能分类**：调用 AI（`chat/completions`）分析书签标题/URL（必要时结合页面元数据）并归档到文件夹结构；支持增量整理。
- **重复检测**：基于 URL/相似度（如 Levenshtein）识别重复项并按策略合并。
- **健康检查**：并发检查链接可用性，标记/清理失效链接。
- **本地缓存**：缓存分类结果降低成本（示例：Trie + 本地存储）。

### 强制约束（本项目内）
- 上传/发送到 AI 的数据必须是**必要字段最小集合**（例如标题、URL、少量元数据），禁止整页内容/敏感信息。
- AI 调用必须具备：超时、失败回退（跳过/规则兜底）、速率限制、重试上限。
- 缓存可清理，升级时可失效重建或迁移。

---

## 2) 扩展：Terminology Sidebar（术语侧边栏）

**项目目录**：`extensions/terminology-sidebar/`  
**主要文件**（入口/资源）：
- `extensions/terminology-sidebar/manifest.json`
- `extensions/terminology-sidebar/background.js`
- `extensions/terminology-sidebar/contentScript.js`
- `extensions/terminology-sidebar/sidebar.html`
- `extensions/terminology-sidebar/sidebar.css`
- `extensions/terminology-sidebar/sidebar.js`
- `extensions/terminology-sidebar/worker.js`
- `extensions/terminology-sidebar/_locales/`（多语言）
- `extensions/terminology-sidebar/data/`（术语/词库数据）
- `extensions/terminology-sidebar/tools/build_glossary.py`（构建词库工具）

### 角色描述
在指定网页中注入高性能术语侧边栏 UI，提供术语查询/展示能力；采用 Web Worker + AC 自动机 + CSS Highlight API 等前沿技术架构。

### 主要能力（精简）
- **内容注入**：`contentScript.js` 在目标页面加载侧边栏容器/交互挂钩；使用 `worker.js` (Web Worker) 进行后台异步术语匹配。
- **高性能高亮**：集成 CSS Custom Highlight API 实现无 DOM 侵入的高效文本高亮。
- **侧边栏 UI**：`sidebar.*` 负责展示与交互（虚拟列表、骨架屏、Toast 通知）。
- **数据构建**：`tools/build_glossary.py` 将来源数据构建为可被扩展使用的格式（输出进入 `data/` 或构建产物目录）。
- **本地化**：通过 `_locales/` 支持多语言文案。

### 强制约束（本项目内）
- content script 注入范围必须由 `manifest.json` 精确控制，禁止泛匹配。
- MutationObserver/事件监听必须有释放策略，避免内存与性能问题。
- `data/` 只存项目所需数据；构建工具不得读取其它项目目录作为输入。

---

## 3) scripts（用户脚本项目集合）

**目录**：`scripts/`  
约定：`scripts/` 下 **每个脚本目录都是一个独立项目**，互不依赖。

### 3.1 Email Ad Cleaner Agent
- **目录**：`scripts/email-ad-cleaner/`
- **入口**：`scripts/email-ad-cleaner/email-ad-cleaner.user.js`
- **功能**：在网页端清理邮件列表广告内容（规则 + 可选 AI 判别），支持 Gmail/Outlook/QQ/163/126。
- **外部请求清单**：`open.bigmodel.cn`（AI 判别，手动开启，失败回退为规则引擎）。
- **强制约束**：
  - `@match` 必须精确到目标站点；禁止 `*://*/*`。
  - 禁止注入远程脚本；必要资源优先本地化。
  - 监听/轮询必须有退出条件与频率限制。
  - AI 请求必须可关闭，并具备超时/失败回退。

### 3.2 GitHub/Gitee Enhancer
- **目录**：`scripts/github-enhancer/`
- **入口**：`scripts/github-enhancer/github-enhancer.user.js`
- **功能**：增强 GitHub/Gitee 仓库页体验（build size、repo size、TOC、commit 预览、依赖列表、复制按钮等），包含外部请求与缓存。
- **外部请求清单**：`bundlephobia.com`（构建体积）、`api.github.com`（仓库信息）、`raw.githubusercontent.com`（读取文件）、`gitee.com`（仓库数据）。
- **强制约束**：
  - 外部请求必须说明目的/触发/失败策略，并提供可关闭开关或降级策略。
  - 缓存需可清理，并设置有效期。
  - 仅在相关页面注入/绑定事件，避免全站高频监听。

### 3.3 Immersive Reader
- **目录**：`scripts/immersive-reader/`
- **入口**：`scripts/immersive-reader/immersive-reader.user.js`
- **功能**：一键提取正文并提供沉浸式阅读 UI（主题/布局/目录/进度/记忆）。
- **强制约束**：
  - `@match` 必须精确到目标站点；禁止 `*://*/*`。
  - DOM 注入需可回收，退出阅读模式必须清理状态。
  - 不得采集或上传页面敏感信息。

### 3.x 已知例外与整改
- `scripts/immersive-reader/immersive-reader.user.js` 当前 `@match` 为 `*://*/*`，与“最小匹配”冲突。短期保留用于通用阅读器覆盖面，需在整改时收敛到明确域名清单或提供安装时的可选范围开关。
- `extensions/terminology-sidebar/manifest.json` 将 `matches` 放宽为 `<all_urls>`。原因：用户明确要求在所有网站可用。虽然已通过 Time Slicing 优化性能，但仍需在未来版本中增加“黑名单”或“点击激活”模式以减少干扰。

---

## 4) web（站点/页面项目）

### 4.1 AI Editor Matrix
- **项目目录**：`web/ai-editor-comparison/`
- **角色描述**：静态页面，对比主流 AI 编辑器；数据来源于 `web/ai-editor-comparison/data.json`。
- **约束**：默认不包含自治 Agent；如后续加入 AI 组件，需在本文件新增对应条目，并遵守“项目隔离、最小权限、可审计”。

---

## 提交前自检（最简版）
- [ ] 我是否只改动了一个项目目录内的内容（无跨项目引用/复制共享）？
- [ ] 是否新增或扩大了权限/匹配范围？是否在项目内说明原因与替代方案？
- [ ] 是否新增外部请求？是否注明目的/触发/失败策略/开关？
- [ ] 是否新增存储字段？是否有版本与迁移/失效策略？
- [ ] 是否引入高频监听/轮询？是否有解绑/停止条件？

## 最小验证命令（按改动选择其一或多条）
- Userscript 权限/匹配检查：`rg -n \"^// @match|^// @grant|^// @connect\" scripts\\**\\*.user.js`
- Extension 权限检查：`rg -n \"\\\"permissions\\\"|\\\"host_permissions\\\"\" extensions\\**\\manifest.json`
- 外部请求清单检查：`rg -n \"外部请求清单\" scripts\\**\\README.md scripts\\**\\*.user.js extensions\\**\\README.md extensions\\**\\*.js`
