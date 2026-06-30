import path from "path";
import protobuf from "protobufjs";
import UpstoxClient from "upstox-js-sdk";
import { FeedResponse, TickData, OHLCData } from "./types";
import { BotType, createLockManager, LockManager } from "./lock";

// Pre-loaded protobuf root shared with the SDK patch below
let _sharedProtoRoot: protobuf.Root | null = null;

// Patch SDK's internal MarketDataFeederV3 prototype before any instance is created.
// The SDK's initProtobuf uses __dirname which resolves incorrectly under Turbopack.
// Instead of loading from disk, use the root we pre-loaded in init().
try {
  const { MarketDataFeederV3 } = require(
    "upstox-js-sdk/dist/feeder/MarketDataFeederV3"
  );
  MarketDataFeederV3.prototype.initProtobuf = async function () {
    this.protobufRoot = _sharedProtoRoot;
  };
} catch {}

export type TickHandler = (tick: TickData) => void;
export type StatusHandler = (status: string) => void;
export type ReconnectHandler = (attempt: number) => void;

const SDK_PROTO_PATH = path.join(
  process.cwd(), "node_modules", "upstox-js-sdk",
  "dist", "feeder", "proto", "MarketDataFeedV3.proto",
);

export class UpstoxStreamer {
  private sdkStreamer: any = null;
  private feeder: any = null;
  private accessToken: string;
  private protoRoot: protobuf.Root | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private lockManager: LockManager;

  public connected = false;
  public intentionalDisconnect = false;
  private reconnecting = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;

  public activeInstruments: Set<string> = new Set();
  public symbolMap: Map<string, string> = new Map();
  public onTick: TickHandler | null = null;
  public onStatus: StatusHandler | null = null;
  public onReconnect: ReconnectHandler | null = null;
  public onClose: (() => void) | null = null;

  constructor(accessToken: string, botType: BotType) {
    this.accessToken = accessToken;
    this.lockManager = createLockManager(botType);
  }

  async init(): Promise<void> {
    try {
      this.protoRoot = await protobuf.load(SDK_PROTO_PATH);
      _sharedProtoRoot = this.protoRoot; // Make it available to SDK's initProtobuf patch
      this.log("Protobuf loaded");
    } catch (err: any) {
      this.log(`Protobuf load failed: ${err.message}`);
    }
  }

  setSymbolMap(map: Map<string, string>): void {
    this.symbolMap = map;
  }

  updateActiveInstruments(keys: string[]): void {
    this.activeInstruments = new Set(keys);
  }

  async connect(): Promise<boolean> {
    // Acquire per-bot-type lock (reversal_bot.lock / continuation_bot.lock)
    if (!this.lockManager.acquire()) {
      this.log("Singleton lock acquisition failed - another instance is running");
      this.onStatus?.("lock_denied");
      return false;
    }

    return new Promise((resolve) => {
      try {
        const defaultClient = UpstoxClient.ApiClient.instance;
        const OAUTH2 = defaultClient.authentications["OAUTH2"];
        OAUTH2.accessToken = this.accessToken;

        const keys = Array.from(this.activeInstruments);
        this.sdkStreamer = new UpstoxClient.MarketDataStreamerV3(keys, "full");

        this.sdkStreamer.on("open", () => {
          this.connected = true;
          this.reconnectAttempts = 0;
          this.log("WebSocket opened via SDK");
          this.onStatus?.("connected");
          resolve(true);
        });

        this.sdkStreamer.on("message", (data: string) => {
          try {
            const parsed = JSON.parse(data) as FeedResponse;
            this.handleFeedResponse(parsed);
          } catch {
            // parse error
          }
        });

        this.sdkStreamer.on("error", (error: any) => {
          const msg = error?.message || String(error);
          const is403 = msg.includes("403") || msg.includes("401");
          this.log(is403 ? `Auth failed (${msg})` : `SDK error: ${msg}`);
        });

        this.sdkStreamer.on("close", () => {
          this.connected = false;
          this.log("WebSocket closed");
          this.onStatus?.("disconnected");
          this.onClose?.();
          if (!this.reconnecting && !this.intentionalDisconnect) {
            this.reconnect();
          }
        });

        this.sdkStreamer.connect();
        this.sdkStreamer.autoReconnect(false);
      } catch (err: any) {
        this.log(`Connection failed: ${err.message}`);
        resolve(false);
      }
    });
  }

  private handleFeedResponse(response: FeedResponse): void {
    if (response.type === 2) {
      this.handleMarketInfo(response);
      return;
    }

    if (!response.feeds) return;

    for (const [instrumentKey, feed] of Object.entries(response.feeds)) {
      const symbol = this.symbolMap.get(instrumentKey);
      if (!symbol) continue;

      if (feed.fullFeed?.marketFF) {
        const mff = feed.fullFeed.marketFF;
        const ltpc = mff.ltpc;
        if (ltpc && ltpc.ltp !== undefined) {
          this.onTick?.({
            instrumentKey, symbol,
            ltp: ltpc.ltp, ltt: Number(ltpc.ltt) || 0,
            ltq: ltpc.ltq || 0, cp: ltpc.cp || 0,
            atp: mff.atp, vtt: mff.vtt,
            ohlcList: mff.marketOHLC?.ohlc as OHLCData[],
            timestamp: new Date(),
          });
        }
      } else if (feed.ltpc) {
        const ltpc = feed.ltpc;
        if (ltpc.ltp !== undefined) {
          this.onTick?.({
            instrumentKey, symbol,
            ltp: ltpc.ltp, ltt: Number(ltpc.ltt) || 0,
            ltq: ltpc.ltq || 0, cp: ltpc.cp || 0,
            timestamp: new Date(),
          });
        }
      }
    }
  }

  private handleMarketInfo(response: FeedResponse): void {
    if (response.marketInfo?.segmentStatus) {
      for (const [segment, status] of Object.entries(response.marketInfo.segmentStatus)) {
        const statusMap: Record<string, string> = {
          "0": "PRE_OPEN_START", "1": "PRE_OPEN_END", "2": "NORMAL_OPEN",
          "3": "NORMAL_CLOSE", "4": "CLOSING_START", "5": "CLOSING_END",
        };
        this.log(`Market status [${segment}]: ${statusMap[String(status)] || status}`);
        this.onStatus?.(`market_${statusMap[String(status)] || status}`);
      }
    }
  }

  subscribe(): void {
    if (!this.sdkStreamer || !this.connected) return;
    const keys = Array.from(this.activeInstruments);
    if (keys.length === 0) return;
    this.sdkStreamer.subscribe(keys, "full");
    const names = keys.map(k => this.symbolMap.get(k) || k).join(", ");
    this.log(`Subscribed: ${names}`);
  }

  unsubscribe(keys: string[]): void {
    const names = keys.map(k => this.symbolMap.get(k) || k).join(", ");
    for (const key of keys) this.activeInstruments.delete(key);
    if (this.sdkStreamer && this.connected) {
      this.sdkStreamer.unsubscribe(keys);
      this.log(`Unsubscribed: ${names}`);
    }
  }

  private reconnect(): void {
    if (this.reconnecting || this.intentionalDisconnect) return;
    this.reconnecting = true;

    const attempt = () => {
      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        this.log("Max reconnection attempts reached");
        this.reconnecting = false;
        return;
      }

      if (this.intentionalDisconnect) return;

      this.reconnectAttempts++;
      const waitTime = 5 * Math.pow(2, this.reconnectAttempts - 1);
      this.onReconnect?.(this.reconnectAttempts);
      this.log(`Reconnecting (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}) in ${waitTime}s...`);

      this.reconnectTimer = setTimeout(() => {
        (async () => {
          try {
            if (await this.connect()) {
              this.reconnecting = false;
              this.log("Reconnection successful");
              this.subscribe();
            } else {
              attempt();
            }
          } catch (e: any) {
            this.log(`Reconnection error: ${e.message}`);
            this.reconnecting = false;
          }
        })();
      }, waitTime * 1000);
    };

    attempt();
  }

  disconnect(): void {
    this.intentionalDisconnect = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.sdkStreamer) this.sdkStreamer.disconnect();
    this.connected = false;
    this.reconnecting = false;
    this.lockManager.release();
  }

  private log(msg: string): void {
    const time = new Date().toLocaleTimeString("en-IN", { hour12: false });
    console.log(`[${time}] [Streamer] ${msg}`);
    (globalThis as any).__addLiveLog?.(`[Streamer] ${msg}`);
  }
}
