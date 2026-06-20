# Step 8: Upstox Historical Data Downloader (+ Token Management)

**Date:** 09 Jun 2026
**Phase:** Phase 0.5 (Data Pipeline)

---

## What We Built

A system to download 180 calendar days (~120 trading days) of EOD historical data for all NSE stocks via the Upstox API. This replaces the need to ship `.pkl` cache files with the project — a fresh install can download its own data.

### Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `backend/src/upstox_fetcher.py` | **NEW** | Downloads historical EOD data for all NSE stocks via Upstox HTTP API |
| `backend/src/upstox_config.py` | **NEW** | Token storage and validation using SQLite |
| `backend/src/db.py` | **UPDATED** | Added `upstox_config` key-value table + CRUD helpers |
| `backend/server.py` | **UPDATED** | Added token endpoints + historical download endpoint |
| `frontend/src/components/TokenDialog.tsx` | **NEW** | MUI dialog for token input with validation |
| `frontend/src/components/CacheData.tsx` | **UPDATED** | Added "Download Data" button with token flow |
| `data/complete.csv.gz` | **COPIED** | Upstox instrument master file (8635 NSE stocks) |

---

## How It Works

### The "Download Data" Button

Located in the **Cache Data** tab under "Update Market Data":

- **Label:** "Download Data" (no day count — avoids confusion)
- **Disabled when:** Cache already has data (>100 stocks)
- **Click flow:**

```
[Download Data] click
    ↓
GET /api/token/status
    ↓
Token exists? ──NO──→ [Token Dialog opens]
    │                      │ user pastes token
    │                      │ clicks "Validate & Update"
    │                      │ POST /api/token/validate
    │ YES                  │ server → saves to SQLite → tests 3 stocks
    │                      │ returns valid/invalid
    │                      │ if valid → close dialog → start download
    ↓                      ↓
POST /api/data/download-historical
    ↓
Background task iterates ALL NSE stocks:
  For each stock:
    1. fetch_historical_data(symbol, token, days=180)
       → https://api.upstox.com/v2/historical-candle/{key}/day/{to}/{from}
       → returns OHLCV DataFrame (~119 rows)
    2. cache_manager.update(symbol, df)
       → merges with existing cache (or creates new .pkl)
    3. Progress callback → logs[] with per-stock updates every 10 stocks
    ↓
Frontend polls GET /api/data/status/{operation_id}
    ↓
Terminal logs update in real-time
    ↓
Done → button disabled
```

### Token Management

| Endpoint | Method | What It Does |
|----------|--------|-------------|
| `/api/token/status` | GET | Returns `{exists, masked_token, updated_at}` — no validation |
| `/api/token/validate` | POST | Saves token to SQLite, tests against RELIANCE/TCS/HDFCBANK |
| `/api/token/check` | GET | Read-only validation of stored token (doesn't save) |

**Token storage:** `data/settings.db` → `upstox_config` table (key-value pairs: `access_token`, `token_updated_at`).

**Token dialog features:**
- Password-masked input with visibility toggle (eye icon)
- "Validate & Update" button that saves + tests
- Success/error feedback with auto-close on success
- Same flow will be reused by Live Trading (Phase 3.5+)

### Why Direct HTTP (Not the SDK)

- The old project used `upstox-python-sdk` (a 5MB+ dependency)
- The NA version makes direct HTTP requests to the Upstox API:
  - Historical: `GET /v2/historical-candle/{instrument_key}/day/{to_date}/{from_date}`
  - LTP (for validation): `GET /v2/market-quote/ltp?instrument_key={key}`
- Response is parsed directly into a pandas DataFrame
- No additional pip install needed (`requests` is already required)

### The Instrument Mapping File

`data/complete.csv.gz` is a gzipped CSV from Upstox containing ~8635 NSE equity instruments:
```
tradingsymbol,instrument_key,exchange
RELIANCE,NSE_EQ|INE002A01018,NSE_EQ
TCS,NSE_EQ|INE467B01029,NSE_EQ
...
```

Without this file, the API doesn't know which instrument key corresponds to which stock symbol.

---

## Data Flow Diagram

```
                   ┌──────────────┐
                   │  frontend/   │
                   │ CacheData.tsx│
                   └──────┬───────┘
                          │ click "Download Data"
                          ▼
                   ┌──────────────┐
                   │ GET /api/    │ ← checks if token exists
                   │ token/status │
                   └──────┬───────┘
                          │
              ┌───────────┴───────────┐
              │                       │
         token exists           no token
              │                       │
              ▼                       ▼
      ┌───────────────┐     ┌──────────────────┐
      │ POST /api/data/│     │ TokenDialog opens │
      │ download-      │     │ user enters token │
      │ historical     │     │ POST /api/token/  │
      └───────┬───────┘     │ validate          │
              │             └────────┬─────────┘
              ▼                      │ valid
      ┌───────────────┐              │
      │ Background    │◄─────────────┘
      │ Task:         │
      │ for each stock│
      │   fetch_180d  │
      │   save .pkl   │
      │   update SQL  │
      └───────┬───────┘
              │ progress callback
              ▼
      ┌───────────────┐
      │ Terminal logs │
      │ "20MICRONS:119│
      │  days (45/    │
      │  2084)"       │
      └───────────────┘
```

---

## Verification

```powershell
# Test token management
cd MA_Stock_Trader_NA\backend
.\venv\Scripts\python -c "
import sys; sys.path.insert(0, '.')
from src.upstox_config import get_status, validate_token
import json

# Replace with your actual Upstox token
cfg = json.load(open(r'C:\path\to\upstox_config.json'))
result = validate_token(cfg['access_token'])
print(f'Token valid: {result[\"valid\"]}')
print(f'Message: {result[\"message\"]}')
"

# Test single stock download
.\venv\Scripts\python -c "
import sys; sys.path.insert(0, '.')
from src.upstox_config import get_token
from src.upstox_fetcher import fetch_historical_data
token = get_token()
df = fetch_historical_data('RELIANCE', token)
print(f'{len(df)} rows from {df.index[0].date()} to {df.index[-1].date()}')
"
```

---

## 🎓 Learning From This Step

| Concept | What It Is | Suggested Project | Focus |
|---------|-----------|------------------|-------|
| **Upstox REST API** | Direct HTTP calls to `api.upstox.com` for market data | Build a CLI tool that fetches and prints NSE stock prices | `requests.get()`, auth headers, JSON parsing |
| **Instrument mapping** | CSV file mapping stock symbols to exchange instrument keys | Create a simple address book that maps names to IDs via CSV | `pd.read_csv()`, dict lookup, fallback logic |
| **Token storage in SQLite** | Key-value table for API credentials | Password manager with encrypted storage | `INSERT ... ON CONFLICT DO UPDATE`, secure storage |
| **Background task + polling** | Long-running operation with status endpoint | File processor with progress bar | `BackgroundTasks`, operation IDs, polling interval |
| **`gzip` decompression** | Reading `.csv.gz` files without manual unzip | Analyze any gzipped CSV dataset | `gzip.open()`, `pd.read_csv()` on compressed files |
| **URL-safe encoding** | `urllib.parse.quote()` for instrument keys with `|` chars | Build a URL builder for any REST API | URL encoding, special character handling |
