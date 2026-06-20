# Rebrand History: MA Stock Trader → TradeStack

## Timeline

### Phase 1 — MA Stock Trader (Original)
The project started as **MA Stock Trader**, a Python-only trading system for NSE equities. It used a monolithic architecture with a Vite frontend and Python backend, all within a single codebase.

### Phase 2 — MA Stock Trader NA (New Architecture)
A new architecture was created alongside the original in a separate folder called `MA_Stock_Trader_NA`. This split the system into three distinct layers:
- **Python FastAPI** — data microservice (bhavcopy, scanner, indicators)
- **Node.js/Next.js** — live trader + frontend
- **SQLite** — shared settings database

The original codebase was preserved as `MA_Stock_Trader_OLD` for reference.

### Phase 3 — Rebrand to TradeStack
On **20 June 2026**, the project was rebranded from "MA Stock Trader" to **TradeStack**.

## What Changed

| Before | After |
|--------|-------|
| GitHub repo: `Pravin-hub-rgb/MA_Stock_Trader` | GitHub repo: `Pravin-hub-rgb/TradeStack` |
| `MA_Stock_Trader_NA/` | `TradeStack/` (active codebase) |
| `MA_Stock_Trader_OLD/` | `TradeStack/old-legacy-code/` (archived reference) |

## Final Structure

```
TradeStack/
├── .git/                           ← Git history preserved from MA Stock Trader
├── old-legacy-code/                ← Original MA Stock Trader code (archive/reference)
├── backend/                        ← Python FastAPI data microservice (new arch)
├── frontend/                       ← Next.js frontend + live trader (new arch)
├── tests/                          ← Test suite for new architecture
├── docs/                           ← Documentation
└── ...
```

## Why "TradeStack"?

See [`TRADESTACK_BRAND_MEANING.md`](TRADESTACK_BRAND_MEANING.md) for the full reasoning behind the name.
