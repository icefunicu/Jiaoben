# Jiaoben Project Collection (脚本工具集)

本项目是一个实用工具和脚本的集合，旨在提升开发效率和浏览体验。包含浏览器扩展、Web 应用比较工具以及用户脚本。

## 目录结构

- `bookmark-organizer-extension/`: **AI 书签整理助手** - Chrome 浏览器扩展
- `ai-editor-comparison/`: **AI 编辑器对比** - Web 比较工具
- `email-ad-cleaner.user.js`: **邮件广告净化器** - 油猴脚本
- `.agent/`: Agent 配置与工作流

---

## 项目概览

### 1. AI 书签整理助手 (Bookmark Organizer Extension)
一个强大的 Chrome 浏览器扩展，利用 AI 技术自动化整理您的书签栏。

- **功能亮点**:
  - **AI 智能分类**: 自动识别书签内容并归类到合适文件夹。
  - **可视化预览**: 在执行整理前预览分类结果。
  - **重复去重**: 智能识别并合并重复书签。
  - **死链清理**: 自动检测并移除无效链接。
  - **隐私优先**: 支持本地 Trie 树匹配，敏感数据可控。

- **安装说明**:
  1. 打开 Chrome 扩展管理页面 (`chrome://extensions/`)。
  2. 开启右上角的 "开发者模式"。
  3. 点击 "加载已解压的扩展程序"，选择 `bookmark-organizer-extension` 目录。

### 2. AI 编辑器对比 (AI Editor Comparison)
一个简单的 Web 工具，用于直观对比不同 AI 代码编辑器（如 Cursor, Windsurf, Copilot 等）的特性。

- **使用方法**:
  - 直接在浏览器中打开 `ai-editor-comparison/index.html` 即可使用。

### 3. 邮件广告净化器 (Email Ad Cleaner)
用于清理网页版邮箱中广告元素的用户脚本。

- **安装方法**:
  - 需要先安装 Tampermonkey 或 Violentmonkey 插件。
  - 将 `email-ad-cleaner.user.js` 文件拖入浏览器或在脚本管理器中新建脚本并粘贴内容。

## 开发与贡献

欢迎提交 Issue 或 Pull Request 来改进这些工具。

- **环境要求**:
  - Node.js (用于部分工具开发)
  - Chrome 浏览器 (用于扩展测试)

## 许可证
本项目采用 MIT 许可证。
