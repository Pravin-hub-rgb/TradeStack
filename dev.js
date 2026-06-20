const { execSync } = require('child_process');
const concurrently = require('concurrently');

// ====================================================================
// Zombie cleanup — kill leftovers from previous runs that weren't
// cleaned up by Ctrl+C (Windows doesn't propagate SIGINT to children).
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

(async () => {
  await sleep(1000);

  const isProd = process.argv.includes('--prod');

  const { result } = concurrently(
    [
      {
        command: isProd ? 'bun run start' : 'bun run dev',
        name: 'next',
        cwd: 'frontend',
        prefixColor: 'blue',
      },
      {
        command: `.\\venv\\Scripts\\python server.py${isProd ? '' : ''}`,
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
