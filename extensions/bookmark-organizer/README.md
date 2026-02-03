# 书签整理器

按关键词规则或 AI 智能分析自动归类书签，支持预览、撤销、定时整理、可视化统计。

## 功能特点

### 核心功能
- **关键词模式**：基于用户定义的关键词规则匹配书签
- **AI 智能模式**：使用 AI 大模型自动分析书签内容并分类
- **混合模式**：优先使用关键词匹配，未匹配的书签交由 AI 处理
- **预演模式**：查看分类效果而不实际移动书签

### 高级功能
- **书签预览**：预演时可查看每个书签的匹配规则和目标分类，支持拖拽调整
- **一键撤销**：记录移动历史，支持撤销上次整理操作
- **重复检测**：识别并合并重复的书签
- **定时整理**：设置每天/每周/每月自动整理
- **增量整理**：仅处理新增书签，提升效率
- **可视化统计**：饼图展示分类分布
- **快捷键支持**：`Ctrl+Shift+B` 一键快速整理

### 性能优化
- **AI 缓存**：缓存已分类书签，避免重复调用 API（默认 7 天有效期）
- **并发处理**：多批次并行请求，加速 AI 分类
- **Trie 树匹配**：高效关键词匹配算法
- **正则表达式**：支持正则规则（如 `/github\.com/`）

## 安装

1. 打开浏览器的扩展管理页（`chrome://extensions/`）
2. 开启开发者模式
3. 选择"加载已解压的扩展程序"，指向本目录

## 使用

### 基本整理
1. 点击扩展图标进入弹窗
2. 选择分类模式（关键词/AI/混合）
3. 可勾选"预演模式"查看匹配效果
4. 点击"开始整理"执行归类

### 预览功能
1. 切换到"预览"标签页
2. 点击"刷新"加载预览数据
3. 可拖拽书签到不同分类
4. 查看每个书签的匹配关键词

### 撤销操作
1. 整理后点击撤销按钮（↩️）
2. 确认后书签将恢复到原位置

### 重复检测
1. 切换到"工具"标签页
2. 点击"检测重复"
3. 查看重复书签列表
4. 点击"合并全部"删除重复项

## AI 配置

1. 点击"编辑规则与设置"进入设置页
2. 在"AI 配置"区域选择服务商
3. 填写对应的 API 密钥
4. 点击"测试连接"验证配置
5. 保存设置

### 支持的 AI 服务商

#### 国际服务
| 服务商 | 推荐模型 | 获取密钥 |
|--------|---------|---------|
| OpenAI | `gpt-4o-mini` | [platform.openai.com](https://platform.openai.com/api-keys) |
| Google Gemini | `gemini-2.0-flash-exp` | [aistudio.google.com](https://aistudio.google.com/apikey) |
| Groq | `llama-3.3-70b-versatile` | [console.groq.com](https://console.groq.com/keys) (免费) |
| Together AI | `DeepSeek-V3` | [api.together.xyz](https://api.together.xyz/settings/api-keys) |
| OpenRouter | 多模型聚合 | [openrouter.ai](https://openrouter.ai/keys) |

#### 国内服务
| 服务商 | 推荐模型 | 获取密钥 |
|--------|---------|---------|
| DeepSeek | `deepseek-chat` | [platform.deepseek.com](https://platform.deepseek.com/api_keys) (低价) |
| 智谱 AI | `glm-4-flash` | [open.bigmodel.cn](https://open.bigmodel.cn/usercenter/apikeys) |
| Moonshot | `moonshot-v1-8k` | [platform.moonshot.cn](https://platform.moonshot.cn/console/api-keys) |
| 通义千问 | `qwen-turbo` | [dashscope.console.aliyun.com](https://dashscope.console.aliyun.com/apiKey) |
| 百川智能 | `Baichuan4` | [platform.baichuan-ai.com](https://platform.baichuan-ai.com/console/apikey) |
| MiniMax | `abab6.5s-chat` | [platform.minimaxi.com](https://platform.minimaxi.com) |
| 零一万物 | `yi-lightning` | [platform.lingyiwanwu.com](https://platform.lingyiwanwu.com/apikeys) |
| 豆包 | `doubao-pro-32k` | [console.volcengine.com](https://console.volcengine.com/ark) |
| 讯飞星火 | `4.0Ultra` | [console.xfyun.cn](https://console.xfyun.cn/services/bm35) |

#### 本地服务
| 服务 | 说明 |
|------|------|
| Ollama | 需先安装 [ollama.com](https://ollama.com) |
| LM Studio | 需先安装 [lmstudio.ai](https://lmstudio.ai) |

## 定时整理

1. 进入设置页
2. 勾选"启用定时整理"
3. 选择整理间隔（每天/每周/每月）
4. 选择整理模式
5. 保存设置

定时整理仅处理新增书签，完成后会发送通知。

## 快捷键

- `Ctrl+Shift+B`（Mac: `Cmd+Shift+B`）：一键预演整理

可在 `chrome://extensions/shortcuts` 自定义快捷键。

## 规则说明

- 分类名与关键词均可自定义，关键词用逗号分隔
- 支持正则表达式（以 `/` 包裹，如 `/github\.com/`）
- 规则为空或不完整时不会保存
- AI 分类时会参考预设的分类名称，也可能创建新分类
- 规则支持拖拽排序，优先匹配靠前的规则

## 归类目录

- 可在设置页调整"归类目录"名称
- 整理时会在该目录下生成分类文件夹

## 注意事项

- 首次使用建议先预演，确认规则效果后再移动书签
- AI 模式需要网络请求，可能产生 API 调用费用
- 书签信息（标题、URL）会发送到配置的 AI 服务
- 本地服务（Ollama/LM Studio）无需 API 密钥
- AI 分类结果会被缓存以减少 API 调用

## 版本历史

### v0.3.0（当前版本）
- 新增书签预览功能（支持拖拽调整分类）
- 新增一键撤销功能
- 新增重复书签检测与合并
- 新增定时自动整理
- 新增增量整理模式
- 新增可视化统计图表
- 新增快捷键支持（Ctrl+Shift+B）
- 优化 AI 缓存机制
- 优化并发批处理性能
- 优化关键词匹配算法（Trie 树）
- 支持正则表达式规则
- 代码架构重构

### v0.2.0
- 新增 AI 智能分类功能
- 新增混合模式（关键词 + AI）
- 预设 15+ 国内外 AI 服务商
- 添加分类进度显示
- 优化界面设计（Plus Jakarta Sans 字体）

### v0.1.0
- 初始版本
- 基于关键词规则的书签分类
