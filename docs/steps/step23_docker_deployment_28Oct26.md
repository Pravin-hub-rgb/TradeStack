# Step 23 — Docker Deployment (Run TradeStack on any PC)

**Date:** 28 Oct 2026
**Phase:** SOLIDIFY Phase 11 (Cross-PC deployment) + docs
**Branch:** `phase11/docker-deploy`

## Why this step

The SOLIDIFY plan (`SOLIDIFY_TRADESTACK_PLAN_3Aug26.md`) treats deployment-readiness as Priority #1 for making TradeStack an interview-grade asset. Phase 8 delivered a **native** setup script (`setup.ps1`/`setup.sh`); Phase 11 delivers the **portable** path: a target PC that has *only Docker* can run the whole stack with one click. This is also the demo/interview path (export images → load on an offline PC).

## State going in

The prior session's work (Phase 12 / real-order execution) was completed and committed at `c7a7630`. All SOLIDIFY phases 0–10 and Phase 12 are DONE. **Phase 11 (Docker) was the only unchecked item.**

```
git status before this step:
  M  .gitignore            (stray ".andromity/" line left by a prior bot — reverted here)
 ?? start.bat              (native launcher, unrelated — left as-is; Docker uses docker-start.bat)
```

## What we built

### 1. Two container images

| Image | Base | Entrypoint | Key decision |
|-------|------|------------|--------------|
| `tradestack/backend:1.0` | `python:3.11-slim` | `uvicorn server:app --host 0.0.0.0 --port 8001` | Server binds `0.0.0.0` (container) — `server.py:1240` hardcodes `127.0.0.1` in `__main__`, so the uvicorn CLI flag is required for container reachability. |
| `tradestack/frontend:1.0` | `oven/bun:1` | `next start --port 3000` | Multi-stage: deps install (frozen lockfile) → source copy → `bun run build` (bakes `NEXT_PUBLIC_PY_API`). |

Files:
- `Dockerfile.backend` — installs Python deps from `requirements.txt`, copies `backend/`, exposes 8001, healthcheck via stdlib (`docker/backend-healthcheck.py`), entrypoint from `docker/entrypoint.sh`.
- `Dockerfile.frontend` — `bun install --frozen-lockfile`, `COPY`, `ARG NEXT_PUBLIC_PY_API` (default `http://localhost:8001`), `bun run build`, `next start`.

### 2. The two-URL Docker networking pattern

This was already designed in `frontend/src/lib/api.ts` (Phase 1). Phase 11 only *uses* it:

```
api.ts:14   PY_API         = process.env.NEXT_PUBLIC_PY_API   ?? "http://127.0.0.1:8001"   // browser
api.ts:26   PY_API_INTERNAL= process.env.PY_API_INTERNAL     ?? ...                            // Next server
api.ts:30   SERVER_PY_API  = PY_API_INTERNAL                                                    // routes use this
```

- **Browser** calls the backend on `http://localhost:8001` — the host port mapped to the backend container. This is `NEXT_PUBLIC_PY_API`, baked at build (Next.js inlines `NEXT_PUBLIC_*` at build time).
- **Next.js server** (`app/api/*` routes) calls the backend on `http://backend:8001` — the compose service name → Docker DNS → the backend container. This is `PY_API_INTERNAL`, injected at runtime (not `NEXT_PUBLIC_*`, so it is never baked into the browser bundle).

```yaml
# docker-compose.yml (excerpt)
frontend:
  build:
    args: { NEXT_PUBLIC_PY_API: http://localhost:8001 }   # baked into browser bundle
  environment:
    - PY_API_INTERNAL=http://backend:8001                # runtime, server-only
```

> This split is the most common place Docker deployments of a full-stack app break — mixing them (e.g. baking the service name into `NEXT_PUBLIC_*`) makes the *browser* try to resolve `http://backend:8001`, which only works inside the Docker network.

### 3. The bind-mount / instrument-map gotcha

`backend/src/upstox_fetcher.py:31` resolves the instrument master file by **file location**:

```python
MASTER_FILE = Path(__file__).resolve().parent.parent.parent / "data" / "NSE.json.gz"
# /app/backend/src/upstox_fetcher.py -> up 3 parents -> /app/data/NSE.json.gz
```

The compose bind-mounts `./data:/app/data`. A bind-mount **completely masks** the container's `/app/data` directory — so anything baked there (e.g. a copied `NSE.json.gz`) is invisible when the volume is mounted. Two consequences:

1. **Fresh git clone + `docker compose up`**: the host `./data` already contains `data/NSE.json.gz` (it's tracked in git via `data/*` + `!data/NSE.json.gz`), so the instrument map is just there — no special handling.
2. **Image-import path** (`docker load` on an offline PC with an empty `./data`): the bundled copy is hidden by the empty bind-mount, so `upstox_fetcher` would crash. **Fix:** bundle `NSE.json.gz` at a path the bind-mount does *not* mask — `/app/instruments/NSE.json.gz` — and let the entrypoint copy it into `/app/data/` at startup if the bind-mount lacks one:

```sh
# docker/entrypoint.sh
if [ ! -f /app/data/NSE.json.gz ] && [ -f /app/instruments/NSE.json.gz ]; then
  cp /app/instruments/NSE.json.gz /app/data/NSE.json.gz
fi
exec "$@"
```

This keeps the no-code-change invariant: the file-location path still points at `/app/data/NSE.json.gz`, which the entrypoint has repopulated.

### 4. Data persistence & DB location

`backend/src/db.py:25-26` resolves the SQLite DB the same way (file-location based → `/app/data/settings.db`), matching the bind-mount. `cache_manager.py:29` resolves cache to `/app/data/cache`. Compose sets `TRADESTACK_DB_PATH=/app/data/settings.db` and `TRADESTACK_LOGS_DIR=/app/data/logs` explicitly (they already resolve there by default — belt and suspenders). `settings.py:ensure_settings()` runs on import, so a fresh `data/` gets a seeded DB on first container start.

### 5. Healthcheck + start order

The backend gets a compose `healthcheck` (stdlib `urllib` probe of `/health`) so the frontend can use `depends_on: condition: service_healthy`:

```yaml
healthcheck:
  test: ["CMD", "python", "-c", "import urllib.request as r; r.urlopen('http://127.0.0.1:8001/health')"]
  interval: 10s; timeout: 5s; retries: 12; start_period: 15s
```

### 6. One-click UX

- `docker-start.bat/sh` — `docker compose up -d`, poll `/health` until healthy, open `http://localhost:3000`, then `docker compose logs -f`.
- `docker-stop.bat/sh` — `docker compose down`.
- `install-shortcut.bat` — PowerShell `WScript.Shell` creates a Desktop `TradeStack.lnk` pointing at `docker-start.bat`. (Windows-only shortcut; Linux/Mac users launch `start.sh` from a terminal.)
- The existing native `start.bat` (`bun run dev`) is untouched — Docker uses `docker-start.bat` to avoid clobbering the working dev path.

## One source-code change

`backend/server.py:126` — CORS allowed origins:

```python
# before
allow_origins=["http://localhost:3000"],
# after
allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
```

Reason: a browser opened at `http://127.0.0.1:3000` is a different origin than `http://localhost:3000`. Adding `127.0.0.1` defensively prevents a surprising CORS failure on machines where the user types the IP. No trading logic touched.

## What we did NOT change

- No state-machine / scanner / indicator / live-trader logic was modified. The SOLIDIFY "non-goal: change trading behavior" rule holds.
- `data/complete.csv.gz` references (the old instrument source) are gone — the migration to `data/NSE.json.gz` happened in commit `29481c2` (Phase 8). Only the new path is referenced.
- The native `setup.ps1`/`setup.sh` path is untouched.

## Validation

**Local (this sandbox):**
- Virtualization already **enabled** (`Get-CimInstance Win32_Processor | Select-Object -ExpandProperty VirtualizationFirmwareEnabled` → `True`) → the UEFI/BIOS step is **not** needed on this machine.
- Docker Desktop itself is **not installed** in this sandbox → images cannot be built/run-tested here.
- `git status` clean except intended edits.
- `docker-compose.yml` reviewed for structure (YAML hand-verified; PyYAML not in the venv so no automated parse).
- `backend/server.py` still imports ✅ (CORS one-liner is clean — `import server` OK).
- `frontend` unaffected (no source change) — tsc/lint/vitest/build still green from commit `c7a7630`.

**On a Docker machine (to run after this commits):**
```powershell
docker compose config            # validates YAML
docker compose build             # builds both images
docker-start.bat                 # up + health poll + browser
curl http://localhost:8001/health          # → {"status":"healthy"}
# UI loads at http://localhost:3000, Navbar health dot green.
```

> Because Docker is unavailable here, the build/test gate is "authored + syntax-reviewed." The implementation agent (or the user) should run the above on the target PC. If `bun install --frozen-lockfile` fails due to lockfile drift, run `bun install` locally first to resync `bun.lock`, then rebuild.

## Files created / modified

| File | Action |
|------|--------|
| `.dockerignore` | created |
| `Dockerfile.backend` | created |
| `Dockerfile.frontend` | created |
| `docker/entrypoint.sh` | created (restores NSE.json.gz in fresh volumes) |
| `docker/backend-healthcheck.py` | created |
| `docker-compose.yml` | created (2 services, bind-mount, healthcheck, env split, image tags) |
| `docker-start.bat` | created |
| `docker-start.sh` | created |
| `docker-stop.bat` | created |
| `docker-stop.sh` | created |
| `install-shortcut.bat` | created |
| `backend/server.py` | CORS origin added (line 126) |
| `.gitignore` | reverted stray `.andromity/` line |
| `README.md` | "Run on another PC (Docker)" section added |
| `docs/SOLIDIFY_EXECUTION_CHECKLIST_20Oct26.md` | Phase 11 marked done + execution-log rows |
| `docs/steps/step23_docker_deployment_28Oct26.md` | this file |

## 🎓 Learning From This Step

| Concept | What It Is | Suggested Learning Project | Focus Area |
|---------|-----------|---------------------------|------------|
| Docker compose file-location paths | Container FS layout is fixed at build; code that resolves paths relative to `__file__` must be built so those roots land at predictable absolutes | Build a config loader that finds `config.yaml` by `__file__` traversal, then containerize it with the file in a different layer from where it's read | Distinguish build-time COPY layout vs runtime mount layout |
| Browser-vs-server env split | `NEXT_PUBLIC_*` is baked at build (browser bundle); plain env vars are server-runtime only. One wrong var breaks the other audience. | Micro-frontend that needs a feature-flag: bake the public flag at build, read the secret flag server-side | Know which vars are inlined vs which are read at request time |
| Bind-mount masking | A bind-mount replaces (masks) the entire target dir, hiding files baked into the image at that path | Bundle a `seed.sql` in `/docker-entrypoint-init-db.d/`, then mount `./db-data:/var/lib/postgresql/data` and watch it disappear — fix with an init-copy | Docker FS union vs volume/mount semantics |
| Healthcheck + depends_on | Compose `condition: service_healthy` gates service start order on an HTTP probe, not just process start | Two-container app (api + worker); make worker only start once api `/health` returns 200 | `retries`/`start_period` tuning; probe must not need extra deps (stdlib) |
| Multi-env entry points | An entrypoint script does boot-time repair (copy/restore files) then `exec "$@"` to hand off to the CMD | `docker-entrypoint.sh` for a Node app: generate an env-derived config file at startup, then `exec node server.js` | Why `exec` matters (signal handling) — never `node server.js` without exec |
