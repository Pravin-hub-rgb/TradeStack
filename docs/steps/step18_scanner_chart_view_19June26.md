# Step 18: Scanner Chart View — Split Pane with Candlestick Charts

## What We Built

Added a chart view toggle to the Continuation and Reversal scanner tabs. Users can switch between Table View (existing) and Chart View (new). Chart View shows a **split-pane layout**:

- **Left pane**: 200-day candlestick chart + SMA20 line + key stats below
- **Right pane**: Slim scrollable stock list with add/remove buttons
- **Navigation**: Click any stock or use ↑↓ arrow keys to switch
- **Hover**: 300ms delay tooltip showing all hidden column values (Close, ADR, Depth, etc.)
- **Data**: All chart data loaded in one batch POST request per scan — instant navigation, zero HTTP calls on switch

## Why

Before: Scanner results were a flat table. You had to use external tools (TradingView) to see a stock's price action before deciding to add it to a watchlist.

After: Candlestick chart + key metrics visible inline, right next to the stock list. Faster decision-making without leaving the app.

## Architecture

### New Files

| File | Purpose |
|---|---|
| `frontend/src/components/scanner/StockChart.tsx` | Lightweight-charts wrapper — candlestick series + SMA20 line, responsive resize |
| `frontend/src/components/scanner/StockTooltip.tsx` | Hover tooltip showing Close/ADR/Dist to MA/Phase1/Phase2/Depth for continuation, or Close/Period/Decline/Trend for reversal |
| `frontend/src/components/scanner/ScannerSplitPane.tsx` | Split-pane layout — left chart + stats, right scrollable stock list, keyboard navigation, batch data fetch |

### Modified Files

| File | Change |
|---|---|
| `backend/server.py` | Added `POST /api/data/batch-stock-history` — takes `{symbols, days}`, reads `.pkl` cache, returns `{symbol: {candles, sma}}` per stock. No DB involved. |
| `frontend/src/components/ContinuationScanner.tsx` | Added Table/Chart view toggle buttons (📋/📊) in results header. Chart view renders `ScannerSplitPane` instead of the `<Table>`. |
| `frontend/src/components/ReversalScanner.tsx` | Same toggle + split-pane integration. |

### New Dependency

`lightweight-charts` v5.2.0 — TradingView's library. ~45KB, canvas-based, purpose-built for financial charts.

### Data Flow

1. User clicks "Run Scan" → backend processes, returns results
2. Scan results appear in Table View by default
3. User clicks the 📊 icon to switch to Chart View
4. On first render, `ScannerSplitPane` fires `POST /api/data/batch-stock-history` with ALL symbols from the scan (one call)
5. Backend reads each `.pkl` file via `cache_manager.load()`, returns last 200 days of OHLCV + SMA20
6. Response cached in local `chartData` state (a `Record<string, CandleData>`)
7. Switching between stocks = instant — already in memory

### Keyboard Navigation

- **↑ / ↓**: Navigate stock list (auto-scrolls into view)
- **Click**: Select a stock
- **Hover**: 300ms delay → floating tooltip with all hidden stats

## Commands Used

```powershell
cd MA_Stock_Trader_NA\frontend
bun add lightweight-charts@5.2.0
```

## Verification

- `npx next build` — 3 new components compile clean
- Backend endpoint tested via curl: `POST /api/data/batch-stock-history {"symbols": ["RELIANCE"], "days": 30}`
- Returns `{ "data": { "RELIANCE": { "candles": [...], "sma": [...] } } }`
- Table/Chart toggle preserves existing Table View functionality (sorting, CSV export, clipboard copy, add/remove)

## 🎓 Learning From This Step

| Technology | What It Is | Suggested Project |
|---|---|---|
| `lightweight-charts` | TradingView's lightweight charting library for financial candlestick charts. Canvas-based, ~45KB, no dependencies. | Build a mini stock chart component that displays NIFTY 50 price action with candlestick + SMA20 line |
| `IChartApi.addSeries(SeriesDefinition, options)` | v5 API — instead of `chart.addCandlestickSeries()`, use `chart.addSeries(CandlestickSeries, ...)`. Series definitions (CandlestickSeries, LineSeries, etc.) are imported separately. | Create a reusable chart component that can switch between candlestick and line modes |
| Split-pane navigation with ↑↓ keys | MUI Box + keydown event listener + `scrollIntoView({ block: "nearest" })` for smooth list navigation | Build a file browser where ↑↓ navigates files and the right pane shows file preview |
| Batch data preloading | One `POST /api/data/batch-stock-history` call fetches ALL chart data at once, cached locally. Zero HTTP overhead when navigating stocks. | Build a photo gallery where all thumbnails are loaded in one batch call, not one-by-one |
