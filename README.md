# TradeStack

Systematic NSE equity swing trading system — continuation & reversal scanners, live paper trader, market breadth analysis.

Scans 2000+ Indian stocks for technical patterns, streams live Upstox market data via WebSocket, and runs state-machine-driven paper trading. Built from the ground up as a modern tri-partite architecture.

---

## Features

- **Data Pipeline** — NSE bhavcopy fetcher + Upstox historical downloader → per-stock `.pkl` cache backed by a SQLite index for instant stats
- **13 Technical Indicators** — SMA20, ADR%, MA angle, price change, volume surge, base filters, and more
- **Continuation Scanner** — 3-phase zig-zag pullback pattern detection (above MA → pullback below MA → recovery)
- **Reversal Scanner** — Decline-recovery pattern detection with trend classification (uptrend/downtrend)
- **Market Breadth** — 8 metrics per trading day: up/down % counts, above/below MA counts, color-coded table
- **Settings Engine** — 70 configurable parameters across 15 categories, all editable from the UI (no file editing)
- **Live Trader** — Upstox WebSocket V3 streamer, 11-state finite state machines for reversal & continuation modes, in-memory paper trader
- **Trade Logs** — SQLite-backed with CRUD API, auto P&L calculation, GitHub-style activity heatmap
- **Scanner Chart View** — Split-pane candlestick charts (lightweight-charts) with keyboard navigation

---

## Architecture

| Component | Tech | Role |
|-----------|------|------|
| Frontend | Next.js 16 (App Router) + MUI v9 + Tailwind | UI, dashboards, settings panel |
| Live Trader | TypeScript/Node.js (in-process with Next.js) | Upstox WebSocket, state machines, paper trading |
| Data Microservice | Python FastAPI + pandas + numpy | Scanners, indicators, bhavcopy, breadth |
| Database | SQLite (`data/settings.db`, WAL mode) | Config, trade logs, cache index, token storage |

**Key principle:** Python does data. Node.js does live events. They share a single SQLite database. All config lives in the database, not in source files.

---

## Tech Stack

- **Frontend:** Next.js 16.2.7, React 19, MUI v9, lightweight-charts 5.2, Tailwind CSS 4
- **Live Trader:** ws (WebSocket), protobufjs (Upstox feed deserialization), upstox-js-sdk
- **Backend:** FastAPI, uvicorn, pandas, numpy, requests
- **Tooling:** bun, TypeScript 5, Python 3.12+

---

## Getting Started

```powershell
git clone <repo-url>
cd TradeStack

# Install Node.js dependencies (uses bun)
bun install
cd frontend
bun install
cd ..

# Set up Python backend
cd backend
python -m venv venv
.\venv\Scripts\pip install -r requirements.txt
cd ..

# Start both servers
bun run dev
```

- **Frontend:** http://localhost:3000
- **Backend health:** http://localhost:8001/health → `{"status":"healthy"}`

---

## Usage Flow

1. **Update Data** — Click "Update Bhavcopy" or "Download Historical" to populate the stock cache
2. **Configure** — Adjust scanner parameters in Settings (70 params across 15 categories)
3. **Scan** — Run Continuation or Reversal scanner on 2000+ stocks
4. **Watchlist** — Add promising stocks to your watchlist (persisted in SQLite)
5. **Trade Live** — Enter your Upstox access token, start the live trader, monitor state machines in real-time
6. **Review** — View trade logs, daily heatmap, cumulative stats

---

## Project Structure

```
TradeStack/
├── frontend/           Next.js App Router pages, components, live trader
│   ├── src/app/        Pages: scanner, breadth, live-trading, settings
│   ├── src/components/ UI components (scanner, chart, trade logs, etc.)
│   └── src/lib/live-trader/  Node.js live trader (18 modules)
├── backend/            Python FastAPI microservice
│   ├── server.py       50+ API endpoints
│   └── src/            Core modules: cache, scanner, indicators, breadth, settings
├── data/               Runtime data (gitignored)
│   ├── cache/          2084 .pkl stock data files
│   └── settings.db     SQLite database
├── dev.js              Concurrent launcher for both servers
└── AGENTS.md           Agent context (maintainer reference)
```

---

## Status

**Substantially complete** — all core features rebuilt from the legacy Python codebase (as of June 2026). The system is fully runnable for paper trading with manual exit management.

---

## License

MIT
