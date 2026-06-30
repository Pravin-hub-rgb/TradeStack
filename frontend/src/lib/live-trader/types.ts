export enum StockStateEnum {
  INITIALIZED = "initialized",
  WAITING_FOR_OPEN = "waiting_for_open",
  GAP_VALIDATED = "gap_validated",
  QUALIFIED = "qualified",
  SELECTED = "selected",
  WAITING_FOR_ENTRY = "waiting_for_entry",
  ENTERED = "entered",
  NOT_SELECTED = "not_selected",
  REJECTED = "rejected",
  UNSUBSCRIBED = "unsubscribed",
  EXITED = "exited",
}

export type ReversalSituation = "reversal_s1" | "reversal_s2";
export type ContinuationSituation = "continuation";

export interface TickData {
  instrumentKey: string;
  symbol: string;
  ltp: number;
  ltt: number;
  ltq: number;
  cp: number;
  atp?: number;
  vtt?: number;
  ohlcList?: OHLCData[];
  timestamp: Date;
}

export interface OHLCData {
  interval: string;
  open: number;
  high: number;
  low: number;
  close: number;
  vol: number;
  ts: number;
}

export interface StockInfo {
  symbol: string;
  instrumentKey: string;
  previousClose: number;
  situation: string;
  openPrice: number | null;
  currentPrice: number | null;
  dailyHigh: number;
  dailyLow: number;
  state: StockStateEnum;
  isActive: boolean;
  gapValidated: boolean;
  lowViolationChecked: boolean;
  entryReady: boolean;
  entered: boolean;
  entryHigh: number | null;
  entrySl: number | null;
  entryPrice: number | null;
  exitPrice: number | null;
  pnl: number | null;
  rejectionReason: string | null;
  vahPrice: number | null;
  volumeBaseline: number;
  earlyVolume: number;
  cumulativeVolume: number;
  gapPct: number | null;
}

export interface Position {
  symbol: string;
  instrumentKey: string;
  entryPrice: number;
  entryTime: Date;
  entryHigh: number;
  stopLoss: number;
}

export interface Trade {
  id: string;
  symbol: string;
  instrumentKey: string;
  entryPrice: number | null;
  entryTime: Date | null;
  quantity: number;
  side: string;
  sessionId: string;
  pnl: number | null;
  exitPrice?: number;
  exitTime?: Date;
  entryHigh?: number;
  entrySl?: number;
  exitReason?: string;
  rejectionReason?: string;
  tradeType?: string;
}

export interface SessionStats {
  sessionId: string;
  totalTrades: number;
  completedTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  totalPnl: number;
  averagePnl: number;
  maxWin: number;
  maxLoss: number;
  capital: number;
  initialCapital: number;
}

export interface FeedResponse {
  type: number;
  feeds: Record<string, Feed>;
  currentTs: string;
  marketInfo?: {
    segmentStatus?: Record<string, number>;
  };
}

export interface Feed {
  fullFeed?: FullFeed;
  ltpc?: LTPC;
  requestMode?: number;
}

export interface FullFeed {
  marketFF?: MarketFullFeed;
  indexFF?: IndexFullFeed;
}

export interface MarketFullFeed {
  ltpc?: LTPC;
  marketOHLC?: { ohlc?: OHLCData[] };
  atp?: number;
  vtt?: number;
}

export interface IndexFullFeed {
  ltpc?: LTPC;
}

export interface LTPC {
  ltp?: number;
  ltt?: number | string;
  ltq?: number;
  cp?: number;
}

export interface LiveTraderConfig {
  accessToken: string;
  marketOpen: string;
  marketOpenTime: Date;
  marketCloseTime: Date;
  windowLength: number;
  entryTime: string;
  prepStart: string;
  maxPositions: number;
  capital: number;
  quantity: number;
  entrySlPct: number;
  lowViolationPct: number;
  flatGapThreshold: number;
  trailingSlThreshold: number;
  svroMinVolumeRatio: number;
  gapUpMaxPct: number;
  paperTrading: boolean;
  riskPerTrade: number;
}

export interface ScannerStock {
  symbol: string;
  instrumentKey?: string;
  previousClose: number;
  situation: string;
  declinePercent?: number;
  declineDays?: number;
  gapPct?: number;
  lowViolationPct?: number;
  adrPct?: number;
}

export interface ScannerResult {
  reversal: {
    stocks: ScannerStock[];
    declinePercent: number;
    declineDaysMax: number;
  } | null;
  continuation: {
    stocks: ScannerStock[];
  } | null;
}
