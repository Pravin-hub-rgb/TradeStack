/**
 * Shared 5-min ORB (opening range breakout) fields.
 *
 * Extended by both the reversal StateMachineMixin and the continuation
 * ContinuationStateMachine so the ORB inheritance chain is properly typed —
 * nothing needs an `as any` cast to reach these fields.
 */
export class OrbFields {
  /** Highest I1 high inside the ORB window (MARKET_OPEN → ENTRY_TIME). */
  public orbHigh: number | null = null;
  /** Lowest I1 low inside the ORB window. */
  public orbLow: number | null = null;
  /** Open of the earliest I1 candle in the window (exchange truth for the open). */
  public firstCandleOpen: number | null = null;
  /** True after the ORB window closes at ENTRY_TIME — entry levels stop ratcheting. */
  public orbFrozen = false;
  /** ts (ms) of the earliest candle seen; handles out-of-order I1 packets. */
  protected _firstTs: number = Infinity;
}
