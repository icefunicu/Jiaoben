import { DEFAULT_SETTINGS } from '../shared/constants.js';
import { Store } from '../shared/store.js';

const initialState = {
  settings: { ...DEFAULT_SETTINGS },
  glossaryEn: [],
  glossaryZh: [],
  enPatterns: [], // Raw patterns for worker
  zhPatterns: [], // Raw patterns for worker
  glossaryLoaded: false,
  detailMap: null,
  detailPromise: null,
  detailLoadError: false,
  worker: null, // Web Worker instance
  matches: [],
  listItems: [],
  selectedTerm: null,
  highlights: [],
  sidebarOpen: false,
  searchQuery: "",
  onlineResults: {},
  port: null,
  scanToken: 0,
  cleanup: null
};

export const store = new Store(initialState);
