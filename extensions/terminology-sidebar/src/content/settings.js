import { STORAGE_KEYS, DEFAULT_SETTINGS, MESSAGE_TYPES } from '../shared/constants.js';
import { store } from './state.js';
import { updateTheme, updateSidebarList, setSidebarWidth } from './sidebar-manager.js';

export const loadSettings = async () => {
  const stored = await chrome.storage.local.get([STORAGE_KEYS.settings, "tsSettings"]);
  const legacy = stored.tsSettings || {};
  const current = stored[STORAGE_KEYS.settings] || {};
  const merged = Object.keys(current).length ? current : legacy;
  const settings = { ...DEFAULT_SETTINGS, ...merged };
  store.setState({ settings });
  await chrome.storage.local.set({ [STORAGE_KEYS.settings]: settings });
  if (stored.tsSettings) {
    await chrome.storage.local.remove("tsSettings");
  }
};

export const saveSettings = async (next) => {
  const current = store.getState().settings;
  const nextSettings = { ...current, ...next };
  store.setState({ settings: nextSettings });
  await chrome.storage.local.set({ [STORAGE_KEYS.settings]: nextSettings });
};

export const applySettings = async () => {
  const { port, settings } = store.getState();
  if (!port) return;
  port.postMessage({ type: MESSAGE_TYPES.settings, settings });
  setSidebarWidth(settings.sidebarWidth);
  updateTheme();
  updateSidebarList();
};
