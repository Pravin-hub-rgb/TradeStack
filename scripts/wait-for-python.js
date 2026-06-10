/**
 * Waits for Python backend to be healthy before starting Vite.
 * Usage: node scripts/wait-for-python.js && cd frontend && npm run dev
 */
const http = require('http');

const MAX_RETRIES = 30;
const RETRY_DELAY = 1000; // 1 second
const PORT = 8002;

function checkHealth(retriesLeft) {
  return new Promise((resolve, reject) => {
    const req = http.get(`http://127.0.0.1:${PORT}/health`, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode === 200) {
          console.log(`[wait-for-python] Backend ready on port ${PORT}`);
          resolve(true);
        } else {
          reject(new Error(`Status ${res.statusCode}`));
        }
      });
    });
    req.on('error', () => reject(new Error('Connection refused')));
    req.setTimeout(2000, () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

async function wait() {
  for (let i = 0; i < MAX_RETRIES; i++) {
    try {
      await checkHealth();
      process.exit(0);
    } catch {
      process.stderr.write(`[wait-for-python] Waiting for backend... (${i + 1}/${MAX_RETRIES})\n`);
      await new Promise(r => setTimeout(r, RETRY_DELAY));
    }
  }
  console.error('[wait-for-python] Backend failed to start');
  process.exit(1);
}

wait();
