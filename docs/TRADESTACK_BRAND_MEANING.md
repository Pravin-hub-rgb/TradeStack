# Why "TradeStack"?

## 1. Technology Stack

TradeStack is not a single script or a monolithic app. It is a **full-stack system** built from three distinct components that interoperate through well-defined boundaries:

| Layer | Language | Job |
|-------|----------|-----|
| **Data Microservice** | Python (FastAPI) | Bhavcopy pipeline, scanner, indicators, market breadth |
| **Live Trader** | TypeScript (Node.js) | WebSocket streaming, state machines, tick processing |
| **Frontend** | TypeScript (Next.js) | UI, dashboards, settings panel, charts |

Each is an independent layer. Python does data; Node.js does live events; React renders the UI. They communicate over HTTP and WebSocket — no shared runtime, no GIL contention, no tangled imports. A clean **stack** of responsibilities.

---

## 2. Data Stacking — The Pipeline

Raw market data passes through a series of transformations, each building on the last:

```
NSE Bhavcopy (CSV/ZIP)
      │
      ▼
 Cache Manager (.pkl + SQLite index)
      │
      ▼
 Technical Indicators (SMA20, ADR%, MA angle, volume surge)
      │
      ▼
 Scanner Engine (Continuation / Reversal pattern detection)
      │
      ▼
 Stock List (SQLite — persisted, editable from UI)
      │
      ▼
 Live Trader — Pre‑market flow (IEP, VAH, volume baselines)
      │
      ▼
 Live Trader — Market‑open flow (FSM, tick processing, entries, exits)
      │
      ▼
 UI (Candlestick charts, trade logs, P&L heatmap)
```

Every stage stacks on the one below it. Nothing skips a layer. This guarantees that every trade decision is backed by the full depth of processed data — not an ad-hoc calculation.

---

## 3. Validation Stack — The Rule Chain

Before any stock can be traded, it passes through a **stack of validation gates**:

1. **Price filter** — within min/max configured range
2. **Near MA %** — distance from SMA20 within threshold
3. **Max body %** — candle body size filter
4. **ADR %** — minimum average daily range for volatility
5. **Volume validation (SVRO)** — is today's volume relative to baseline
6. **Low violation check** — has price breached the entry level
7. **FCFS allocation** — first qualifying stock gets filled (max 2 positions)

Fail any one, and the stock is rejected. This stack of rules is what makes the system systematic, not discretionary.

---

## 4. "Stack the Odds"

The end goal of every feature in TradeStack is to **stack the odds in the trader's favor**:

- **Systematic scanning** — eliminate emotional picks
- **Settings engine** — every parameter configurable, nothing hardcoded
- **Paper trading first** — validate before risking capital
- **Live streaming** — react to market moves in real time
- **State machines** — no ambiguous trade states, every transition enforced
- **Trade logs + heatmap** — measure, improve, repeat

---

## 5. Modularity — The Stack is Extensible

A stack is not fixed. You can add or swap layers without rebuilding everything:

- Want to add **options trading**? Write a new module. It sits in the stack alongside the existing equity layer.
- Want to integrate a **different broker**? Swap the connection/streamer layer. The scanner and UI remain untouched.
- Want to add **futures** or **commodities**? Add them as new stock list types. The pipeline stays the same.

TradeStack is designed for growth. The name reflects that.

---

## Summary

| Reason | One‑liner |
|--------|-----------|
| Technology | Full-stack architecture (Python + Node.js + React) |
| Pipeline | Data flows through stacked transformations |
| Validation | Every trade passes a stack of rule checks |
| Mission | Stack the odds in your favor |
| Modularity | Swap or add layers without breaking the system |

**TradeStack** — one name, multiple meanings. Every one of them true.
