document.addEventListener('DOMContentLoaded', () => {
  const grid = document.getElementById('editor-grid');
  const filterBtns = document.querySelectorAll('.filter-btn');
  const searchInput = document.getElementById('search-input');
  const sortBtn = document.getElementById('sort-btn');

  let editorsData = [];
  let currentFilter = 'all';
  let searchTerm = '';
  let isSortedByPrice = false;

  // Fallback data (Chinese)
  const FALLBACK_DATA = [
    {
      "id": "antigravity",
      "name": "Google Antigravity",
      "developer": "Google",
      "pricing_tiers": [
        {
          "name": "Preview (公开预览版)",
          "price": "¥0 (免费)",
          "limits": "Gemini 3 Pro 慷慨限额, 包含浏览器代理功能",
          "refresh_rate": "未知"
        }
      ],
      "models": ["Gemini 3 Pro", "Claude 3.5/4.5 Sonnet", "GPT-OSS"],
      "features": ["Agent-First (原生代理)", "Browser Subagents (浏览器操控)", "Artifacts (可验证交付物)", "多Agent并发"],
      "url": "https://antigravityai.org/"
    },
    {
      "id": "kiro",
      "name": "Kiro",
      "developer": "Kiro.dev",
      "pricing_tiers": [
        {
          "name": "Pro (专业版)",
          "price": "¥146/月 ($20)",
          "limits": "基于 Credit 积分制, 弹性超额使用",
          "refresh_rate": "每月"
        },
        {
          "name": "Power",
          "price": "¥1460/月 ($200)",
          "limits": "高容量计算资源, 适合重度用户",
          "refresh_rate": "每月"
        }
      ],
      "models": ["Auto (Agent Mix)", "Claude 3.5/4.5 Sonnet"],
      "features": ["Spec-Driven (规范驱动开发)", "Auto Agent", "Intent Detection (意图识别)", "VS Code 插件兼容"],
      "url": "https://kiro.dev/"
    },
    {
      "id": "qoder",
      "name": "Qoder",
      "developer": "Qoder Inc.",
      "pricing_tiers": [
        {
          "name": "Pro Trial",
          "price": "免费 (14天)",
          "limits": "1000 Credits, 全功能体验",
          "refresh_rate": "一次性"
        },
        {
          "name": "Pro",
          "price": "¥146/月 ($20)",
          "limits": "标准 Credit 包, Quest Mode 任务委托",
          "refresh_rate": "每月"
        }
      ],
      "models": ["Claude Series", "GPT-4o/5", "Gemini Pro"],
      "features": ["Agentic Platform", "Quest Mode (任务模式)", "Test Generation (测试生成)", "CLI & IDE"],
      "url": "https://qoder.com/"
    },
    {
      "id": "cursor",
      "name": "Cursor",
      "developer": "Anysphere",
      "pricing_tiers": [
        {
          "name": "Hobby (免费版)",
          "price": "¥0",
          "limits": "每月 2000 次补全, 50 次慢速高级请求",
          "refresh_rate": "每月"
        },
        {
          "name": "Pro (专业版)",
          "price": "¥146/月 ($20)",
          "limits": "无限次补全, 每月 500 次快速高级请求, 无限次慢速高级请求",
          "refresh_rate": "每月"
        }
      ],
      "models": ["Claude 3.5 Sonnet", "GPT-4o", "cursor-small"],
      "features": ["Composer (多文件编辑)", "Tab 智能补全", "对话助手", "代码库索引"],
      "url": "https://cursor.sh/"
    },
    {
      "id": "trae",
      "name": "Trae",
      "developer": "字节跳动",
      "pricing_tiers": [
        {
          "name": "Free (免费版)",
          "price": "¥0",
          "limits": "每月 10 次快/50 次慢 Premium 请求, 1000 次 Advanced 请求, 5000 次补全",
          "refresh_rate": "每月"
        },
        {
          "name": "Pro (专业版)",
          "price": "¥73/月 ($10)",
          "limits": "每月 600 次快/无限次慢 Premium 请求, 无限次 Advanced 请求, 无限次补全",
          "refresh_rate": "每月"
        }
      ],
      "models": ["Claude 3.5 Sonnet", "GPT-4o"],
      "features": ["原生 IDE 体验", "智能对话", "Builder 模式", "上下文感知"],
      "url": "https://www.trae.ai/"
    },
    {
      "id": "windsurf",
      "name": "Windsurf",
      "developer": "Codeium",
      "pricing_tiers": [
        {
          "name": "Free (免费版)",
          "price": "¥0",
          "limits": "标准上下文感知, 有限的高级模型使用",
          "refresh_rate": "每月"
        },
        {
          "name": "Pro (专业版)",
          "price": "¥110/月 ($15)",
          "limits": "深度上下文感知, 无限高级模型使用 (公平使用)",
          "refresh_rate": "每月"
        }
      ],
      "models": ["Cascade (自研)", "GPT-4o", "Claude 3.5 Sonnet"],
      "features": ["Flows 工作流", "Cascade 引擎", "深度上下文"],
      "url": "https://codeium.com/windsurf"
    },
    {
      "id": "zed",
      "name": "Zed AI",
      "developer": "Zed Industries",
      "pricing_tiers": [
        {
          "name": "Free (免费版)",
          "price": "¥0",
          "limits": "需自备 API Key 或有限使用",
          "refresh_rate": "不适用"
        },
        {
          "name": "Pro (专业版)",
          "price": "¥73/月 ($10)",
          "limits": "Zed 托管的高速模型服务",
          "refresh_rate": "每月"
        }
      ],
      "models": ["Claude 3.5 Sonnet", "GPT-4o"],
      "features": ["高性能 (Rust)", "多人协作", "AI 助手集成"],
      "url": "https://zed.dev/"
    },
    {
      "id": "cline",
      "name": "Cline (插件)",
      "developer": "Open Source",
      "pricing_tiers": [
        {
          "name": "Open Source",
          "price": "¥0 (开源)",
          "limits": "需自备 API Key (按量付费)",
          "refresh_rate": "不适用"
        }
      ],
      "models": ["Claude 3.5 Sonnet", "DeepSeek", "Gemini"],
      "features": ["VS Code 插件", "自主 Agent", "文件读写操作", "终端执行"],
      "url": "https://github.com/cline/cline"
    },
    {
      "id": "copilot",
      "name": "GitHub Copilot",
      "developer": "GitHub (微软)",
      "pricing_tiers": [
        {
          "name": "Individual (个人版)",
          "price": "¥73/月 ($10)",
          "limits": "基于使用量的速率限制",
          "refresh_rate": "每月"
        }
      ],
      "models": ["GPT-4o", "Claude 3.5 Sonnet", "Gemini 1.5 Pro"],
      "features": ["智能补全", "IDE 内对话", "CLI 支持", "PR 自动摘要"],
      "url": "https://github.com/features/copilot"
    },
    {
      "id": "gemini",
      "name": "Gemini Code Assist",
      "developer": "Google",
      "pricing_tiers": [
        {
          "name": "Individual (个人版)",
          "price": "¥0 (免费)",
          "limits": "基础补全与对话, 每日限额",
          "refresh_rate": "每日"
        },
        {
          "name": "Standard (标准版)",
          "price": "¥139/月 ($19)",
          "limits": "企业级安全, 无限高级请求",
          "refresh_rate": "每月"
        }
      ],
      "models": ["Gemini 1.5 Pro", "Gemini 2.5"],
      "features": ["全代码库感知", "极速补全", "多模态理解", "Cloud 集成"],
      "url": "https://cloud.google.com/gemini"
    },
    {
      "id": "amazonq",
      "name": "Amazon Q",
      "developer": "AWS",
      "pricing_tiers": [
        {
          "name": "Free (免费版)",
          "price": "¥0",
          "limits": "代码建议, 50 次/月对话, 安全扫描",
          "refresh_rate": "每月"
        },
        {
          "name": "Pro (专业版)",
          "price": "¥139/月 ($19)",
          "limits": "无限对话, Java 自动升级 Agent",
          "refresh_rate": "每月"
        }
      ],
      "models": ["Bedrock Models"],
      "features": ["企业级安全", "Java 版本升级", "AWS 深度集成"],
      "url": "https://aws.amazon.com/q/developer/"
    },
    {
      "id": "continue",
      "name": "Continue",
      "developer": "Open Source",
      "pricing_tiers": [
        {
          "name": "Open Source",
          "price": "¥0 (开源/BYOK)",
          "limits": "需自备 API Key 或本地模型",
          "refresh_rate": "不适用"
        }
      ],
      "models": ["Claude", "GPT-4", "Llama 3", "DeepSeek"],
      "features": ["任意模型接入", "本地运行", "RAG 上下文", "隐私优先"],
      "url": "https://www.continue.dev/"
    },
    {
      "id": "aider",
      "name": "Aider",
      "developer": "Open Source",
      "pricing_tiers": [
        {
          "name": "CLI Tool",
          "price": "¥0 (开源/BYOK)",
          "limits": "需自备 API Key",
          "refresh_rate": "不适用"
        }
      ],
      "models": ["Claude 3.5 Sonnet", "GPT-4o", "DeepSeek"],
      "features": ["CLI Agent", "Git 自动提交", "架构师模式", "多文件编辑"],
      "url": "https://aider.chat/"
    },
    {
      "id": "replit",
      "name": "Replit Agent",
      "developer": "Replit",
      "pricing_tiers": [
        {
          "name": "Core (核心版)",
          "price": "¥146/月 ($20)",
          "limits": "包含 Agent 使用额度, 无限 Private Repls",
          "refresh_rate": "每月"
        }
      ],
      "models": ["Replit Model", "GPT-4o"],
      "features": ["从零构建应用", "自然语言编程", "一键部署"],
      "url": "https://replit.com/"
    },
    {
      "id": "augment",
      "name": "Augment Code",
      "developer": "Augment",
      "pricing_tiers": [
        {
          "name": "Beta",
          "price": "¥0 (免费)",
          "limits": "目前处于 Beta 阶段",
          "refresh_rate": "不适用"
        }
      ],
      "models": ["Proprietary Models"],
      "features": ["极速上下文感知", "企业级安全", "代码库理解"],
      "url": "https://www.augmentcode.com/"
    }
  ];

  // Safe HTML Escaping
  function escapeHtml(text) {
    if (!text) return "";
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function validateUrl(url) {
    if (!url) return '#';
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return escapeHtml(url);
    }
    return '#';
  }

  // Load Data
  async function loadData() {
    try {
      // Add cache-busting timestamp to prevent caching old json
      const response = await fetch('data.json?' + new Date().getTime());
      if (!response.ok) throw new Error('Network response was not ok');
      const data = await response.json();
      // Sanitize data
      editorsData = data.map(item => ({
        ...item,
        name: escapeHtml(item.name),
        url: validateUrl(item.url),
        developer: escapeHtml(item.developer),
        pricing_tiers: item.pricing_tiers.map(t => ({
          ...t,
          name: escapeHtml(t.name),
          price: escapeHtml(t.price),
          limits: escapeHtml(t.limits),
          refresh_rate: escapeHtml(t.refresh_rate)
        })),
        models: item.models.map(escapeHtml),
        features: item.features.map(escapeHtml),
      }));
      applyFiltersAndSort();
    } catch (error) {
      console.warn('Fetch failed, using fallback data:', error);
      editorsData = FALLBACK_DATA;
      applyFiltersAndSort();
    }
  }

  // Filter & Sort Logic
  function applyFiltersAndSort() {
    let result = editorsData;

    // 1. Filter by category
    if (currentFilter !== 'all') {
      result = result.filter(e => {
        const isFree = e.pricing_tiers.some(t => t.price === '¥0' || t.price.includes('Free') || t.price === '$0');
        // Paid means NOT completely free (has paid tier)
        // But strict definition: 'paid' usually means requires payment. 
        // Current logic in renderGrid was: isPaid = has non-free tier.
        if (currentFilter === 'free') return isFree; // Show if it has a free tier
        if (currentFilter === 'paid') return e.pricing_tiers.some(t => t.price !== '¥0' && !t.price.includes('Free') && t.price !== '$0');
        return true;
      });
    }

    // 2. Filter by search
    if (searchTerm) {
      const lower = searchTerm.toLowerCase();
      result = result.filter(e =>
        e.name.toLowerCase().includes(lower) ||
        e.developer.toLowerCase().includes(lower) ||
        e.features.some(f => f.toLowerCase().includes(lower))
      );
    }

    // 3. Sort by Price (Approximate)
    if (isSortedByPrice) {
      // Simple heuristic: sort by lowest price of first paid tier, or 0 if all free
      result = [...result].sort((a, b) => {
        const getPrice = (e) => {
          // Find first non-zero price number
          for (let t of e.pricing_tiers) {
            const match = t.price.match(/¥(\d+)/) || t.price.match(/\$(\d+)/);
            if (match) return parseInt(match[1]) * (t.price.includes('$') ? 7.3 : 1);
          }
          return 0;
        };
        return getPrice(a) - getPrice(b);
      });
    }

    renderGrid(result);
  }

  // Event Listeners
  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      filterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.dataset.filter;
      applyFiltersAndSort();
    });
  });

  searchInput.addEventListener('input', (e) => {
    searchTerm = e.target.value.trim();
    applyFiltersAndSort();
  });

  sortBtn.addEventListener('click', () => {
    isSortedByPrice = !isSortedByPrice;
    sortBtn.classList.toggle('active', isSortedByPrice);
    applyFiltersAndSort();
  });

  // Render Grid
  function renderGrid(data) {
    grid.innerHTML = '';

    if (data.length === 0) {
      grid.innerHTML = '<div class="loading">暂无数据</div>';
      return;
    }

    // Add staggered animation delay
    data.forEach((editor, index) => {
      const card = document.createElement('div');
      card.className = 'card';
      card.style.animationDelay = `${index * 100}ms`;

      // Generate Pricing HTML
      const pricingHtml = editor.pricing_tiers.map(tier => `
                <div class="pricing-tier">
                    <div class="tier-header">
                        <span class="tier-name">${tier.name}</span>
                        <span class="tier-price">${tier.price}</span>
                    </div>
                    <div class="tier-limits">${tier.limits}</div>
                    ${tier.refresh_rate !== '不适用' && tier.refresh_rate !== 'N/A' ? `<div class="tier-refresh">刷新: ${tier.refresh_rate}</div>` : ''}
                </div>
            `).join('');

      // Generate Models & Features Tags
      const modelsHtml = editor.models.map(model => `<span class="tag tag-model">${model}</span>`).join('');
      const featuresHtml = editor.features.map(feat => `<span class="tag tag-feature">${feat}</span>`).join('');

      // Determine primary badge
      const isFree = editor.pricing_tiers.some(t => t.price === '¥0' || t.price.includes('Free') || t.price === '$0');
      const isPaid = editor.pricing_tiers.some(t => t.price !== '¥0' && !t.price.includes('Free') && t.price !== '$0');
      let badgeText = isFree && isPaid ? '免费+付费' : (isFree ? '完全免费' : '付费订阅');
      let badgeClass = isFree && isPaid ? 'badge-freemium' : (isFree ? 'badge-free' : 'badge-paid');

      card.innerHTML = `
                <div class="card-glow"></div>
                <div class="card-content">
                    <div class="card-header">
                        <div class="card-title-group">
                            <h2>${editor.name}</h2>
                            <div class="developer">${editor.developer}</div>
                        </div>
                        <div class="pricing-badge ${badgeClass}">${badgeText}</div>
                    </div>

                    <div class="section pricing-section">
                        <div class="section-title">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                            定价与额度
                        </div>
                        ${pricingHtml}
                    </div>

                    <div class="section">
                        <div class="section-title">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a10 10 0 1 0 10 10 10 10 0 0 0-10-10zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8z"/><path d="M12 6v6l4 2"/></svg>
                            核心模型
                        </div>
                        <div class="tags">
                            ${modelsHtml}
                        </div>
                    </div>

                    <div class="section">
                         <div class="section-title">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
                            特色功能
                        </div>
                        <div class="tags">
                            ${featuresHtml}
                        </div>
                    </div>

                    <a href="${editor.url}" target="_blank" class="visit-btn">
                        访问官网
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
                    </a>
                </div>
            `;

      grid.appendChild(card);
    });
  }

  // Removed old filter logic block as it is replaced by applyFiltersAndSort


  // Add Mouse Move Effect for Cards
  // Add Mouse Move Effect for Cards (Optimized)
  const container = document.getElementById('editor-grid');
  let ticking = false;

  container.onmousemove = e => {
    if (!ticking) {
      window.requestAnimationFrame(() => {
        for (const card of document.getElementsByClassName("card")) {
          const rect = card.getBoundingClientRect();
          const x = e.clientX - rect.left;
          const y = e.clientY - rect.top;

          card.style.setProperty("--mouse-x", `${x}px`);
          card.style.setProperty("--mouse-y", `${y}px`);
        }
        ticking = false;
      });
      ticking = true;
    }
  };

  loadData();
});
