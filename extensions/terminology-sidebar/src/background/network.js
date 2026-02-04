const RATE_LIMIT_MS = 1000;
const FETCH_TIMEOUT_MS = 6000;

let queue = [];
let processing = false;
let lastRequestAt = 0;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const withTimeout = async (url, options = {}) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timer);
  }
};

const processQueue = async () => {
  if (processing) return;
  processing = true;
  while (queue.length > 0) {
    const now = Date.now();
    const waitMs = Math.max(0, RATE_LIMIT_MS - (now - lastRequestAt));
    if (waitMs > 0) await sleep(waitMs);
    const { task, resolve, reject } = queue.shift();
    try {
      lastRequestAt = Date.now();
      const result = await task();
      resolve(result);
    } catch (error) {
      reject(error);
    }
  }
  processing = false;
};

export const enqueueRequest = (task) => {
  return new Promise((resolve, reject) => {
    queue.push({ task, resolve, reject });
    processQueue();
  });
};

export const requestWithRetry = async (task) => {
  let attempt = 0;
  while (attempt < 2) {
    try {
      const result = await task();
      return result;
    } catch (error) {
      attempt += 1;
      if (attempt >= 2) throw error;
      await sleep(300);
    }
  }
  return null;
};

export { withTimeout };
