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

### Phase 2 — Tight TypeScript types (DONE 21 Oct 2026)
- [x] Create `frontend/src/lib/types.ts` (single source of truth for Python payloads) — `ScanResult`, `ReversalResult`, `ScanRowPayload` (raw/nullable), `ScanStatusPayload`, `StockListItem`, `StockListResponse`, `CandleData`, `CacheInfo`, `OperationStatus` (+`logs?`), `OperationStatusResult`, `SettingsListResponse`
- [x] Move `ScanResult` / `ReversalResult` out of `AppStateContext.tsx` into `types.ts` — AppStateContext imports + re-exports for existing consumers
- [x] Type `loadConfigFromPython` in `app/api/live/route.ts` — settings array typed via `SettingsListResponse`; `StartBody` interface; the `load` action's `JSON.parse(JSON.stringify(...))` + `as any` replaced by an explicit `ScanRowLike`→`ScannerStock` mapping (`Number()`/`String()` coercions); `ScannerResult.declinePercent`/`declineDaysMax` made optional (loader never reads them)
- [x] Kill `any` in scanners, `StockList`, `CacheData`, `ScannerSplitPane`, `LiveTrading`, `paper-trader.ts` — scanner rows built explicitly from `ScanRowPayload` (no more `...r` spread of unknown), `catch` blocks typed, `chartCacheRef`/sort keys typed (`keyof ScanResult`), `rawStocks` as `StockListItem[]`, `stocks` as typed `ScannerStock[]`
- [x] **ORB fields promoted to typed base classes** — new `frontend/src/lib/live-trader/orb-base.ts` (`OrbFields`: `orbHigh` / `orbLow` / `firstCandleOpen` / `orbFrozen` / `protected _firstTs`); reversal `StateMachineMixin` and continuation `ContinuationStateMachine` both `extends OrbFields` (with `super()`); all ~12 `as any` casts removed; subclass duplicate field declarations deleted (reversal `StockMonitor` kept inheritance-clean, continuation monitor accesses `this._orbStartMinute` via `protected`)
- [x] Fix `_firstTs` undeclared in reversal state (early-update branch currently dead) — now declared in `OrbFields` and updated on both branches: `this._firstTs = Math.min(this._firstTs, earliestTs)` (reversal) + guarded update (continuation)
- Extra: `CandleAggregator.getStartMinute()` public getter replaces `(aggregator as any).startMinute`; `globals.d.ts` declares `__addLiveLog` (used by `index.ts`, `route.ts`, `paper-trader.ts`, `lock.ts`, `streamer.ts`); `pre-market-flow.ts` input loosened to a structural `{ symbol; instrumentKey?; previousClose }` param instead of `ScannerStock`; `lock.ts`/`streamer.ts`/`subscription-mgr.ts` `catch (err: any)` → typed casts
- Remaining (approved SDK seams, Phase 4a follow-up): `streamer.ts` `sdkStreamer: any` / `feeder: any` / `(error: any)` callback, `upstox-sdk.d.ts` internals

**Phase 2 evidence (21 Oct 2026):**

| Check | Result |
|-------|--------|
| ORB regression tests (written BEFORE refactor) | ✅ **25/25 pass** (`frontend/tests/live-trader/{continuation,reversal}-orb.test.ts`, commit `5bc5162`) |
| Same tests AFTER the refactor | ✅ 25/25 pass (no behaviour change) |
| `tsc --noEmit` | ✅ clean |
| `eslint src` | ✅ **51 problems (30 errors, 21 warnings)** vs baseline 126 (105, 21) — delta −75 |
| `bun run build` | ✅ compiled in 4.2s |
| backend `import server` | ✅ OK (52 routes) |
| `as any` / `: any` left in touched zones | ✅ only approved SDK seams listed above |
| Commits | `5bc5162` (tests first), `cbd2121` (refactor, 27 files +411/−214) |

### Phase 4b — Frontend tests (Vitest) — partial (21 Oct 2026)
- [x] Add `vitest` + config to `frontend/` — vitest 5.0.5 (`bun add -d vitest`), `vitest.config.ts` (include `tests/**/*.test.ts`, node env), `"test": "vitest run"` script, run: `node node_modules\vitest\vitest.mjs run` from `frontend/`
- [x] ORB regression tests **written before** the Phase 2/3 refactors — commit `5bc5162` preceded `cbd2121`
- [x] Continuation + reversal state-machine tests (entry gates, SL exits, transitions) — 12 continuation + 13 reversal tests: gap gates + direction override, ORB tracking via aggregator (out-of-order OK), low-violation gate, `freezeOrb()` freezing entryHigh, post-freeze no-ratchet, strict `>` breakout, feed-time/ENTRY_TIME gating, SL exit pnl, OOPS `>=` previousClose entry, priority selection
- [ ] Paper-trader P&L / risk-based sizing tests
- [ ] IST utils tests (`secondsUntilIST`, `sleepUntilIST`)
- [ ] `api.ts` helper error-handling tests

### Phase 3 — De-duplicate scanners + shared UI (DONE 21 Oct 2026)
- [x] Extract `useToastStack` — `frontend/src/lib/hooks/useToastStack.ts`; 4 simple call sites migrated (`Continuation`/`Reversal` via ScannerBase, `StockList`, `LiveTrading`); CacheData migrated with options (`durationMs: Infinity`, `defaultType: "success"`, custom `pickPosition` that reuses freed slots — position now computed inside the functional update from fresh state instead of the old stale closure)
- [x] Extract `usePollOperation` (1s/2s status poll loop) — scanner variant: `useScannerStatusPoll` (1s loop, expired/progress/completed/error/lost-connection callbacks, mapper-injected row typing); CacheData keeps its 2s `OperationStatus` loop (different payload shape)
- [x] Extract `useSavedList(listType)` — `scanner/useSavedList.ts` (load + toggle + toasts), used by both scanners
- [x] Build `ScannerBase` driven by a strategy config object — `scanner/ScannerBase.tsx` (354 lines) + helpers `FilterBar.tsx` / `ScannerTable.tsx` (generic) / `useScannerFilters.ts` (generic filter dict + direction + scan-date, localStorage + settingsSync + hydration). Config: `palette` (colors), `filters`, optional `direction`, `scanFilters`/`postPayload`/`mapper`/`columns`/`renderCells`/`csvHeader`/`csvRow`, `defaultSortKey`. App-state props (`results`/`setResults`/`setProgress`/`viewMode`...) are supplied by the wrapper with exact types — **no casts needed anywhere**
- [x] `ContinuationScanner` / `ReversalScanner` become thin config wrappers — ~103/105 lines (were ~505/~484)
- Behaviour notes: per-field effects replaced by setter-persist + single mount persist/hydrate effect (identical request pattern on mount and change); scanner toasts now start `t-` ids (was `toast-...` in CacheData only — CacheData keeps its visible-on-click behaviour); breakout: the two old sort impls (`av < bv ? -1 : 1`) replaced with stable numeric/localeCompare compare (tie → 0)

**Phase 3 evidence (21 Oct 2026):**

| Check | Result |
|-------|--------|
| `tsc --noEmit` | ✅ clean |
| `eslint src` | ✅ **48 problems (30 errors, 18 warnings)** vs Phase-2 51 (30, 21) — delta −3 |
| vitest | ✅ 25/25 (ORB suites untouched by the UI refactor) |
| `bun run build` | ✅ compiled in 4.0s |
| Scanner wrapper sizes | Continuation **103** lines (was ~505), Reversal **105** (was ~484) |
| Commit | `fef80ea` (13 files, +1120/−1007) |

### Phase 4 — Python tests (pytest) — DONE (21 Oct 2026)
- [x] `pytest` + `httpx` added to `backend/requirements.txt` (already present in venv)
- [x] `tests/conftest.py` — session tmp SQLite DB via new `TRADESTACK_DB_PATH` env hook in `backend/src/db.py` + per-test `tmp_cache` fixture (CacheManager accepts `cache_dir`)
- [x] `test_indicators.py` — SMA/ADR%/MA-angle slope (np.correlate orientation verified)/price change/high-low distance/filter helpers vs hand-computed values
- [x] `test_scanner.py` — synthetic OHLCV: continuation zig-zag match (phase1/2/3 invariants), filters pass/fail, reversal pattern-logic matrix, best-decline-period, downtrend context
- [x] `test_cache_manager.py` — save/load roundtrip, merge dedup `keep="last"` (7-bday overlap), corrupt/missing → None, cache-index upsert, batch-commit, rebuild_index, stats fallback
- [x] `test_db.py` — settings CRUD, stock-list CRUD (`isNew` semantics), breadth upsert, trade-log auto-P&L (profit/loss), daily/yearly P&L, capital stats, upstox config
- [x] `test_server.py` — TestClient smoke on safe endpoints (health, settings, stock-list, trades, breadth read) — scan/download endpoints deliberately excluded
- [x] `test_settings_engine.py` — **regression for fresh-DB seed crash** (`options` SEED key broke `ensure_settings`/`reset_all` on empty tables → fixed with `_upsert_seed` strip helper)
- [x] `test_breadth_bias.py` — date-independent: phase matrix, extremes ladder, range position, velocity, cycle, divergence, turn score, **all 16 resolve_bias priorities + overlays**, seeded `compute_daily_bias`
- [x] **Stale date-dependent tests deleted** (`tests/test_bias_2026_08_19.py`, `tests/test_bias_engine.py` — they also imported real DB rows and had an outdated `resolve_bias` arity)
- [x] Production bugs fixed by the suite: `settings.py:181/150/170` fresh-DB `TypeError` (options key) + `db.get_cache_stats()` rounding `total_size_mb` to 0.0 for caches < ~10MB (frontend formats itself; db + `cache_manager.stats()` now return un-rounded values)
- Result: **111 passed in ~2.6s** (`.\backend\venv\Scripts\python.exe -m pytest tests` from repo root)

### Phase 4b — Frontend tests (Vitest)
- [ ] Add `vitest` + config to `frontend/`
- [ ] ORB regression tests **written before** the Phase 2/3 refactors
- [ ] Continuation + reversal state-machine tests (entry gates, SL exits, transitions)
- [ ] Paper-trader P&L / risk-based sizing tests
- [ ] IST utils tests (`secondsUntilIST`, `sleepUntilIST`)
- [ ] `api.ts` helper error-handling tests

### Phase 5 — Python logging + error handling — DONE (21 Oct 2026)
- [x] `backend/src/logging_config.py` — `setup_logging()` (console INFO + rotating `data/logs/backend.log` 2MB×3, level from settings `log_level`, urllib3 quietened, idempotent with `force=True` rebuild for tests, `TRADESTACK_LOGS_DIR` env override)
- [x] `server.py` calls it on import (falls back INFO); lifespan logs start/stop; removed the old `logging.basicConfig` in `__main__`
- [x] `AccessLogMiddleware` — one `access METHOD path -> STATUS (X ms)` line per request + `X-Process-Time` response header
- [x] Consistent error shape — `@app.exception_handler(Exception)` returns JSON `{"detail": "Internal server error: <Type>"}` (frontend `api.ts extractDetail` contract), tracebacks logged server-side
- [x] `_fail_operation(operation_id, label, e)` — created-if-missing op dict, `pop("result")`, status/progress/message/error/logs set, never raises (belt-and-braces except) — all 7 background handlers (`_run_bhavcopy_update`, `_run_fill_gaps`, `_run_historical_download`, `_run_sync_new_stocks`, `_run_continuation_scan`, `_run_reversal_scan`, `_run_breadth_update`) now use it, so operations can no longer get stuck at `status: "running"` after an exception (including exceptions inside the old except-blocks, e.g. `KeyError` on a vanished op)
- Tests: `tests/test_logging.py` (5) + `tests/test_server.py` +6 (timing header, 404/422 shape, injected 500 route with `raise_server_exceptions=False`, `_fail_operation` ×3 incl. sabotaged-dict guard)

### Phase 6 — Frontend robustness — DONE (21 Oct 2026)
- [x] `components/ErrorBoundary.tsx` — class-based boundary wrapped around `{children}` in `layout.tsx`: dark error card (error message via `errorMessage()`, "Try again" reset + "Reload page"), details logged via `logger.error("ErrorBoundary", ...)` with component stack
- [x] `lib/logger.ts` — structured logger: `LogLevel` (DEBUG/INFO/WARN/ERROR), `LogEntry` {ts, level, source, message}, leveled console output, pluggable sinks (unsubscribe returned, throwing sinks isolated); `LogLine` {timestamp, message, level} type shared by SSE/route/UI
- [x] `lib/errors.ts` — unified `errorMessage(err)` covering Error, FastAPI `{"detail"}`, Next-route `{"error"}`, `{"message"}`, strings, fallback `String()` — adopted in `api.ts` request catch
- [x] Structured live-trader logs with severity — `__addLiveLog(msg, level?)` (ambient type updated), `route.ts addLog(msg, level)` keeps **structured** `logsBuffer: LogLine[]` (GET /api/live returns structured lines; SSE broadcast carries `level`), severity threaded from sources: streamer (auth/SDK/connection/reconnect errors → ERROR, WebSocket closed → WARN), orchestrator (pre-market failure → WARN, stream-connect failure → ERROR), lock contention → ERROR, insufficient-capital → WARN, start error → ERROR; `TerminalLogs.tsx` colors by level (red/amber) keeping the old INFO substring accents (Starting green, Stopping amber, Loaded blue)
- [x] `LiveStatus.logs` type updated to `LogLine[]`
- Tests: `tests/lib/logger.test.ts` (5 — sink delivery/unsubscribe/console mapping/Error suffix/throwing-sink isolation) + `tests/lib/errors.test.ts` (8 shapes) — vitest **37/37 ✅** (was 25), tsc ✅, eslint baseline 48 (30e/18w) restored after fixing a new unused-import warning, `bun run build` ✅

### Phase 7 — Architecture docs + README — DONE (21 Oct 2026)
- [x] Root `README.md` rewritten: ASCII architecture diagram + `<details>` Mermaid version, tech-stack table **with why**, consolidated Commands table (pytest/vitest/tsc/lint/build/smoke), env overrides, 6-step end-to-end data flow (cache → scan → load → live loop → SQLite → review), testing-suite table
- [x] `AGENTS.md` Testing Approach replaced with runnable verification commands (pytest 123, vitest 37, tsc, lint baseline 48, build) + test/CI env overrides

### Phase 8 — Deployment readiness (setup script) — DONE (21 Oct 2026)
- [x] `setup.ps1` (PS 5.1-safe, ASCII-only — em-dashes without a BOM corrupted parsing) + `setup.sh`: prerequisites check (bun, python/py), both `bun install`s, backend venv + pip, `seed_db.py` bootstrap, data checks, next-steps output. Verified end-to-end on this machine
- [x] `backend/seed_db.py` — one-shot idempotent bootstrap: `init_db()` + `ensure_settings()` + `cache.rebuild_index()` (2658 entries on this machine); also usable manually
- [x] `data/NSE.json.gz` now TRACKED via `.gitignore` `data/*` + `!data/NSE.json.gz` negations (git can't re-include under an excluded dir — both `data/` rules converted to `data/*`), so fresh clones get the instrument map for free
- [x] Root `.env.example` documenting backend env overrides + frontend URL vars; README Getting Started leads with the one-shot script and keeps the manual equivalent

### Phase 9 — Housekeeping sweep — DONE (21 Oct 2026)
- [x] Removed `StarBorder.tsx` (zero importers — eslint errors 30 → 28, new baseline **46**)
- [x] Removed root `test_write.txt` + all 42 `_tmp_*` scratch files from root `tests/` (step scripts + pytest suite kept; `tests/` tracking already coherent): conftest + 8 test modules + 2 step scripts tracked; old stepN/debug scripts remain local-only per gitignore
- [x] `trailingSlThreshold` — removed the dead TS plumbing (config field, route mapping, orchestrator/loader threading, both state-machine param interfaces, both test fixtures). The `trailing_sl_threshold` Settings row + UI stay (user-editable, reserved) — no behavior change, nothing ever read it
- Gates: tsc clean ✅, vitest 37/37 ✅, eslint 46 (below previous 48) ✅, build ✅
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
| 21 Oct 2026 | Phase 4b (partial) | vitest 5.0.5 installed; `frontend/vitest.config.ts` + `test` script; **25 ORB regression tests across 2 suites written and green BEFORE any refactor** (fixture lesson: pre-entry `checkLowViolation()` must run in the test sequence like production ENTRY_TIME does, or post-entry ticks trip the rejection path). Commit `5bc5162`. |
| 21 Oct 2026 | Phase 2 | Typed base class `OrbFields` (`orb-base.ts`), both state machines extend it, ~12 `as any` casts removed, `_firstTs` fixed in `OrbFields`, `lib/types.ts` created, `loadConfigFromPython` + `load` action fully typed (explicit `ScanRowLike`→`ScannerStock` mapping, `ScannerResult` optional fields), UI `any` kills in 6 components, `globals.d.ts` for `__addLiveLog`, 6 catch blocks typed. Gates: tsc ✅, eslint **51** (vs 126 baseline), vitest 25/25 ✅ post-refactor, build ✅ 4.2s, backend import ✅. Commit `cbd2121`. |
| 21 Oct 2026 | Phase 3 | ScannerBase engine + 4 shared hooks; scanners went ~505/~484 → ~103/105 lines; scanner variant of the 1s poll hook; CacheData toast migrated with no-auto-dismiss + free-slot positions. Gates: tsc ✅, eslint **48** (30 err, 18 warn), vitest 25/25 ✅, build ✅ 4.0s. Commit `fef80ea`. |
| 21 Oct 2026 | Phase 4 | Full pytest suite: conftest (TRADESTACK_DB_PATH + tmp cache), indicators/scanner/cache/db/server/settings-engine/breadth-bias tests — synthetic, date-independent. Killed the stale date-dependent breadth scripts. Suite caught **2 latent production bugs** (options-key crash on fresh DB seeding; total_size_mb 0.0 rounding) which were fixed. Gates: **pytest 111/111 ✅** (~2.6s), backend `import server` ✅. |
| 21 Oct 2026 | Phase 5 | Central logging (`logging_config.py` + server wiring), access-log middleware with `X-Process-Time`, JSON `detail` shape for unhandled 500s, `_fail_operation` refactor of all 7 background handlers (no stuck `running` states). Gates: **pytest 123/123 ✅** (2.4s), backend `import server` ✅ (console + RotatingFileHandler registered). |
| 21 Oct 2026 | Phase 6 | ErrorBoundary wrapped around page children; `lib/logger.ts` (severity + sinks) + `lib/errors.ts` (`errorMessage`) with vitest coverage and `api.ts` adoption; live-trader logs now structured with severity end-to-end (`LogLine` through `__addLiveLog` → route buffer/SSE → TerminalLogs level colors). Gates: vitest **37/37 ✅**, tsc ✅, eslint baseline 48 restored, build ✅. |
| 21 Oct 2026 | Phase 7 | README rewritten (ASCII + Mermaid architecture diagram, "why" tech-stack table, command/env tables, E2E data flow, testing table); AGENTS.md Testing Approach now lists the real verification commands. Commit `e1b8afa`. Docs-only — no code gates. |
| 21 Oct 2026 | Phase 8 | `setup.ps1` (verified end-to-end: bun installs, venv, pip, seed) + `setup.sh` (bash -n clean) + `backend/seed_db.py` (init_db + ensure_settings + rebuild_index → 2658 entries) + root `.env.example`; `data/NSE.json.gz` tracked via `data/*`/`!data/NSE.json.gz` negations. pytest 123/123 re-verified after seed script. Commit `8855c91`. |

- [x] Remove `test_write.txt` (stray scratch file at repo root) — Phase 9
- [x] Wire or remove unused config `trailingSlThreshold` — removed the dead TS plumbing; Settings row stays, reserved — Phase 9
- [x] Normalize `docs/` + `tests/` tracking (force-add the intended tracked files) — pytest suite tracked in Phase 4; Phase 9 swept the 42 `_tmp_*` scratch files — Phase 9

### Phase 10 — Bug fix: reversal "max positions filled" (DONE 06 Aug 2026)
- [x] Already fixed upstream in `index.ts` — backups stay subscribed as standby

### Phase 12 — Real-order execution (DONE 22 Oct 2026)
Beyond the original checklist: fills the OFF side of the `paper_trading` switch.
- [x] `order-executor.ts` — `TradeExecutor` seam + `PaperExecutor` + `UpstoxExecutor` (MARKET entry → fill poll → SL-M stop → trade log; exits manual, never placed)
- [x] Wired into orchestrator + both integrations + stocks-loader (param rename `paperTrader` → `tradeExecutor`)
- [x] `order_product` setting seeded (I/D/MTF, live_trading) + `route.ts` mapping + `OrderProduct` type in `types.ts`
- [x] LiveTrading.tsx real-mode confirm dialog (red, explicit consequence text)
- [x] Solved during work: `time` missing in `executeEntry`, required `entry_date` field, rejected-SL mislog, SL polled forever
- [x] 7 executor vitest tests (mocked fetch, fake timers) — suite 44/44; tsc clean; lint **45** (below 46 baseline); build ✅; pytest 123/123 ✅
- [x] Step doc: `docs/steps/step22_real_order_execution_22Oct26.md`

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

