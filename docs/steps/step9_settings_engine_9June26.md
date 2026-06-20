# Step 9: Settings Engine

**Date:** 9 June 2026  
**Goal:** Every parameter that previously required file-editing is now editable from the Settings UI.

---

## What We Built

### Backend

| File | What It Does |
|------|-------------|
| `backend/src/db.py` | Added `settings` table (key, value, type, category, label, description, min, max, step) and `settings_meta` table (version tracking). Added 11 CRUD functions. |
| `backend/src/settings.py` | Settings manager — 70 seed defaults across 15 categories, auto-seeds on import if DB empty or version mismatch. Functions: `get_all()`, `get(key)`, `set(key, value)`, `reset_category()`, `reset_all()`. Type casting for boolean/number/string/password. |
| `backend/server.py` | 5 new endpoints: `GET /api/settings`, `GET /api/settings/:key`, `PUT /api/settings/:key`, `POST /api/settings/reset/:category`, `POST /api/settings/reset` |

### Frontend

| File | What It Does |
|------|-------------|
| `frontend/src/app/settings/page.tsx` | Full settings page with MUI Tabs (categorized), editable fields (number, text, time, toggle, masked password), per-field Save button with spinner, per-category Reset button, Snackbar feedback |
| `frontend/src/components/Navbar.tsx` | Added Settings link with SettingsIcon |

### Settings Categories (15 total, 70 parameters)

| Tab | Key Parameters |
|-----|---------------|
| **Trading Schedule** | Market open/close, entry window, prep offset, confirmation window |
| **Risk Management** | Max positions, entry SL%, trailing SL, drawdown, profit target, time exit, quality score |
| **Entry Conditions** | Gap up min/max, strong start gap |
| **Scanner — Base Filters** | Price range, min ADR, volume threshold, movement threshold, lookback, SMA period, ADR period |
| **Scanner — Continuation** | Near MA threshold, max body %, consolidation range, distance from high, MA angle |
| **Scanner — Reversal** | Decline days range, min decline %, oversold distance |
| **Volume Validation** | SVRO ratio, baseline days, volume surge threshold |
| **Volume Profile** | VAH bin size, value area % |
| **Technical Indicators** | Price change periods, high/low period, rising MA window |
| **Connection** | API poll/retry delays, WebSocket reconnect/retries |
| **Error Handling** | Max retries, retry delay |
| **API Credentials** | Upstox API key, secret, access token (masked) |
| **Paper Trading** | Enable/disable toggle, log directory |
| **Data Management** | Cache days, bhavcopy batch size, historical download days |
| **Logging** | Log level, file/console toggles, debug mode |

---

## Key Design Decisions

1. **Type-casting on read.** Settings store values as TEXT in SQLite. `settings.get(key)` casts them to `int`/`float`/`bool`/`str` based on the `type` column. Frontend never has to parse.

2. **Seed on import.** `settings.py` calls `ensure_settings()` at module level. If the DB is empty or version differs, it re-seeds all 70 defaults. Version is tracked in `settings_meta` table.

3. **Per-field save, not batch.** Each setting has its own Save button. This avoids accidentally overwriting unsaved changes in other fields. Reset is per-category (bulk).

4. **Masked passwords.** The `credentials` category uses `type=password` fields with show/hide toggle. Values are never displayed in plaintext by default.

5. **Validation metadata.** Each setting stores `min`, `max`, `step` for number fields. Frontend renders HTML5 number inputs with these constraints.

---

## Verification

**17/17 tests pass:**
```powershell
cd MA_Stock_Trader_NA\backend
.\venv\Scripts\python ..\tests\step9_settings.py
```

Tests cover: auto-seed count (70), category count (15), type casting (int, bool, string), set + reset + verify, all seed keys present in DB, API endpoints (GET/PUT/reset/404).

Frontend builds cleanly (verified with `bun run build` — all routes including `/settings` compile).

---

## 🎓 Learning From This Step

| Concept | What It Is | Suggested Project |
|---------|-----------|-------------------|
| Settings Engine | Centralized config store replacing hardcoded constants | Build a settings page for any app you use daily |
| Auto-seeding | Populating default values on first run | Create an app that works out of the box with no config file |
| Type casting | Storing as TEXT, parsing on read by type column | Build a generic key-value store that supports int/bool/float values |
| Categorized settings UI | Tabs grouping related parameters | Redesign any app's settings page with grouped tabs |
