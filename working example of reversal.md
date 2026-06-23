[1:08:32 pm] LAUNCHING REVERSAL BOT (Tick-based)...
[1:08:32 pm] Starting src/trading/live_trading/run_reversal.py...
[1:08:32 pm] [LOCK] Reversal bot singleton lock acquired
[1:08:32 pm] === TOP LEVEL DEBUGGING START ===
[1:08:32 pm] STARTING REVERSAL TRADING BOT (API-BASED OPENING PRICES)
[1:08:32 pm] =======================================================
[1:08:32 pm] CONFIG: Real market trading configuration loaded
[1:08:32 pm] CONFIG: Market open: 13:10:00
[1:08:32 pm] CONFIG: Entry time: 13:15:00
[1:08:32 pm] CONFIG: API poll delay: 5 seconds
[1:08:32 pm] CONFIG: Max positions: 2
[1:08:32 pm] CONFIG: Entry SL: 4.0%
[1:08:32 pm] CONFIG: Low violation: 1.0%
[1:08:32 pm] CONFIG: Strong start gap: 0.3%
[1:08:34 pm] Time: 2026-06-10 13:08:34 IST
[1:08:34 pm] LOADED 9 reversal stocks:
[1:08:34 pm] INDOTHAI: Reversal Downtrend
[1:08:34 pm] TECHNOE: Reversal Downtrend
[1:08:34 pm] AVANTIFEED: Reversal Downtrend
[1:08:34 pm] DCAL: Reversal Downtrend
[1:08:34 pm] DCXINDIA: Reversal Downtrend
[1:08:34 pm] EIEL: Reversal Downtrend
[1:08:34 pm] GESHIP: Reversal Downtrend
[1:08:34 pm] GMDCLTD: Reversal Downtrend
[1:08:34 pm] GREENLAM: Reversal Downtrend
[1:08:34 pm] OK INDOTHAI: Prev Close Rs227.14
[1:08:35 pm] OK TECHNOE: Prev Close Rs998.50
[1:08:35 pm] OK AVANTIFEED: Prev Close Rs1027.00
[1:08:35 pm] OK DCAL: Prev Close Rs187.92
[1:08:35 pm] OK DCXINDIA: Prev Close Rs189.97
[1:08:36 pm] OK EIEL: Prev Close Rs184.55
[1:08:36 pm] OK GESHIP: Prev Close Rs1442.20
[1:08:36 pm] OK GMDCLTD: Prev Close Rs627.80
[1:08:36 pm] OK GREENLAM: Prev Close Rs234.47
[1:08:36 pm] PREPARED 9 reversal instruments
[1:08:36 pm] === PRE-MARKET IEP FETCH SEQUENCE ===
[1:08:36 pm] WAITING 53 seconds until PREP_START (13:09:30)...
[1:09:30 pm] FETCHING IEP for 9 reversal stocks...
[1:09:30 pm] Clean symbols for IEP: ['INDOTHAI', 'TECHNOE', 'AVANTIFEED', 'DCAL', 'DCXINDIA', 'EIEL', 'GESHIP', 'GMDCLTD', 'GREENLAM']
[1:09:30 pm] IEP FETCH COMPLETED SUCCESSFULLY
[1:09:30 pm] Set opening price for INDOTHAI: Rs228.33
[1:09:30 pm] Gap validation failed for INDOTHAI
[1:09:30 pm] Set opening price for TECHNOE: Rs993.90
[1:09:30 pm] Gap validated for TECHNOE
[1:09:30 pm] Set opening price for AVANTIFEED: Rs1013.80
[1:09:30 pm] Gap validated for AVANTIFEED
[1:09:30 pm] Set opening price for DCAL: Rs184.96
[1:09:30 pm] Gap validated for DCAL
[1:09:30 pm] Set opening price for DCXINDIA: Rs184.73
[1:09:30 pm] Gap validated for DCXINDIA
[1:09:30 pm] Set opening price for EIEL: Rs182.60
[1:09:30 pm] Gap validated for EIEL
[1:09:30 pm] Set opening price for GESHIP: Rs1383.40
[1:09:30 pm] Gap validated for GESHIP
[1:09:30 pm] Set opening price for GMDCLTD: Rs613.95
[1:09:30 pm] Gap validated for GMDCLTD
[1:09:30 pm] Set opening price for GREENLAM: Rs239.04
[1:09:30 pm] Gap validation failed for GREENLAM
[1:09:30 pm] =======================================================
[1:09:30 pm] OPTIMIZATION: FILTERING GAP-VALIDATED STOCKS
[1:09:30 pm] =======================================================
[1:09:30 pm] GAP-VALIDATED STOCKS: 7 out of 9
[1:09:30 pm] GAP-VALIDATED SYMBOLS: ['TECHNOE', 'AVANTIFEED', 'DCAL', 'DCXINDIA', 'EIEL', 'GESHIP', 'GMDCLTD']
[1:09:30 pm] Subscribed to 7 instruments in 'full' mode
[1:09:30 pm] Active instruments updated to 7 gap-validated stocks
[1:09:30 pm] SKIPPED: Phase 1 unsubscription (optimization implemented)
[1:09:30 pm] OPTIMIZED SUBSCRIPTION: Only 7 gap-validated stocks subscribed
[1:09:30 pm] === PREP TIME: Loading metadata and preparing data ===
[1:09:30 pm] WAITING 30 seconds until market open...
[1:10:00 pm] === STARTING REVERSAL TRADING PHASE ===
[1:10:00 pm] ATTEMPTING to connect to data stream...
[1:10:00 pm] Connecting to Market Data Feed...
[1:10:00 pm] CONNECTED Data stream connected
[1:10:00 pm] MARKET OPEN! Monitoring live tick data...
[1:10:00 pm] === MARKET OPEN: Making OOPS stocks ready ===
[1:10:00 pm] OOPS CANDIDATES READY FOR IMMEDIATE TRADING (7):
[1:10:00 pm] TECHNOE (OOPS): Previous Close Rs998.50 - Ready for trigger
[1:10:00 pm] AVANTIFEED (OOPS): Previous Close Rs1027.00 - Ready for trigger
[1:10:00 pm] DCAL (OOPS): Previous Close Rs187.92 - Ready for trigger
[1:10:00 pm] DCXINDIA (OOPS): Previous Close Rs189.97 - Ready for trigger
[1:10:00 pm] EIEL (OOPS): Previous Close Rs184.55 - Ready for trigger
[1:10:00 pm] GESHIP (OOPS): Previous Close Rs1442.20 - Ready for trigger
[1:10:00 pm] GMDCLTD (OOPS): Previous Close Rs627.80 - Ready for trigger
[1:10:00 pm] OOPS stocks ready: 7
[1:10:00 pm] WAITING 300 seconds until entry time...
[1:10:00 pm] WebSocket OPENED at 13:10:00
[1:10:01 pm] Subscribed to 7 active instruments in 'full' mode (LTP + OHLC) at 13:10:01
[1:15:00 pm] === PREPARING ENTRIES ===
[1:15:00 pm] POST-REVERSAL QUALIFICATION STATUS:
[1:15:00 pm] TECHNOE (Rev-D): Open: Rs993.90 | Gap validated | Low checked
[1:15:00 pm] AVANTIFEED (Rev-D): Open: Rs1013.80 | Gap validated | Low checked
[1:15:00 pm] DCAL (Rev-D): Open: Rs184.96 | Gap validated | Low checked
[1:15:00 pm] DCXINDIA (Rev-D): Open: Rs184.73 | Gap validated | Low checked
[1:15:00 pm] EIEL (Rev-D): Open: Rs182.60 | Gap validated | Low checked
[1:15:00 pm] GESHIP (Rev-D): Open: Rs1383.40 | Gap validated | Low checked
[1:15:00 pm] GMDCLTD (Rev-D): Open: Rs613.95 | Gap validated | Low checked
[1:15:00 pm] About to call monitor.prepare_entries()
[1:15:00 pm] monitor.prepare_entries() completed
[1:15:00 pm] =======================================================
[1:15:00 pm] PHASE 2: CHECKING LOW VIOLATIONS
[1:15:00 pm] =======================================================
[1:15:00 pm] No low violations detected
[1:15:00 pm] === SUBSCRIPTION STATUS ===
[1:15:00 pm] MONITORING_ENTRY: 7 stocks - ['TECHNOE', 'AVANTIFEED', 'DCAL', 'DCXINDIA', 'EIEL', 'GESHIP', 'GMDCLTD']
[1:15:00 pm] REJECTED: 2 stocks - ['INDOTHAI', 'GREENLAM']
[1:15:00 pm] ACTIVELY SUBSCRIBED: 7 stocks - ['TECHNOE', 'AVANTIFEED', 'DCAL', 'DCXINDIA', 'EIEL', 'GESHIP', 'GMDCLTD']
[1:15:00 pm] ==================================================
[1:15:00 pm] Qualified stocks: 7
[1:15:00 pm] All 7 qualified stocks remain subscribed for first-come-first-serve
[1:15:00 pm] === ENTRY TIME: Strong Start candidates ready ===
[1:15:00 pm] No Strong Start candidates ready
[1:15:00 pm] OOPS CANDIDATES (already ready since market open): 7
[1:15:00 pm] TECHNOE (OOPS): Previous Close Rs998.50 - Ready for trigger
[1:15:00 pm] AVANTIFEED (OOPS): Previous Close Rs1027.00 - Ready for trigger
[1:15:00 pm] DCAL (OOPS): Previous Close Rs187.92 - Ready for trigger
[1:15:00 pm] DCXINDIA (OOPS): Previous Close Rs189.97 - Ready for trigger
[1:15:00 pm] EIEL (OOPS): Previous Close Rs184.55 - Ready for trigger
[1:15:00 pm] GESHIP (OOPS): Previous Close Rs1442.20 - Ready for trigger
[1:15:00 pm] GMDCLTD (OOPS): Previous Close Rs627.80 - Ready for trigger
[1:15:00 pm] MONITORING for entry/exit signals...
[1:15:00 pm] Connection active - monitoring for signals...