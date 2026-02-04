export const extractVisibleTextNodes = function* (options = {}) {
  const includeCode = Boolean(options.includeCode);
  const ignoredTags = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "INPUT", "TEXTAREA", "SELECT", "OPTION", "HEADER", "FOOTER", "NAV", "ASIDE", "MENU", "IFRAME", "OBJECT", "EMBED"]);
  
  if (!includeCode) {
    ignoredTags.add("CODE");
    ignoredTags.add("PRE");
  }

  // Heuristic: Prefer semantic content containers
  // If we find them, we prioritize them, but we might still need to scan others if they don't cover everything.
  // However, users usually only care about the main content.
  // Let's try to find a main content container first.
  let roots = [];
  const article = document.querySelector('article');
  const main = document.querySelector('main') || document.querySelector('[role="main"]');
  const contentId = document.getElementById('content') || document.getElementById('main-content');
  
  if (article) {
    roots.push(article);
  } else if (main) {
    roots.push(main);
  } else if (contentId) {
    roots.push(contentId);
  } else {
    // Fallback to body
    roots.push(document.body);
  }

  // Use a stack for iterative traversal to support pausing (Generator)
  // Process roots in reverse so the first one is popped first (though order doesn't strictly matter for gathering)
  const stack = [...roots];
  
  let steps = 0;
  const YIELD_THRESHOLD = 500; // Yield every N nodes checked to prevent blocking

  // Common class names to ignore (heuristic)
  const ignoredClassPattern = /\b(sidebar|menu|nav|navigation|footer|header|comment|ad|ads|banner|cookie|copyright)\b/i;

  while (stack.length > 0) {
    const node = stack.pop();
    steps++;
    
    // Yield control periodically
    if (steps % YIELD_THRESHOLD === 0) {
      yield null; 
    }

    if (node.nodeType === Node.ELEMENT_NODE) {
      const tagName = node.tagName;
      if (ignoredTags.has(tagName)) continue;

      // Class-based exclusion (only if not one of our chosen roots)
      // If we selected 'main' but it has class 'main-content', we shouldn't ignore it.
      // But if we are traversing children, we might hit nested ads.
      if (!roots.includes(node) && node.className && typeof node.className === 'string' && ignoredClassPattern.test(node.className)) {
         continue;
      }

      // Visibility Check
      if (node.checkVisibility) {
        if (!node.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) continue;
      } else {
        const style = window.getComputedStyle(node);
        if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") continue;
      }
      
      // Push children to stack (reverse order to maintain document order)
      const childNodes = node.childNodes;
      for (let i = childNodes.length - 1; i >= 0; i--) {
        stack.push(childNodes[i]);
      }

    } else if (node.nodeType === Node.TEXT_NODE) {
      if (node.nodeValue && node.nodeValue.trim().length > 0) {
         yield node;
      }
    }
  }
};
