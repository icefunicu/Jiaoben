# GitHub/Gitee 增强脚本 (GitHub/Gitee Enhancer)

这是一个用户脚本 (UserScript)，旨在增强 GitHub 和 Gitee 的仓库首页体验。

## 功能

1.  **🚀 显示构建大小 (Build Size)**:
    - 自动在 `package.json` 所在的仓库首页显示 npm 包的压缩后大小 (minified) 和 Gzip 大小。
    - 使用 `GM_setValue` 缓存 API 响应，极大提升加载速度。

2.  **💾 仓库大小 (Repo Size)**:
    - **新功能**: 在 GitHub 仓库顶部（Star/Fork 旁）显示项目的总大小。
    - 数据来自 GitHub API，包含缓存机制。

3.  **📚 悬浮目录 (Floating TOC)**:
    - **新功能**: 自动解析 README.md 生成悬浮目录。
    - 目录条目优先中文，英文标题会自动生成双语显示。
    - 阅读时自动高亮当前章节，定位更直观。
    - 支持点击跳转和折叠/展开，阅读长文档更轻松。

4.  **📊 依赖关系概览 (Dependency Graph)**:
    - 在仓库顶部添加 "📊 Deps" 按钮。
    - 点击即可查看项目的 `dependencies` 和 `devDependencies` 列表，无需跳转页面。

5.  **👁️ 最近提交预览 (Commit Preview)**:
    - 悬停在最近一次提交的链接上，即可快速预览该提交的统计信息和文件变更列表。

6.  **⚡ 单页应用 (SPA) 支持**:
    - 完美适配 GitHub (Turbo/Pjax) 和 Gitee 的页面跳转机制。
    - 在浏览不同文件夹或返回上一级时，脚本功能会自动重新加载，无需手动刷新页面。

7.  **🔔 增强通知 (Toast Notifications)**:
    - 使用优雅的 Toast 提示替代原生弹窗，提供更好的交互体验。

8.  **📋 代码块复制 (Copy Button)**:
    - 代码块右上角提供一键复制按钮，便于快速复制片段。

## 🎨 预期效果

脚本启用后，你应该能看到以下变化：

- **顶部提示**: 打开 GitHub 页面时，右上角会出现绿色的 "GitHub Enhancer Loaded" 提示。
- **仓库大小**: 在仓库顶部的 Star/Fork 按钮旁边，会增加一个显示仓库大小的徽章（例如 "💾 1.2 MB"）。
- **TOC 目录**: 在查看 README 文档时，屏幕右侧会出现一个悬浮的目录窗口。
- **构建大小**: 只有在包含 `package.json` 的 npm 项目首页，文件列表上方才会显示 "minified / gzip" 大小徽章。

## 🛠️ 使用说明

脚本大部分功能是**自动运行**的，无需人工干预。

- **开关功能**: 
    - 如果你想通过菜单开关某些功能，请点击浏览器扩展图标（Tampermonkey/ScriptCat）。
    - 在脚本菜单下，你可以看到各项功能的开关状态（✅ 或 ❌）。
    - 点击即可切换，页面会自动刷新生效。
- **清空缓存 / Clear Cache**:
    - 当你需要刷新构建大小、仓库大小或提交预览缓存时，可在脚本菜单中选择清空缓存。
- **自定义 TOC 翻译 / TOC Translation**:
    - 可在脚本菜单中配置英文标题到中文的翻译映射，保存后会自动刷新目录。
- **TOC 高亮设置 / TOC Highlight**:
    - 可配置高亮触发的顶部偏移（px）及高亮样式（颜色、背景、字重）。
    - 在 TOC 面板内可通过滑杆即时调整高亮阈值并实时生效。
    - 拖动时会短暂显示阈值参考线，便于直观感知位置。
- **TOC 复制链接**:
    - 在 TOC 条目上按住 Alt/Shift 点击，可复制当前章节链接。
- **提交预览**:
    - 将鼠标悬停在任何提交链接（commit link）上约 0.6 秒，即可看到预览浮层。
- **复制按钮**:
    - 鼠标悬停在任意代码块上，右上角会出现一个 "📋" 按钮，点击即可复制。

## 安装

1.  安装浏览器扩展 [Tampermonkey](https://www.tampermonkey.net/) 或 [Violentmonkey](https://violentmonkey.github.io/)。
2.  点击 [github-enhancer.user.js](github-enhancer.user.js) 安装脚本。
3.  刷新 GitHub 或 Gitee 页面即可生效。

## 注意事项

- 初次加载构建大小时可能需要几秒钟请求 Bundlephobia API，后续访问将从本地缓存读取。
- 脚本需要 `GM_xmlhttpRequest` (跨域请求) 和 `GM_setValue/GM_getValue` (本地存储) 权限。
