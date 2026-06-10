const { spawn, execSync } = require('child_process');
const path = require('path');

const root = __dirname;
const py = spawn('python', [path.join(root, 'server.py')], { stdio: 'inherit', shell: true });
const vite = spawn('npm', ['run', 'dev'], { stdio: 'inherit', shell: true, cwd: path.join(root, 'frontend') });

const children = [py, vite];

function treeKill(proc) {
  if (!proc || proc.killed) return;
  try {
    execSync(`taskkill /PID ${proc.pid} /T /F`, { stdio: 'ignore' });
  } catch {}
}

function cleanup() {
  children.forEach(treeKill);
  process.exit();
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
process.on('exit', cleanup);

py.on('close', (code) => { console.log(`[dev] Python exited (${code})`); cleanup(); });
vite.on('close', (code) => { console.log(`[dev] Vite exited (${code})`); cleanup(); });
