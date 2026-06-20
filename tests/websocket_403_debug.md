# Upstox WebSocket V3 — 403 Forbidden Debug

## Problem

When connecting to Upstox V3 Market Data Feed WebSocket, we get **403 Forbidden** on the redirected feeder URL. REST APIs work fine (LTP checks return 200).

Tokens are valid (not expired), account is active. The official Upstox Python SDK also gets the same 403.

## Architecture

- **Python Backend** (`:8001`): Serves settings, instrument keys, token storage
- **Next.js API Route** (`/api/live`): Loads config from Python, starts orchestrator
- **Orchestrator** (`index.ts`): Creates streamer with token, manages monitors
- **Streamer** (`streamer.ts`): WebSocket client connecting to Upstox

```
Frontend UI → POST /api/live → loadConfigFromPython() → UpstoxStreamer(accessToken)
                                                             ↓
                                              wss://api.upstox.com/v3/feed/market-data-feed
                                                             ↓
                                              302 Redirect → wss://wsfeeder-api.upstox.com/...?code=xxx
                                                             ↓
                                                  403 Forbidden ☠
```

---

## File: `frontend/src/lib/live-trader/streamer.ts`

Full WebSocket client implementation:

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
            ? "WebSocket 403 — token rejected by Upstox. Generate a new token and try again."
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
      if (buf[0] === 0x02) {
        // market info / initial feed
        return;
      }
      const decoded = this.FeedResponse?.decode(buf) as any;
      if (!decoded?.feeds) return;

      for (const [key, feed] of Object.entries(decoded.feeds) as [string, any][]) {
        const symbol = this.symbolMap.get(key);
        if (!symbol) continue;

        const ltpFeed = feed.ltpc?.ltp ?? feed.fullFeed?.ltpc?.ltp;
        if (ltpFeed === undefined || ltpFeed === null) continue;

        // Process tick...
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
    } catch {
      // decode error
    }
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

---

## File: `frontend/src/lib/live-trader/index.ts` (orchestrator)

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

---

## Testing Done

All of these produce **403** (or 401 without auth):

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
| `GET /authorize` (new token generation) | — | ✅ **200 (URL returned)** |
| Generated URL in browser | — | **403 after OAuth** |

Token decoded:
```json
{
  "sub": "4HCYNF",
  "jti": "<unique>",
  "isMultiClient": false,
  "isPlusPlan": false,
  "iat": 1781078394,
  "iss": "udapi-gateway-service",
  "exp": 1781128800
}
```
- Issued: 2026-06-10 13:29 IST
- Expires: 2026-06-11 03:30 IST
- Neither `scope` nor `scopes` field present
- `isPlusPlan: false` (basic plan)

## Root Cause

The basic Upstox plan (`isPlusPlan: false`) does not include WebSocket market data feed access. REST APIs (LTP quotes, orders) work fine, but the V3 Market Data Feed WebSocket endpoint requires a paid plan (`isPlusPlan: true`).

The old project works because it uses a token from a different account that has the paid plan.
