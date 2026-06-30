import { StockStateEnum } from "../types";

export interface ContinuationStateMachineParams {
  flatGapThreshold: number;
  entrySlPct: number;
  lowViolationPct: number;
  trailingSlThreshold: number;
  gapUpMaxPct: number;
  entryTime?: string;
}

function parseTime(t: string): number {
  const parts = t.split(":");
  return parseInt(parts[0]) * 60 + parseInt(parts[1]);
}

export class ContinuationStateMachine {
  public state: StockStateEnum = StockStateEnum.INITIALIZED;
  public isSubscribed = true;
  public symbol = "";
  public openPrice: number | null = null;
  public previousClose = 0;
  public dailyLow = Infinity;
  public dailyHigh = -Infinity;
  public situation = "continuation";
  public gapValidated = false;
  public lowViolationChecked = false;
  public volumeValidated = false;
  public entryReady = false;
  public entered = false;
  public isActive = true;
  public entryHigh: number | null = null;
  public entrySl: number | null = null;
  public entryPrice: number | null = null;
  public entryTime: Date | null = null;
  public exitPrice: number | null = null;
  public exitTime: Date | null = null;
  public pnl: number | null = null;
  public rejectionReason: string | null = null;

  public earlyVolume = 0;
  public volumeBaseline = 0;
  public vahPrice: number | null = null;
  public gapPct: number | null = null;
  public cumulativeVolume = 0;
  params: ContinuationStateMachineParams;

  constructor(params: ContinuationStateMachineParams) {
    this.params = params;
  }

  transitionTo(newState: StockStateEnum, reason = ""): void {
    const old = this.state;
    this.state = newState;
    const msg = `[${this.symbol}] State: ${old} → ${newState}${reason ? ` (${reason})` : ""}`;
    console.log(msg);
  }

  reject(reason: string): void {
    this.isActive = false;
    this.isSubscribed = false;
    this.rejectionReason = reason;
    this.transitionTo(StockStateEnum.REJECTED, reason);
  }

  validateGap(): boolean {
    if (this.openPrice === null) return false;
    const gapPct = (this.openPrice - this.previousClose) / this.previousClose;
    this.gapPct = gapPct;
    const { flatGapThreshold } = this.params;

    if (Math.abs(gapPct) <= flatGapThreshold) {
      this.reject(`Gap too flat: ${(gapPct * 100).toFixed(1)}%`);
      return false;
    }
    if (gapPct <= flatGapThreshold) {
      this.reject(`Gap down or flat: ${(gapPct * 100).toFixed(1)}% (need gap up)`);
      return false;
    }
    if (gapPct > this.params.gapUpMaxPct) {
      this.reject(`Gap up too high: ${(gapPct * 100).toFixed(1)}% > ${(this.params.gapUpMaxPct * 100).toFixed(1)}%`);
      return false;
    }

    this.gapValidated = true;
    this.transitionTo(StockStateEnum.GAP_VALIDATED, "gap validated");
    return true;
  }

  validateVahRejection(vahPrice: number): boolean {
    if (this.openPrice === null) return false;
    this.vahPrice = vahPrice;

    if (this.openPrice < vahPrice) {
      this.reject(`Opening ${this.openPrice.toFixed(2)} < VAH ${vahPrice.toFixed(2)}`);
      return false;
    }

    if (this.state !== StockStateEnum.GAP_VALIDATED) {
      this.transitionTo(StockStateEnum.GAP_VALIDATED, "VAH validated");
    }
    return true;
  }

  checkLowViolation(): boolean {
    if (this.openPrice === null) return false;
    const threshold = this.openPrice * (1 - this.params.lowViolationPct);

    if (this.dailyLow < threshold) {
      this.reject(`Low violation: ${this.dailyLow.toFixed(2)} < ${threshold.toFixed(2)}`);
      return false;
    }

    this.lowViolationChecked = true;
    return true;
  }

  validateVolume(minRatio: number): boolean {
    if (this.volumeBaseline <= 0) {
      this.reject("No volume baseline available");
      return false;
    }

    const ratio = this.earlyVolume / this.volumeBaseline;
    if (ratio < minRatio) {
      this.reject(
        `Insufficient volume: ${(ratio * 100).toFixed(1)}% < ${(minRatio * 100).toFixed(1)}% of baseline`,
      );
      return false;
    }

    this.volumeValidated = true;
    return true;
  }

  prepareEntry(): void {
    if (!this.isActive) return;

    this.entryHigh = this.dailyHigh;
    this.entrySl = this.entryHigh * (1 - this.params.entrySlPct);

    if (this.state === StockStateEnum.QUALIFIED) {
      this.transitionTo(StockStateEnum.SELECTED, "preparing entry");
    }

    this.transitionTo(StockStateEnum.WAITING_FOR_ENTRY, "entry prepared");

    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const entryMinutes = this.params.entryTime
      ? parseTime(this.params.entryTime)
      : 9 * 60 + 20;

    if (nowMinutes >= entryMinutes) {
      this.entryReady = true;
    }
  }

  enterPosition(price: number, timestamp: Date): void {
    this.entryPrice = price;
    this.entryTime = timestamp;
    this.entered = true;
    this.transitionTo(StockStateEnum.ENTERED, "position entered");
  }

  exitPosition(price: number, timestamp: Date, reason: string): void {
    this.exitPrice = price;
    this.exitTime = timestamp;
    this.isSubscribed = false;
    this.transitionTo(StockStateEnum.EXITED, reason);

    if (this.entryPrice) {
      this.pnl = ((price - this.entryPrice) / this.entryPrice) * 100;
    }
  }

}
