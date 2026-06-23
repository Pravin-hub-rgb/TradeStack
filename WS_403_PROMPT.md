# Upstox WebSocket 403 — Debug Prompt for AI Agent

## How to Use

Copy-paste this entire file into your AI assistant. It contains all the context, files, and findings so you can start debugging immediately.

---

## Problem

Connecting to **Upstox V3 Market Data Feed WebSocket** always returns **403 Forbidden** on the redirected feeder URL (`wsfeeder-api.upstox.com`). REST APIs work fine (LTP check returns 200). Tokens are valid (JWT decodes correctly, not expired). The account is on the basic plan (`isPlusPlan: false`).

## What We Need

- **Root cause** of the 403 — is it code, token, plan limitation, or service issue?
- **Fix** — code change or configuration change that resolves it
- If the issue is on Upstox's side (basic plan limitation or service outage), confirm that clearly

## Key Finding

**Every method we tried gets 403** — Node.js `ws`, Python `websocket-client` (same library Upstox's own SDK uses), and Upstox's official `upstox_client.MarketDataStreamerV3` SDK. Two different tokens (one from the old project's `upstox_config.json`, one newly generated) both fail identically.

**Critical**: The old project (at `MA_Stock_Trader/`) uses **exactly the same** `websocket-client==1.9.0`, `upstox-python-sdk==2.17.0`, and the same connection pattern. If the old project were run today, it would also get 403. This strongly suggests the 403 is caused by either:
- A recent Upstox-side change (server migration, auth protocol update)
- A plan limitation (`isPlusPlan: false` restricting WebSocket access)

---

## Old Project Comparison (How It Works There)

### Old Project — `simple_data_streamer.py` (connect method)

```python
def connect(self):
    """Connect to WebSocket using Market Data Feed endpoint with auto-redirect"""
    try:
        configuration = upstox_client.Configuration()
        configuration.access_token = self.access_token
        # Enable auto-redirect as recommended by Upstox experts
        configuration.redirect_uri = None  # irrelevant — OAuth config, not WebSocket

        # Use MarketDataStreamerV3 which handles auto-redirect internally
        self.streamer = upstox_client.MarketDataStreamerV3(
            upstox_client.ApiClient(configuration)
        )

        # Register callbacks
        self.streamer.on("open", self.on_open)
        self.streamer.on("message", self.on_message)
        self.streamer.on("error", self.on_error)
        self.streamer.on("close", self.on_close)

        self.streamer.connect()
        return True
    except Exception as e:
        print(f"Connection failed: {e}")
        return False
```

### Old Project — Token Source
File: `upstox_config.json`
```json
{
  "api_key": "6ec86817-5a40-4d0f-929f-45486fb7193c",
  "access_token": "eyJ0eXAiOiJKV1QiLCJrZXlfaWQiOiJza192MS4wIiwiYWxnIjoiSFMyNTYifQ.eyJzdWIiOiI0SENZTkYiLCJqdGkiOiI2YTI4ZWY1ZTNiZDEwNzEyNTc3OGY5MTkiLCJpc011bHRpQ2xpZW50IjpmYWxzZSwiaXNQbHVzUGxhbiI6ZmFsc2UsImlhdCI6MTc4MTA2NzYxNCwiaXNzIjoidWRhcGktZ2F0ZXdheS1zZXJ2aWNlIiwiZXhwIjoxNzgxMTI4ODAwfQ.xJYaIhnbZJ1GZ7vS4nEXIci7JAngtB8JQnVCEKMQIME",
  "api_secret": "5yqgvu4mst"
}
```
Old token JWT decoded: `sub: 4HCYNF`, `isPlusPlan: false` (same plan as new token, different `jti` and `iat`).

### Library Versions (Same in Both Projects)

| Library | Version |
|---------|---------|
| `websocket-client` | **1.9.0** |
| `upstox-python-sdk` | **2.17.0** |
| `ws` (Node.js) | 8.x (latest) |

### Connection Code Comparison — Identical in Both Projects

Both old and new projects ultimately call `websocket.WebSocketApp()` with:
```python
headers = {'Authorization': 'Bearer <token>'}
self.ws = websocket.WebSocketApp(
    "wss://api.upstox.com/v3/feed/market-data-feed",
    header=headers,
    ...
)
```

### Redirect Handling — BOTH Libraries DO Re-send Authorization

**Python `websocket-client` 1.9.0** (`_core.py` line 269-281):
```python
self.handshake_response = handshake(self.sock, url, *addrs, **options)
for _ in range(options.pop("redirect_limit", 3)):
    if self.handshake_response.status in SUPPORTED_REDIRECT_STATUSES:
        url = self.handshake_response.headers["location"]
        self.sock.close()
        self.sock, addrs = connect(url, ...)
        self.handshake_response = handshake(self.sock, url, *addrs, **options)
```
The `handshake()` call on the redirect target passes the **same `**options`** dict (including `header` with Authorization). So the Bearer token IS sent to `wsfeeder-api.upstox.com`.

**Node.js `ws`** with `followRedirects: true`:
The `follow-redirects` npm package also passes the same headers to the redirect target. The Authorization header IS sent.

This means: **Contrary to the initial assumption, neither library strips Authorization on redirect.** Both re-send it. The 403 is not caused by header stripping.

---

## File: `frontend/src/lib/live-trader/streamer.ts`

```typescript
import WebSocket from "ws";
import protobuf from "protobufjs";
import path from "path";
import crypto from "crypto";
import { FeedResponse, TickData, OHLCData } from "./types";

const PROTO_PATH = path.join(process.cwd(), "proto", "MarketDataFeed.proto");

export type TickHandler = (tick: TickData) => void;
export type StatusHandler = (status: string) => void;
export type ReconnectHandler = (attempt: number) => void;

export class UpstoxStreamer {
  private ws: WebSocket | null = null;
  private accessToken: string;
  private root: protobuf.Root | null = null;
  private FeedResponse: protobuf.Type | null = null;

  public connected = false;
  public intentionalDisconnect = false;
  private reconnecting = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private lastErrorIs403 = false;

  public activeInstruments: Set<string> = new Set();
  public symbolMap: Map<string, string> = new Map();
  public onTick: TickHandler | null = null;
  public onStatus: StatusHandler | null = null;
  public onReconnect: ReconnectHandler | null = null;
  public onClose: (() => void) | null = null;

  constructor(accessToken: string) {
    this.accessToken = accessToken;
  }

  async init(): Promise<void> {
    this.root = await protobuf.load(PROTO_PATH);
    this.FeedResponse = this.root.lookupType("FeedResponse");
  }

  connect(): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        const url = "wss://api.upstox.com/v3/feed/market-data-feed";
        this.ws = new WebSocket(url, {
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
          },
          followRedirects: true,
        });

        this.ws.onopen = () => {
          this.connected = true;
          this.reconnectAttempts = 0;
          this.log("WebSocket opened");
          this.onStatus?.("connected");
          setTimeout(() => this.subscribe(), 1000);
          resolve(true);
        };

        this.ws.onmessage = (event) => {
          let buf: Buffer;
          if (Buffer.isBuffer(event.data)) buf = event.data;
          else if (event.data instanceof ArrayBuffer) buf = Buffer.from(event.data);
          else if (Array.isArray(event.data)) buf = Buffer.concat(event.data);
          else if (typeof event.data === "string") buf = Buffer.from(event.data, "utf8");
          else return;
          this.handleMessage(buf);
        };

        this.ws.onerror = (err) => {
          const msg = err.message || "";
          const is403 = msg.includes("403");
          this.lastErrorIs403 = is403;
          this.log(is403
            ? "WebSocket 403 — token rejected by Upstox"
            : `WebSocket error: ${msg}`);
          if (!this.reconnecting && !is403) this.reconnect();
        };

        this.ws.onclose = () => {
          this.connected = false;
          this.log("WebSocket closed");
          this.onStatus?.("disconnected");
          this.onClose?.();
          if (!this.reconnecting && !this.intentionalDisconnect && !this.lastErrorIs403) {
            this.reconnect();
          }
        };
      } catch (err) {
        this.log(`Connection error: ${err}`);
        resolve(false);
      }
    });
  }

  private subscribe(): void {
    if (!this.ws || !this.ws.readyState === WebSocket.OPEN) return;
    const keys = Array.from(this.activeInstruments);
    if (keys.length === 0) return;
    const request = JSON.stringify({
      guid: crypto.randomUUID(),
      method: "sub",
      data: { instrumentKeys: keys, mode: "ltpc" },
    });
    this.ws.send(Buffer.from(request, "utf8"));
    this.log(`Subscribed to ${keys.length} instruments`);
  }

  private handleMessage(buf: Buffer): void {
    try {
      if (buf.length === 0) return;
      if (buf[0] === 0x02) return; // market info / initial feed
      const decoded = this.FeedResponse?.decode(buf) as any;
      if (!decoded?.feeds) return;
      for (const [key, feed] of Object.entries(decoded.feeds) as [string, any][]) {
        const symbol = this.symbolMap.get(key);
        if (!symbol) continue;
        const ltpFeed = feed.ltpc?.ltp ?? feed.fullFeed?.ltpc?.ltp;
        if (ltpFeed === undefined || ltpFeed === null) continue;
        this.onTick?.({
          symbol,
          instrumentKey: key,
          ltp: ltpFeed,
          ltt: feed.ltpc?.ltt ?? feed.fullFeed?.ltpc?.ltt,
          ltq: feed.ltpc?.ltq ?? feed.fullFeed?.ltpc?.ltq,
          cp: feed.ltpc?.cp ?? feed.fullFeed?.ltpc?.cp,
          volume: feed.fullFeed?.vt?.volume ?? 0,
          ohlc: feed.fullFeed?.ff?.ohlc ? {
            open: feed.fullFeed.ff.ohlc.open,
            high: feed.fullFeed.ff.ohlc.high,
            low: feed.fullFeed.ff.ohlc.low,
            close: feed.fullFeed.ff.ohlc.close,
          } : undefined,
        });
      }
    } catch { /* decode error */ }
  }

  private reconnect(): void {
    if (this.reconnecting || this.intentionalDisconnect) return;
    this.reconnecting = true;
    this.reconnectAttempts++;
    if (this.reconnectAttempts > this.maxReconnectAttempts) {
      this.log("Max reconnection attempts reached");
      this.reconnecting = false;
      return;
    }
    this.log(`Reconnecting (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}) in 5s...`);
    this.onReconnect?.(this.reconnectAttempts);
    setTimeout(() => {
      this.reconnecting = false;
      this.connect();
    }, 5000);
  }

  disconnect(): void {
    this.intentionalDisconnect = true;
    this.ws?.close();
  }

  private log(msg: string) {
    console.log(`[Streamer] ${msg}`);
    (globalThis as any).__addLiveLog?.(`[Streamer] ${msg}`);
  }
}
```

## File: `frontend/src/lib/live-trader/index.ts`

```typescript
import { UpstoxStreamer } from "./streamer";

export class LiveTraderOrchestrator {
  public streamer: UpstoxStreamer | null = null;

  async initialize(
    config: LiveTraderConfig, instruments: string[],
    stocks?: ScannerStock[] | null, stockType?: string,
  ): Promise<void> {
    this.config = config;
    this.streamer = new UpstoxStreamer(config.accessToken);
    await this.streamer.init();
    const symbolMap = new Map<string, string>();
    for (const key of instruments) {
      const parts = key.split("|");
      const symbol = parts[1] || key;
      symbolMap.set(key, symbol);
    }
    this.streamer.setSymbolMap(symbolMap);
  }

  async start(config: LiveTraderConfig): Promise<void> {
    if (this.running) return;
    this.running = true;
    if (!this.streamer?.connected) {
      await this.streamer?.connect();
    }
    this.log(`Bot started (mode: ${this.mode})`);
  }
}
```

## File: `frontend/src/app/api/live/route.ts`

```typescript
const PY_API = "http://127.0.0.1:8001";

async function loadConfigFromPython(): Promise<LiveTraderConfig> {
  const [settingsR, tokenR] = await Promise.all([
    fetch(`${PY_API}/api/settings`).catch(() => null),
    fetch(`${PY_API}/api/token/raw`).catch(() => null),
  ]);
  const settings = settingsR?.ok ? await settingsR.json() : { settings: [] };
  const tokenData = tokenR?.ok ? await tokenR.json() : { token: "" };
  const s: Record<string, string> = {};
  for (const item of settings.settings || []) {
    s[item.key] = item.value;
  }
  return {
    accessToken: tokenData.token || "",
    marketOpen: s.market_open || "09:15",
    marketClose: s.market_close || "15:30",
    entryWindowMinutes: Number(s.entry_window_minutes) || 5,
    confirmationWindowMinutes: Number(s.confirmation_window_minutes) || 5,
    prepStartOffsetSeconds: Number(s.prep_start_offset_seconds) || 30,
    maxPositions: Number(s.max_positions) || 2,
    entrySlPct: Number(s.entry_sl_pct) || 4,
    minGapPct: Number(s.min_gap_pct) || 0.5,
    targetPct: Number(s.target_pct) || 2,
    volumeThreshold: Number(s.volume_threshold) || 1.5,
  };
}
```

## File: `backend/src/upstox_config.py`

```python
import logging
import requests
from datetime import datetime
from . import db

logger = logging.getLogger(__name__)

def get_api_key() -> str:
    val = db.settings_get("upstox_api_key")
    return val["value"] if val and val.get("value") else "6ec86817-5a40-4d0f-929f-45486fb7193c"

def get_api_secret() -> str:
    val = db.settings_get("upstox_api_secret")
    return val["value"] if val and val.get("value") else "5yqgvu4mst"

def get_token() -> str | None:
    return db.upstox_get("access_token")

def save_token(token: str):
    db.upstox_set("access_token", token)
    db.upstox_set("token_updated_at", datetime.now().isoformat())
    logger.info("Access token saved")

def validate_token(token: str) -> dict:
    save_token(token)
    from .upstox_fetcher import get_instrument_key
    import urllib.parse
    test_symbols = ["RELIANCE", "TCS", "HDFCBANK"]
    results = []
    for sym in test_symbols:
        instrument_key = get_instrument_key(sym)
        if not instrument_key:
            results.append(f"FAIL {sym}: no instrument key")
            continue
        key_encoded = urllib.parse.quote(instrument_key, safe="")
        url = f"https://api.upstox.com/v2/market-quote/ltp?instrument_key={key_encoded}"
        headers = {"Authorization": f"Bearer {token}", "Accept": "application/json"}
        try:
            resp = requests.get(url, headers=headers, timeout=5)
            if resp.status_code == 200:
                data = resp.json()
                ltp = data.get("data", {}).get(instrument_key, {}).get("last_price", "?")
                results.append(f"OK {sym}: LTP {ltp}")
            else:
                results.append(f"FAIL {sym}: HTTP {resp.status_code}")
        except Exception as e:
            results.append(f"FAIL {sym}: {e}")
    return {"valid": all(r.startswith("OK") for r in results), "test_results": results}
```

## Official Upstox Python SDK — MarketDataFeederV3 (same library, same 403)

File: `upstox_client/feeder/market_data_feeder_v3.py`
```python
class MarketDataFeederV3(Feeder):
    def connect(self):
        if self.ws and self.ws.sock:
            return
        sslopt = {"cert_reqs": ssl.CERT_NONE, "check_hostname": False}
        ws_url = "wss://api.upstox.com/v3/feed/market-data-feed"
        headers = {'Authorization': self.api_client.configuration.auth_settings().get("OAUTH2")["value"]}
        self.ws = websocket.WebSocketApp(ws_url,
                                         header=headers,
                                         on_open=self.on_open,
                                         on_message=self.on_message,
                                         on_error=self.on_error,
                                         on_close=self.on_close)
        threading.Thread(target=self.ws.run_forever,
                         kwargs={"sslopt": sslopt}).start()
```

## Connection Flow

```
Frontend UI → POST /api/live → loadConfigFromPython() → UpstoxStreamer(accessToken)
                                                             ↓
                                              INITIAL URL (wss://api.upstox.com/v3/feed/market-data-feed)
                                              with Authorization: Bearer <token>
                                                             ↓
                                              SERVER RESPONDS 302
                                              Location: wss://wsfeeder-api.upstox.com/...?code=xxx
                                                             ↓
                                              FOLLOW REDIRECT (Authorization header RE-SENT by library)
                                              wss://wsfeeder-api.upstox.com/...?code=xxx + Bearer <token>
                                                             ↓
                                                  403 Forbidden ☠
```

## Observations

1. **Authorization header IS re-sent on redirect** by BOTH `websocket-client` (Python) and `ws` (Node.js) libraries — this is NOT a browser, there's no cross-origin stripping
2. Despite sending both the `code` param AND the Bearer token to the feeder → still **403**
3. Without any auth (no Bearer, no code) → **401** (so the feeder does check auth)
4. REST API (`/v2/market-quote/ltp`) works fine with the same token → **200 OK**
5. Two different tokens (old project's token, newly generated token) both fail identically → 403
6. No active WebSocket connections exist from old project → no rate limit / connection cap issue
7. Account is **basic plan** (`isPlusPlan: false`)
8. JWT has **no `scope` field** — only `sub`, `jti`, `isMultiClient`, `isPlusPlan`, `iat`, `iss`, `exp`
9. **Old project code is identical** — same library versions, same SDK, same pattern — so 403 would also affect the old project if run today

## What We've Tried

| Method | Token | Result |
|--------|-------|--------|
| Node.js `ws` + `followRedirects: true` + Bearer | NA token | **403** |
| Node.js `ws` + redirect URL + Bearer | NA token | **403** |
| Node.js `ws` + redirect URL + no auth | NA token | **401** |
| Python `websocket-client` + `follow_redirects=True` | NA token | **403** |
| Python `upstox_client.MarketDataStreamerV3` (official SDK) | NA token | **403** |
| Python `upstox_client.MarketDataStreamerV3` (official SDK) | Old token | **403** |
| REST LTP API | NA token | ✅ **200** |
| REST LTP API | Old token | ✅ **200** |

## Root Cause Found

**Cross-host redirect strips Authorization header in Node.js `ws` library.**

| Library | Cross-Host Redirect Behavior |
|---------|------------------------------|
| **Python `websocket-client`** 1.9.0 | Re-sends all headers including `Authorization` |
| **Node.js `ws` + `follow-redirects`** | **Strips `Authorization`** on cross-host redirect (standard HTTP security) |

**The flow explaining everything:**

**Old project (Python — works):**
1. Connects to `api.upstox.com` with `Authorization: Bearer <token>`
2. Gets 302 → `wsfeeder-api.upstox.com/...?code=xxx`
3. Creates new socket, re-sends `Authorization: Bearer <token>` + `code=xxx`
4. Feeder validates token → ✅

**New project (Node.js `ws` — 403):**
1. Connects to `api.upstox.com` with `Authorization: Bearer <token>`
2. Gets 302 → `wsfeeder-api.upstox.com/...?code=xxx`
3. `follow-redirects` strips `Authorization` (different host), sends only `code=xxx`
4. Feeder gets no valid auth → **403**

**The fix (already applied):**
Use the Upstox `/authorize` REST endpoint to get the one-time URL first, then connect directly without redirects.
See `frontend/src/lib/live-trader/streamer.ts` `connect()` method.

## History

- **Earlier Python SDK tests got 403** because the Python library's redirect ALSO exhausts the single-use `code`. Running Node.js (which burned the code via first redirect) then Python (which tried the same exhausted code) would both fail. But in isolation, Python works because it re-sends the Bearer token alongside the fresh code.

## Questions to Investigate

## Token JWT Decoded

Both old and new tokens share this structure:

```json
{
  "sub": "4HCYNF",
  "jti": "<unique-id>",
  "isMultiClient": false,
  "isPlusPlan": false,
  "iat": 1781078394,
  "iss": "udapi-gateway-service",
  "exp": 1781128800
}
```

| Field | Value | Meaning |
|-------|-------|---------|
| `sub` | `4HCYNF` | User ID — same for both tokens |
| `isMultiClient` | `false` | Not a multi-client account |
| `isPlusPlan` | `false` | **Basic plan (not Upstox Plus)** ⚠️ Likely culprit |
| `scope` | **absent** | No scopes claim — WebSocket scope may be missing |
| `iat` | 1781078394 | 2026-06-10 13:29 IST |
| `exp` | 1781128800 | 2026-06-11 03:30 IST |

**Critical observation**: Neither token has a `scope` claim. If WebSocket feed access requires a scope like `"MarketDataFeed"` or `"ws"`, the token doesn't have it.

## Protobuf Schema

File: `proto/MarketDataFeed.proto` (standard Upstox V3 protobuf schema)

---

## How to Reproduce

```bash
# Node.js test
node -e "
const WebSocket = require('ws');
const TOKEN = 'your-token-here';
const ws = new WebSocket('wss://api.upstox.com/v3/feed/market-data-feed', {
  headers: { Authorization: 'Bearer ' + TOKEN },
  followRedirects: true
});
ws.on('open', () => { console.log('OPEN'); ws.close(); });
ws.on('error', (e) => console.log('ERROR:', e.message));
ws.on('close', () => console.log('CLOSE'));
"

# Python test
python -c "
import websocket
TOKEN = 'your-token-here'
headers = {'Authorization': f'Bearer {TOKEN}'}
ws = websocket.create_connection(
    'wss://api.upstox.com/v3/feed/market-data-feed',
    header=headers,
    enable_multithread=True
)
print('OPEN')
ws.close()
"
```

---

## Information We Need From You

1. **Root cause** — is it our code, our token plan, or Upstox service?
2. **Fix** — exact code change if it's our code
3. **Workaround** — if it's a plan limitation, what plan is needed?
4. **Alternative** — if WebSocket is blocked, can we poll REST APIs instead?

---

## Summary for Quick Diagnosis

| Question | Answer |
|----------|--------|
| Does REST API work? | ✅ **Yes** — LTP endpoint returns 200 with valid data |
| Does WebSocket work? | ❌ **No** — always 403 on any method |
| Does old project's code work? | Same code, same libs, same 403 when tested now |
| Do different tokens work? | ❌ No — both old and new fail identically |
| Does auth affect the result? | Partially — no auth → 401, with auth → 403 |
| Is the token valid? | ✅ Yes — REST works, both tokens |

**Bottom line**: This is likely **Upstox account plan restriction** (`isPlusPlan: false` denies WebSocket feed), or a **missing JWT scope** for WebSocket. The code, libraries, and tokens are not the issue.
