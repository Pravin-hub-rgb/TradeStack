const { execSync, spawnSync } = require('child_process');
const concurrently = require('concurrently');

// ====================================================================
// Zombie cleanup — kill leftovers from previous runs
// ====================================================================
function killPort(port) {
  try {
    execSync(
      `powershell -Command "$(Get-NetTCPConnection -LocalPort ${port} -ErrorAction SilentlyContinue | Where-Object { $_.OwningProcess -gt 0 } | Select-Object -ExpandProperty OwningProcess -Unique) | ForEach-Object { Stop-Process -Id $_ -Force }"`,
      { stdio: 'ignore', timeout: 3000 },
    );
  } catch (_) {}
}

killPort(8001);
killPort(3000);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Detect whether bun is available on PATH
function hasBun() {
  try {
    const r = spawnSync('bun', ['--version'], { stdio: 'ignore' });
    return r.status === 0;
  } catch (_) {
    return false;
  }
}

// Resolve python executable (venv preferred, system fallback)
function pythonCmd() {
  const fs = require('fs');
  const venv = '.\\venv\\Scripts\\python.exe';
  if (fs.existsSync('backend\\venv\\Scripts\\python.exe')) return '.\\venv\\Scripts\\python.exe';
  return 'python';
}

(async () => {
  await sleep(1000);

  const isProd = process.argv.includes('--prod');
  const useBun = hasBun();
  const frontendCmd = useBun
    ? (isProd ? 'bun run start' : 'bun run dev')
    : (isProd ? 'npm run start' : 'npm run dev');

  const { result } = concurrently(
    [
      {
        command: frontendCmd,
        name: 'next',
        cwd: 'frontend',
        prefixColor: 'blue',
      },
      {
        command: `${pythonCmd()} server.py`,
        name: 'py',
        cwd: 'backend',
        prefixColor: 'yellow',
      },
    ],
    {
      prefix: 'name',
      killOthersOnFail: true,
    },
  );

  result.catch(() => process.exit(1));
})();
