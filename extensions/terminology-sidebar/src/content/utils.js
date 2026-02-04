import { DEFAULT_SETTINGS } from '../shared/constants.js';

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const getLanguage = (settings) => {
  if (settings.language === "auto") {
    const uiLang = chrome.i18n.getUILanguage();
    return uiLang.startsWith("zh") ? "zh" : "en";
  }
  return settings.language === "zh_CN" ? "zh" : "en";
};

export const getScanModes = (settings) => {
  if (settings.language === "auto") return ["en", "zh"];
  return settings.language === "zh_CN" ? ["zh"] : ["en"];
};
