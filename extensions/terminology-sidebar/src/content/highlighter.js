import { store } from './state.js';

const HIGHLIGHT_NAME = 'terminology-highlight';

// Check for CSS Custom Highlight API support
const supportsHighlightApi = typeof CSS !== 'undefined' && 'highlights' in CSS;

export const clearHighlights = () => {
  if (supportsHighlightApi) {
    CSS.highlights.delete(HIGHLIGHT_NAME);
    store.setState({ selectedTerm: null });
    return;
  }

  // Fallback for older browsers
  const { highlights } = store.getState();
  highlights.forEach((mark) => {
    const parent = mark.parentNode;
    if (!parent) return;
    const textNode = document.createTextNode(mark.textContent || "");
    parent.replaceChild(textNode, mark);
    // Normalize to merge adjacent text nodes
    parent.normalize();
  });
  store.setState({ highlights: [], selectedTerm: null });
};

export const applyHighlights = (term) => {
  clearHighlights();
  const { matches } = store.getState();
  // Case-insensitive match if we deduplicated by lowercase
  const matchesToHighlight = matches.filter((match) => match.entry.term.toLowerCase() === term.toLowerCase());

  if (supportsHighlightApi) {
    const ranges = matchesToHighlight.map(match => {
      const range = new Range();
      if (!match.node || !match.node.isConnected) return null;
      try {
        range.setStart(match.node, match.start);
        range.setEnd(match.node, match.end);
        return range;
      } catch (e) {
        // Node might have changed or index out of bounds
        return null;
      }
    }).filter(Boolean);

    if (ranges.length > 0) {
      const highlight = new Highlight(...ranges);
      CSS.highlights.set(HIGHLIGHT_NAME, highlight);
    }
    store.setState({ selectedTerm: term });
    
    // Add styles if not present (injected in sidebar.css or global style)
    // We assume sidebar.css or injected style handles ::highlight(terminology-highlight)
    return;
  }

  // Fallback Implementation
  const byNode = new Map();
  matchesToHighlight.forEach((match) => {
    const list = byNode.get(match.node) || [];
    list.push(match);
    byNode.set(match.node, list);
  });

  const newHighlights = [];
  for (const [node, list] of byNode.entries()) {
    // Sort reverse to avoid index shifting when splitting
    const sorted = list.sort((a, b) => b.start - a.start);
    let workingNode = node;
    
    for (const match of sorted) {
      if (!workingNode?.parentNode || !workingNode.isConnected) continue;
      
      const start = match.start;
      const end = match.end;
      const text = workingNode.nodeValue;
      
      if (!text || start < 0 || end > text.length) continue;
      
      try {
        const middle = workingNode.splitText(start);
        const after = middle.splitText(end - start);
        
        const mark = document.createElement("mark");
        mark.className = "ts-highlight-legacy";
        mark.textContent = middle.textContent || "";
        
        middle.parentNode.replaceChild(mark, middle);
        newHighlights.push(mark);
        
        // Update working node to the first part for next iteration (which is 'workingNode' already)
        // But since we sort reverse, the next match is earlier in the string, 
        // so it will be in 'workingNode' (the left part).
      } catch (e) {
        console.error("Highlight error:", e);
      }
    }
  }
  store.setState({ highlights: newHighlights, selectedTerm: term });
};

export const scrollToTerm = (term) => {
  const { matches } = store.getState();
  // Find first match for this term (case-insensitive)
  const match = matches.find(m => m.entry.term.toLowerCase() === term.toLowerCase());
  if (match && match.node) {
      const element = match.node.parentElement;
      if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
  }
};
