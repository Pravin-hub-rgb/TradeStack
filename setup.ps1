# TradeStack one-shot setup for Windows (PowerShell 5+).
# Installs Node + Python dependencies, seeds the database, verifies runtime data.
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

Write-Host "==> TradeStack setup (repo: $root)" -ForegroundColor Cyan

# --- 1. Prerequisites -------------------------------------------------------
try { $bunV = (bun --version) } catch { $bunV = $null }
if (-not $bunV) {
    Write-Host "    bun not found - install it first:" -ForegroundColor Red
    Write-Host '    powershell -c "irm bun.sh/install.ps1 | iex"' -ForegroundColor Red
    exit 1
}
Write-Host "==> bun $($bunV)"

$pyExe = $null
$pyArgs = @()
foreach ($candidate in @("python", "py")) {
    & $candidate --version 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) { $pyExe = $candidate; break }
}
if ($pyExe -eq "py") { $pyArgs = @("-3") }
if (-not $pyExe) {
    Write-Host "    Python 3.x not found - install it from https://www.python.org/downloads/" -ForegroundColor Red
    exit 1
}
$pyVersion = & $pyExe @pyArgs --version 2>&1
Write-Host "==> python: $pyVersion"

# --- 2. Node dependencies ---------------------------------------------------
Write-Host "==> bun install (root)" -ForegroundColor Cyan
bun install
if ($LASTEXITCODE -ne 0) { exit 1 }

Write-Host "==> bun install (frontend)" -ForegroundColor Cyan
Push-Location frontend
bun install
Pop-Location
if ($LASTEXITCODE -ne 0) { exit 1 }

# --- 3. Python venv + dependencies ------------------------------------------
if (-not (Test-Path "backend\venv")) {
    Write-Host "==> Creating backend venv" -ForegroundColor Cyan
    & $pyExe @pyArgs -m venv backend\venv
    if ($LASTEXITCODE -ne 0) { exit 1 }
}
Write-Host "==> pip install -r backend\requirements.txt" -ForegroundColor Cyan
& backend\venv\Scripts\python.exe -m pip install -q -r backend\requirements.txt
if ($LASTEXITCODE -ne 0) { exit 1 }

# --- 4. Seed database (schema + settings + cache index) ---------------------
Write-Host "==> Seeding SQLite (settings) + rebuilding cache index" -ForegroundColor Cyan
& backend\venv\Scripts\python.exe backend\seed_db.py
if ($LASTEXITCODE -ne 0) { exit 1 }

# --- 5. Runtime data checks --------------------------------------------------
if (Test-Path "data\NSE.json.gz") {
    Write-Host "==> data\NSE.json.gz present (instrument key source)" -ForegroundColor Green
} else {
    Write-Host "" ; Write-Host "    WARNING: data\NSE.json.gz is MISSING." -ForegroundColor Yellow
    Write-Host "    This file (compressed NSE instrument map) is required for the live trader"
    Write-Host "    and instrument-key resolution. Copy it from your other TradeStack install"
    Write-Host "    into data\NSE.json.gz, or download from Upstox and gzip NSE.json into place."
    Write-Host ""
}

Write-Host "" ; Write-Host "Setup complete." -ForegroundColor Green
Write-Host "Next:"
Write-Host "  1. (optional) copy frontend\.env.example to frontend\.env.local"
Write-Host "  2. bun run dev               # starts Next.js :3000 + FastAPI :8001"
Write-Host "  3. open http://localhost:3000 -> Scanner -> Cache Data to update data"
Write-Host "     (needs your Upstox token via Live Trading -> Token first time)"
