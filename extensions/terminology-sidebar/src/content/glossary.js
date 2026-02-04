import { store } from './state.js';
// Worker is now initialized in scanner.js or index.js, but we need to pass data to it.
// We will store the patterns in the store, and let scanner init the worker.

export const loadGlossary = async () => {
  const results = await Promise.allSettled([
    fetch(chrome.runtime.getURL("data/glossary_en_index.json")).then((r) => r.json()),
    fetch(chrome.runtime.getURL("data/glossary_zh_index.json")).then((r) => r.json())
  ]);

  const enIndex = results[0].status === 'fulfilled' ? results[0].value : { items: [] };
  if (results[0].status === 'rejected') {
    console.warn('Failed to load English glossary:', results[0].reason);
  }

  const zhIndex = results[1].status === 'fulfilled' ? results[1].value : { items: [] };
  if (results[1].status === 'rejected') {
    console.warn('Failed to load Chinese glossary:', results[1].reason);
  }

  store.setState({
    glossaryEn: enIndex.items || enIndex,
    glossaryZh: zhIndex.items || zhIndex
  });
  
  const state = store.getState();
  const enPatterns = [];
  
  // Create lightweight patterns for Worker (avoid sending full entry objects)
  state.glossaryEn.forEach((entry, index) => {
    // 0: pattern, 1: id (index), 2: term (for length check in worker if needed, or just pattern length)
    // Actually worker needs pattern string to build trie.
    // We pass: { p: pattern, i: index, t: term }
    // Minify property names to save slightly on serialization
    
    enPatterns.push({
      p: entry.term.toLowerCase(),
      i: index,
      l: entry.term.length 
    });
    
    (entry.aliases || []).forEach((alias) => {
      enPatterns.push({
        p: alias.toLowerCase(),
        i: index,
        l: alias.length
      });
    });
  });
  
  const zhPatterns = [];
  state.glossaryZh.forEach((entry, index) => {
    zhPatterns.push({
      p: entry.term,
      i: index,
      l: entry.term.length
    });
    
    (entry.aliases || []).forEach((alias) => {
      zhPatterns.push({
        p: alias,
        i: index,
        l: alias.length
      });
    });
  });
  
  store.setState({
    enPatterns,
    zhPatterns,
    glossaryLoaded: true
  });
};
