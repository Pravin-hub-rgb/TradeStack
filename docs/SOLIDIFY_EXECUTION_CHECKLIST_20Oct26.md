# SOLIDIFY Execution Checklist — TradeStack

> **Status:** IN PROGRESS
> **Created:** 20 Oct 2026
> **Branch:** `feature/sync-new-stocks`
> **Safety branch:** `backup/pre-solidify-20Oct26` (points at `29481c2`, pre-work)
> **Source plan:** `SOLIDIFY_TRADESTACK_PLAN_3Aug26.md`
> **Scope:** Preserve existing uncommitted work → execute SOLIDIFY Phases 0–11.

---

## 0. How to read this document

This is a **living checklist**. Every checkbox below is a real, verifiable unit of work.

Status legend:

| Mark | Meaning |
|------|---------|
| `[x]` | Done **and** verified (the verification command is named in the row) |
| `[~]` | Partially done — see the note under the row |
| `[ ]` | Not started |
| `[!]` | Blocked — reason given |

**Verification gates** used throughout (all must pass before a phase is marked `[x]`):

```powershell
# Frontend
cd frontend
node node_modules/typescript/bin/tsc --noEmit      # typecheck (npx tsc is broken here — no global TS)
node node_modules/eslint/bin/eslint.js src        # lint
& "$env:USERPROFILE\.bun\bin\bun.exe" run build    # production build
& "$env:USERPROFILE\.bun\bin\bun.exe" test         # vitest (after Phase 4b)

# Backend
cd backend
.\venv\Scripts\python.exe -m pytest ..\tests -q     # pytest
.\venv\Scripts\python.exe -c "import sys; sys.path.insert(0,'.'); import server"  # import smoke
```

---

## 1. Environment baseline (measured 20 Oct 2026)

| Item | Value |
|------|-------|
| Node | v24.21.0 |
| Bun | 1.3.10 — **not on PATH**, lives at `%USERPROFILE%\.bun\bin\bun.exe` |
| Python | backend venv, pytest 9.0.3 available |
| Docker | **NOT installed** — Phase 11 artifacts can be authored but not built/tested |
| TypeScript | 5.9.3 (local `node_modules`; `npx tsc` fails — resolves the wrong `tsc` package) |
| `tsconfig.json` | `strict: true` ✅ |

### Baseline results (before any SOLIDIFY change)

| Check | Result |
|-------|--------|
| `tsc --noEmit` | ✅ PASS — **after** deleting stale `frontend/.next/` (see note) |
| `eslint src` | ⚠️ **126 problems (105 errors, 21 warnings)** — dominated by `@typescript-eslint/no-explicit-any` |
| `python -c "import server"` | ✅ PASS — 52 routes registered |
| Hardcoded API URLs | **14** (not the "47" claimed in the old plan) across **14 files** |

> **Note — stale `.next/` corruption.** `frontend/.next/dev/types/routes.d.ts` was corrupted
> mid-file (line 62 started with `utes> = {`), producing 3 phantom `TS1109`/`TS1128` errors.
> `rm -rf frontend/.next` fixed it. `.next/` is gitignored, so this was local-only drift.
> **Lesson: delete `.next/` before trusting a typecheck failure.**

### Corrections to the original plan (plan written 03 Aug 2026; repo has moved on)

| Plan claim | Reality on 20 Oct 2026 |
|------------|------------------------|
## 2. Part A — Preserve the existing uncommitted work

**Context:** ~808 lines of uncommitted work existed on `feature/sync-new-stocks` before this
session. It is split into 4 logical commits. Each is independently revertable.

| # | Commit | Scope | Files | Status |
|---|--------|-------|-------|--------|
| A1 | `feat(settings): sync scanner filters to backend DB` | Scanner filter values now persist to SQLite, not just `localStorage`. `price_max` default 2000 → 10000. | `frontend/src/lib/settingsSync.ts` (new), `frontend/src/components/ContinuationScanner.tsx`, `frontend/src/components/ReversalScanner.tsx`, `backend/src/settings.py` | `[x]` `d26a878` |
| A2 | `feat(cache): add scan/sync endpoints for newly listed stocks` | Detect NSE listings missing from cache, download their history. | `backend/server.py` (partial), `backend/src/cache_manager.py`, `frontend/src/components/CacheData.tsx` | `[x]` `2ace788` |
| A3 | `feat(breadth): market breadth bias engine v2 + UI` | Best-of-5 hybrid bias engine; bias panel in Market Breadth page. | `backend/src/breadth_bias.py` (new), `backend/server.py` (partial), `frontend/src/components/MarketBreadth.tsx` | `[x]` `feeb2eb` |
| A4 | `feat(live-trader): 5-min ORB breakout trading behaviour` | Opening-range breakout: OHLC-driven ORB freeze at ENTRY_TIME, strict `>` breakout, feed-time timestamps, shared trading mode. | `frontend/src/lib/live-trader/**` (13 files), `frontend/src/lib/AppStateContext.tsx`, `frontend/src/components/LiveTrading.tsx` | `[x]` `812cca7` |

### A-split technique for `backend/server.py`

`server.py` carries hunks for **both A2 and A3**, so it is committed twice:
1. Write the file **without** the `/api/breadth/bias` block → commit as A2.
2. Restore the full file → commit as A3.

This keeps each commit self-consistent and buildable.

### A-verification

- [x] `git log --oneline` shows 4 new commits with the intended file sets
- [x] `git show --stat <A2>` shows `server.py` without the breadth route
- [x] `git show --stat <A3>` shows `server.py` adding only the breadth route
- [x] `tsc --noEmit` clean after A4
- [x] `python -c "import server"` clean after A2 and A3

**A-verification evidence (20 Oct 2026):**

| Check | Result |
|-------|--------|
| `git show 2ace788:backend/server.py` → `api/breadth/bias` | ✅ **absent** (grep found nothing) |
| `git show feeb2eb:backend/server.py` → `api/breadth/bias` | ✅ **present** (line 742) |
| `git show 2ace788:backend/server.py` → `api/data/scan-new-stocks` | ✅ present (A2 owns it) |
| Backend import at A2 state | ✅ 51 routes, `bias` = False, both new-stock endpoints = True |
| Backend import at A3 state | ✅ 52 routes, `bias` = True |
| `compute_daily_bias()` against live SQLite | ✅ returns `bias=CONTINUATIONS` with all 14 expected keys |
| `tsc --noEmit` after A4 | ✅ exit 0 |
| Total diff vs `backup/pre-solidify-20Oct26` | 24 files, +1785 / −98 — exactly the pre-existing work, nothing lost |

## 3. Part B — SOLIDIFY phases

### Phase 0 — Baseline & guardrails
- [x] Audit repo, git history, working tree, dependencies
- [x] Create safety branch `backup/pre-solidify-20Oct26`
- [x] Measure real baseline (tsc / eslint / backend import / URL count) — §1 above
- [x] Document baseline & plan corrections — this document

### Phase 1 — Central API client (`lib/api.ts`) + env config
- [x] Create `frontend/src/lib/api.ts` — `PY_API` from `process.env.NEXT_PUBLIC_PY_API` ✅  (+ `PY_API_INTERNAL`/`SERVER_PY_API` for server-side calls)
- [x] Typed helpers `apiGet<T>` / `apiPost<T>` / `apiPut<T>` / `apiDelete<T>` with timeout + non-2xx handling ✅  (`ApiError` carries status/url/body; 30s default; abort support)
- [x] Named endpoint groups: `dataApi`, `scannerApi`, `settingsApi`, `stockListApi`, `tradesApi`, `prepApi`, `tokenApi`, `breadthApi`, `instrumentApi` ✅  (+ `healthApi`; call sites NOT yet switched to groups — Phase 1 scope was URL centralization only)
- [x] Replace all **14** hardcoded URLs across the 14 identified files ✅  (2026‑10‑21) — pattern: `import { PY_API } from "@/lib/api"; const API = PY_API;` keeps call sites untouched. Server route `app/api/live/route.ts` uses `SERVER_PY_API as PY_API`; `live-trader/task-utils.ts` and `live-trading-utils.tsx` re-export PY_API so downstream imports stay valid. Verification: grep shows `127.0.0.1:8001` only inside `lib/api.ts`.
- [x] Add `frontend/.env.example` with `NEXT_PUBLIC_PY_API` (+ commented `PY_API_INTERNAL`) ✅  — `frontend/.gitignore` gained `!.env.example` negation

**Phase 1 verification evidence (21 Oct 2026):**

| Check | Result |
|-------|--------|
| `grep "127.0.0.1:8001" frontend/src` | ✅ only `lib/api.ts` (env fallbacks) |
| `tsc --noEmit` (stale `.next` deleted first) | ✅ clean |
| `eslint src` | ✅ **126 problems (105 errors, 21 warnings)** — identical to baseline, delta 0 |
| `bun run build` | ✅ compiled in 3.5s, 11 static pages generated |
| backend `import server` | ✅ 52 routes, bias + scan-new endpoints present |

### Phase 2 — Tight TypeScript types
- [ ] Create `frontend/src/lib/types.ts` (single source of truth for Python payloads)
- [ ] Move `ScanResult` / `ReversalResult` out of `AppStateContext.tsx` into `types.ts`
- [ ] Type `loadConfigFromPython` in `app/api/live/route.ts`
- [ ] Kill `any` in scanners, `StockList`, `CacheData`, `ScannerSplitPane`, `LiveTrading`, `paper-trader.ts`
- [ ] **ORB fields promoted to typed base classes** — `orbHigh` / `orbLow` / `firstCandleOpen` / `orbFrozen` move into a shared base; remove the ~12 `as any` casts
- [ ] Fix `_firstTs` undeclared in reversal state (early-update branch currently dead)

### Phase 3 — De-duplicate scanners + shared UI
- [ ] Extract `useToastStack` (duplicated 5×)
- [ ] Extract `usePollOperation` (1s/2s status poll loop)
- [ ] Extract `useSavedList(listType)` (add/remove toggle)
- [ ] Build `ScannerBase` driven by a strategy config object
- [ ] `ContinuationScanner` / `ReversalScanner` become thin config wrappers

### Phase 4 — Python tests (pytest)
- [ ] Add `pytest` to `backend/requirements.txt`
- [ ] `tests/conftest.py` — temp SQLite DB fixture (requires `DB_PATH` override hook in `backend/src/db.py`) + temp cache-dir fixture
- [ ] `test_indicators.py` — SMA, ADR%, MA-angle, high/low distance vs hand-computed values
- [ ] `test_scanner.py` — synthetic OHLCV: continuation hit/miss, reversal decline detection, base filters
- [ ] `test_cache_manager.py` — save/load/update/merge idempotency, cache-index upsert
- [ ] `test_db.py` — settings CRUD, stock-list CRUD, trade-log P&L
- [ ] `test_server.py` — FastAPI TestClient smoke tests
- [ ] **Replace the stale, date-dependent breadth test** with a date-independent pytest suite

### Phase 4b — Frontend tests (Vitest)
- [ ] Add `vitest` + config to `frontend/`
- [ ] ORB regression tests **written before** the Phase 2/3 refactors
- [ ] Continuation + reversal state-machine tests (entry gates, SL exits, transitions)
- [ ] Paper-trader P&L / risk-based sizing tests
- [ ] IST utils tests (`secondsUntilIST`, `sleepUntilIST`)
- [ ] `api.ts` helper error-handling tests

### Phase 5 — Python logging + error handling
- [ ] Central logging config (console + `data/logs/`)
- [ ] Request middleware for access logs; consistent error response shape
- [ ] Background operations never stuck in `status: "running"` on exception

### Phase 6 — Frontend robustness
- [ ] React `ErrorBoundary` wrapping pages
- [ ] `logger` util
- [ ] Unified error surfacing from `api.ts`
- [ ] Structured live-trader logs with severity

### Phase 7 — Architecture docs + README
- [ ] Rewrite root `README.md` — architecture summary, Mermaid diagram + ASCII fallback, tech-stack table with "why", run/test commands, end-to-end data flow
- [ ] Update `AGENTS.md` with new lint/test commands

### Phase 8 — Deployment readiness (setup script)
- [ ] `setup.ps1` + `setup.sh` — bun install (root + frontend), Python venv + pip install, seed DB/cache index
- [ ] Copy `data/NSE.json.gz` (current instrument source) if present
- [ ] `.env.example` + clean setup instructions in README

### Phase 9 — Housekeeping sweep
- [ ] Remove dead code: `StarBorder.tsx`
## 4. Known risks & open questions

| # | Risk | Mitigation |
|---|------|-----------|
| R1 | A4 changes **live trading behaviour** (ORB breakout, strict `>` trigger, feed-time stamps) | Write ORB regression tests **before** the Phase 2/3 refactor touches these files |
| R2 | ~12 `as any` casts hide real type errors in the ORB inheritance chain | Promote ORB fields to a typed base class in Phase 2, then re-typecheck |
| R3 | `_firstTs` is undeclared in the reversal state → the "early update" branch never fires | Fix in Phase 2 alongside the ORB base-class work |
| R4 | Stale breadth test is date-dependent → fails on any other day | Replace with a date-independent pytest suite (Phase 4) |
| R5 | `docs/` and `tests/` are gitignored → new docs/tests would not be committed | Use `git add -f` for the intended tracked subset |
| R6 | Docker unavailable → Phase 11 unverifiable | Author carefully; validate YAML/JSON syntax locally; document as untested |
| R7 | ESLint baseline is already 105 errors | Do **not** make it worse; track the delta per phase |

---

## 5. Execution log

| Date | Phase | Outcome |
|------|-------|---------|
| 20 Oct 2026 | Audit | Repo, history, working tree, deps audited. 21 modified + 4 untracked files mapped to 4 commits. |
| 20 Oct 2026 | Baseline | `tsc` clean (after stale `.next` cleanup). `eslint` = 126 problems. Backend imports, 52 routes. 14 hardcoded URLs (not 47). |
| 21 Oct 2026 | Phase 1 | Finished central API client + migrated all 13 remaining files, `.env.example` added. Deleted 25 bot scratch temp files from root; user notes moved to `docs/stock-vs-nifty/` + `docs/NSE_instrument_pipeline_notes_20Oct26.md`. Gates: grep-only-api.ts, tsc clean, eslint 126 = baseline, bun build ✅, backend import ✅. |

- [ ] Remove `test_write.txt` (stray scratch file at repo root)
- [ ] Wire or remove unused config `trailingSlThreshold`
- [ ] Normalize `docs/` + `tests/` tracking (force-add the intended tracked files)

### Phase 10 — Bug fix: reversal "max positions filled" (DONE 06 Aug 2026)
- [x] Already fixed upstream in `index.ts` — backups stay subscribed as standby

### Phase 11 — Cross-PC deployment: Docker + desktop shortcut
- [ ] `Dockerfile.backend` — `python:3.11-slim`, uvicorn on `0.0.0.0:8001`
- [ ] `Dockerfile.frontend` — `oven/bun:1`, `next start -p 3000`
- [ ] `docker-compose.yml` — 2 services, `./data` bind-mount, `NEXT_PUBLIC_PY_API` baked at build
- [ ] **Use `data/NSE.json.gz`**, not the stale `data/complete.csv.gz` assumption
- [ ] CORS — add `http://127.0.0.1:3000` defensively in `backend/server.py`
- [ ] `start.bat` / `start.sh` / `stop.bat` / `stop.sh` / `install-shortcut.bat`
- [ ] README "Run on another PC" section
- [!] **Docker not installed locally** → files can be authored and lint-reviewed, but **cannot be built or run-tested**

---

---

| 47 hardcoded API URLs across 12 files | **14 across 14 files** |
| "No tests exist yet — root `tests/` is empty" | 20 test scripts exist; 2 are tracked (`step13`, `step4`) |
| Docker = follow-up, not this pass | Phase 11 requires it — but Docker is unavailable locally |
| `data/complete.csv.gz` is the instrument source | **Now `data/NSE.json.gz`** (migrated in commit `29481c2`) |
| `docs/` and `tests/` are gitignored | Still true → tracked docs need `git add -f` |

---
