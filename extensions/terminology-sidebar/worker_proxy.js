const worker = new Worker('worker.js');

window.addEventListener('message', (event) => {
  if (event.data) {
    worker.postMessage(event.data);
  }
});

worker.onmessage = (event) => {
  window.parent.postMessage({
    source: 'ts-worker-proxy',
    data: event.data
  }, '*');
};