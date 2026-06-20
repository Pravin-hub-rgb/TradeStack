const { execSync } = require('child_process');

const ports = process.argv.slice(2).length ? process.argv.slice(2) : [8002, 3001];

ports.forEach(port => {
  try {
    const result = execSync(
      `powershell -NoProfile -Command "try { $p = (Get-NetTCPConnection -LocalPort ${port} -ErrorAction SilentlyContinue).OwningProcess; if ($p -and $p -gt 0) { Stop-Process -Id $p -Force; 'Killed port ${port}' } else { 'Port ${port} is free' } } catch { 'Port ${port}: error' }"`,
      { encoding: 'utf8', timeout: 5000 }
    ).trim();
    console.log(result);
  } catch (e) {
    console.log(`Port ${port}: ${e.message}`);
  }
});
