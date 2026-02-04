# Jiaoben Project Collection (脚本工具集)

本项目是一个实用工具和脚本的集合，旨在提升开发效率和浏览体验。包含浏览器扩展、Web 应用比较工具以及用户脚本。

## 目录结构

- `extensions/`: 浏览器扩展
  - `bookmark-organizer/`: AI 书签整理助手
  - `terminology-sidebar/`: 术语小抄 Terminology Sidebar
- `scripts/`: 油猴脚本 (UserScripts)
  - `email-ad-cleaner/`: 邮件广告净化器
  - `github-enhancer/`: GitHub/Gitee 增强脚本
  - `immersive-reader/`: 沉浸式阅读器
- `web/`: Web 工具
  - `ai-editor-comparison/`: AI 编辑器对比矩阵

---

## 项目概览

### 1. 📧 [邮件广告净化器 (Email Ad Cleaner)](scripts/email-ad-cleaner/README.md)
**路径**: `scripts/email-ad-cleaner/`

智能识别并清理邮箱广告邮件的油猴脚本。
- **核心能力**: 规则+AI 双引擎拦截，支持 Gmail, Outlook, QQ, 163 等主流邮箱。
- **安装**: [此链接直接安装](scripts/email-ad-cleaner/email-ad-cleaner.user.js)

### 2. 🐙 [GitHub/Gitee 增强脚本 (Enhancer)](scripts/github-enhancer/README.md)
**路径**: `scripts/github-enhancer/`

专为开发者设计的代码托管平台增强工具。
- **核心能力**: 显示仓库/构建大小、悬浮目录、依赖分析，完美支持 SPA 页面跳转。
- **安装**: [此链接直接安装](scripts/github-enhancer/github-enhancer.user.js)

### 3. 🔖 [AI 书签整理助手 (Bookmark Organizer)](extensions/bookmark-organizer/README.md)
**路径**: `extensions/bookmark-organizer/`

利用 AI 技术自动化整理浏览器书签的 Chrome 扩展。
- **核心能力**: 智能分类、死链检测、重复去重。
- **使用**: 需要在 Chrome 开发者模式下加载已解压的扩展程序。

### 4. 🧩 术语小抄 Terminology Sidebar
**路径**: `extensions/terminology-sidebar/`

面向编程/软件工程的中英双语术语侧边栏扩展，离线词典优先，可选联网补全。
- **核心能力**: 自动识别术语、侧边栏检索/详情/高亮、在线补全与缓存。
- **使用**: 在 Chrome 开发者模式下加载已解压扩展目录。
- **注入范围**: developer.mozilla.org / wikipedia.org / wiktionary.org / stackoverflow.com / github.com / gitlab.com / juejin.cn / segmentfault.com / medium.com / dev.to
- **权限**: storage、tabs；host_permissions 仅 wiki / wiktionary
- **外部请求清单**: wiktionary.org MediaWiki API（触发=启用联网补全，失败=空结果回退本地，开关=设置项“启用联网补全”）
- **外部请求补充**: wikipedia.org REST summary（触发=启用联网补全，失败=空结果回退本地，开关=设置项“启用联网补全”）
- **数据来源**: Wikidata（CC0）、MeSH（NLM Terms and Conditions）、FIBO（MIT License）
- **构建说明**: `extensions/terminology-sidebar/README.md`
- **存储前缀**: `ts:`（settings / onlineCache）
- **消息前缀**: `ts:`（sidebar 内部与 background 通信）
- **迁移策略**: 兼容旧键 `tsSettings` 与 `onlineCache`，首次加载自动迁移并清理旧键
- **验证命令**: `Get-ChildItem -Path extensions -Filter manifest.json -Recurse | Select-String -Pattern '"permissions"|"host_permissions"'`
- **验证命令**: `Select-String -Path README.md -Pattern 'wiktionary|wikipedia'`

### 5. 🤖 [AI 编辑器对比 (Editor Matrix)](web/ai-editor-comparison/README.md)
**路径**: `web/ai-editor-comparison/`

直观对比不同 AI 代码编辑器特性的 Web 工具。
- **核心能力**: 实时对比 Cursor, Copilot 等工具的价格与功能。
- **使用**: 直接浏览器打开 `index.html` 即可。

### 6. 📖 [沉浸式阅读器 (Immersive Reader)](scripts/immersive-reader/README.md)
**路径**: `scripts/immersive-reader/`

沉浸式网页阅读油猴脚本，自动抽取正文并提供多种阅读布局。
- **核心能力**: 一键净化阅读、主题/布局切换、目录与进度显示。
- **安装**: [此链接直接安装](scripts/immersive-reader/immersive-reader.user.js)

---

## 智能体 (Agents)

本项目部分组件采用 Agentic 架构设计，详情请参阅 [AGENTS.md](AGENTS.md)。

## 开发与贡献

欢迎提交 Issue 或 Pull Request 来改进这些工具。

- **环境要求**:
  - Node.js (用于部分工具开发)
  - Chrome 浏览器 (用于扩展测试)
  - Tampermonkey (用于脚本测试)

## 许可证

本项目采用 MIT 许可证。
