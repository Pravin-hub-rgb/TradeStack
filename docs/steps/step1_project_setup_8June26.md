# Step 1: Project Setup
## Date: 8 June 2026

---

## What We Did

We created the **TradeStack** project — the rebuild of the original MA Stock Trader using the tri-partite architecture: **Next.js (Frontend + Live Trader) + Python (Data Microservice)**.

In this step, we set up the entire project scaffold:

1. Created the folder structure
2. Initialized a Next.js project with TypeScript, Tailwind, and App Router using `bun`
3. Set up a Python FastAPI backend with virtual environment
4. Installed core dependencies (pandas, numpy, uvicorn)
5. Created root-level auto-launch with `concurrently`
6. Copied the architecture and roadmap reference docs

---

## Why This Architecture

The original project had 200+ hardcoded configuration values spread across 30+ files, with the scanner (pandas, CPU-heavy) and WebSocket tick processing (live) competing for the same Python GIL. The new architecture splits responsibilities:

| Component | Language | Job |
|-----------|----------|-----|
| **Next.js Frontend** | TypeScript | UI, settings panel, dashboards |
| **Node.js Live Trader** | TypeScript | WebSocket, tick processing, state machines |
| **Python Data Microservice** | Python | Scanner, bhavcopy, VAH, breadth |

They share a SQLite database for settings and trade logs.

---

## Folder Structure Created

```
C:\Users\Pravin\Desktop\main\MA_Stock_Trader_NA\
├── docs/
│   ├── steps/
│   │   └── step1_project_setup_8June26.md    ← This file
│   ├── NEXTJS_PYTHON_ARCHITECTURE_8June26.md  ← Architecture decision doc
│   └── REBUILD_FROM_SCRATCH_ROADMAP_V2_8June26.md ← Full rebuild plan
├── frontend/         ← Next.js 16.2.7 (created with bun)
│   ├── src/app/      ← App Router pages
│   ├── package.json
│   └── ...
├── backend/          ← Python FastAPI
│   ├── server.py     ← FastAPI entry point with health check
│   ├── venv/         ← Python virtual environment
│   └── ...
├── data/             ← Shared runtime data (DB, cache, logs)
└── package.json      ← Root scripts with concurrently
```

---

## Commands Used

### 1. Create folders
```powershell
New-Item -ItemType Directory -Path "MA_Stock_Trader_NA\docs\steps" -Force
New-Item -ItemType Directory -Path "MA_Stock_Trader_NA\frontend" -Force
New-Item -ItemType Directory -Path "MA_Stock_Trader_NA\backend" -Force
New-Item -ItemType Directory -Path "MA_Stock_Trader_NA\data" -Force
```

### 2. Initialize Next.js with bun
```powershell
cd MA_Stock_Trader_NA\frontend
bun create next-app@latest . --typescript --tailwind --eslint --app --src-dir --no-import-alias --use-bun
```

### 3. Set up Python virtual environment
```powershell
cd MA_Stock_Trader_NA\backend
python -m venv venv
.\venv\Scripts\pip install fastapi uvicorn pandas numpy python-multipart
```

### 4. Create `backend/server.py`
```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="TradeStack", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def root():
    return {"status": "ok", "service": "TradeStack"}

@app.get("/health")
def health():
    return {"status": "healthy"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="127.0.0.1", port=8001, reload=True)
```

### 5. Create root `package.json` with auto-launch
```json
{
  "name": "tradestack",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "concurrently -n next,py -c cyan,green \"bun run dev:next\" \"bun run dev:py\"",
    "dev:next": "cd frontend && bun run dev",
    "dev:py": "cd backend && .\\venv\\Scripts\\python server.py",
    "build:next": "cd frontend && bun run build"
  },
  "devDependencies": {
    "concurrently": "^9.0.0"
  }
}
```

### 6. Install concurrently
```powershell
cd MA_Stock_Trader_NA
bun install
```

---

## Verification

Run this from the `MA_Stock_Trader_NA` folder:

```powershell
bun run dev
```

You should see two processes in the terminal:
- `[next]` — Next.js dev server on http://localhost:3000
- `[py]` — Python FastAPI on http://localhost:8001

Check the health endpoint:
```powershell
curl http://localhost:8001/health
# Response: {"status":"healthy"}
```

---

## 🎓 Learning From This Step

| Concept Used | What It Is | Suggested Learning Project | Focus Area |
|---|---|---|---|
| **Bun** | JavaScript package manager + runtime, faster than npm. Built-in bundler, test runner, and script runner. | Create a small CLI tool that reads a CSV file and prints stats to console | Package management, `bun run` scripts, bun's built-in APIs |
| **Next.js App Router** | React framework for production apps. App Router uses `app/` folder with file-based routing, layout nesting, and server components. | Build a 3-page info site: Home, About, Contact — with a shared layout and navigation | `page.tsx`, `layout.tsx`, file routing, links |
| **TypeScript** | JavaScript with types. Catches bugs at compile time instead of runtime. | Rewrite a simple JS function to TS: add type annotations to parameters, return types, interfaces | Basic types, interfaces, type annotations |
| **Tailwind CSS** | Utility-first CSS framework. You compose styles using class names instead of writing custom CSS. | Style the 3-page info site using Tailwind classes — colors, spacing, responsive | Utility classes, responsive breakpoints, dark mode |
| **FastAPI** | Modern Python web framework for building APIs. Auto-generates OpenAPI docs, validates request/response with Pydantic, supports async. | Build a Calculator API: 4 endpoints (add, subtract, multiply, divide) with path/query params | GET/POST endpoints, path params, query params, auto docs at `/docs` |
| **Uvicorn** | ASGI server that runs FastAPI. Handles HTTP requests and serves the app. | — (no separate project needed — it's just the server runner) | — |
| **Pydantic** | Python library for data validation using type annotations. FastAPI uses it for request/response models. | Add request body validation to the Calculator API using Pydantic BaseModel models | BaseModel, field types, validation |
| **concurrently** | Node.js package that runs multiple commands in a single terminal with color-coded output. | — (no separate project needed — the concept is straightforward) | — |

---

## Next Step

Proceed to Step 2: FastAPI Scanner Endpoints — where we build the first scanner API route that uses pandas to analyze stock data from the cache.
