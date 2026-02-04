import { withTimeout } from './network.js';

const normalizeText = (text) => {
  if (!text) return "";
  return String(text).replace(/\s+/g, " ").trim();
};

const extractSentence = (text) => {
  const normalized = normalizeText(text);
  if (!normalized) return "";
  const match = normalized.match(/(.{1,240}?)([。.!?]|$)/);
  return match ? match[1].trim() : normalized.slice(0, 240);
};

const extractExample = (text, lang) => {
  const normalized = normalizeText(text);
  if (!normalized) return "";
  const candidate = normalized.split(" ").slice(0, 30).join(" ");
  if (lang === "zh") {
    return candidate.slice(0, 40);
  }
  return candidate;
};

export const fetchWiktionary = async (term, lang) => {
  const api = `https://${lang}.wiktionary.org/w/api.php?action=query&format=json&origin=*&prop=extracts&explaintext=1&exintro=1&titles=${encodeURIComponent(term)}`;
  const response = await withTimeout(api);
  if (!response.ok) return null;
  const data = await response.json();
  const pages = data?.query?.pages;
  const page = pages ? Object.values(pages)[0] : null;
  const extract = page?.extract || "";
  const definition = extractSentence(extract);
  if (!definition) return null;
  const example = extractExample(extract, lang);
  return {
    source: "wiktionary",
    definition,
    examples: example ? [example] : []
  };
};

export const fetchWikipedia = async (term, lang) => {
  const api = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(term)}`;
  const response = await withTimeout(api, { headers: { "accept": "application/json" } });
  if (!response.ok) return null;
  const data = await response.json();
  const extract = data?.extract || "";
  const definition = extractSentence(extract);
  if (!definition) return null;
  return {
    source: "wikipedia",
    definition,
    examples: []
  };
};
