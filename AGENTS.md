# AGENTS

本项目包含以下智能代理（Agents）或 AI 驱动的组件：

## 1. 书签整理智能体 (Bookmark Organizer Agent)

**所在位置**: `bookmark-organizer-extension/background.js`

### 角色描述
该 Agent 负责自动化管理用户的浏览器书签，通过 AI 语义分析对书签进行智能分类、清理和维护。

### 主要能力
- **智能分类**:
  - 调用 AI 模型 (通过 `chat/completions` API) 分析书签标题和 URL。
  - 结合页面元数据（Title/Description）进行更精准的语义理解。
  - 自动将书签归类到用户定义的或 AI 推荐的文件夹结构中。
  - 支持增量整理，避免重复处理已归档书签。

- **重复检测与清理**:
  - 基于 URL 及其相似度（Levenshtein 距离）检测重复书签。
  - 智能合并重复项，保留最早或最新的记录。

- **链接健康检查**:
  - 并发检测书签链接的有效性。
  - 自动标记或清理失效链接 (Dead Links)。

- **本地缓存**:
  - 使用 Trie 树和本地存储缓存 AI 分类结果，减少 API 调用成本并提高响应速度。

### 交互模式
- **系统挂钩 (System Hooks)**: 在后台运行，可以响应定时任务或用户手动触发的整理请求。
- **配置驱动**: 行为由用户设置的规则 (`rules`)、AI 配置 (`aiConfig`) 和调度策略 (`scheduleConfig`) 控制。

---

## 2. 辅助脚本与工具

虽然不是完全自治的 Agent，但以下组件包含了特定领域的自动化逻辑：

- **Email Ad Cleaner Agent**: (`email-ad-cleaner.user.js`)
  - **功能**: 在网页端拦截和清理邮件列表中的广告内容。
  - **运行环境**: 浏览器用户脚本管理器 (如 Tampermonkey)。
