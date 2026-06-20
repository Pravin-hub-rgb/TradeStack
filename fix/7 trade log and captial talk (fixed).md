Okay, see, here is the stuff that I'm going to tell you, and we have to fix this. First of all, in the live trading, we will be having two modes, like paper trading and real trading. Okay, now there will be two... Right now, we have a working paper trading system. When we will switch to, so it will be toggleable button, right? So when we will switch to real trading, then it will say coming soon. And now...Yes, so and here is the stuff that have to be changed. So see, the capital is like whatever, it's $100,000. First of all, it should be in rupees. And in trade logs, you have to change so many stuff. And it will also have a syncing with this capital that we have. See, right now we have four trades and as I said, according to the risk of 500, so we will do the position sizing according to that, right? Suppose we have a stock at 100 and the risk we want to take is just of 500. So there is this formula using which we can calculate the position sizing. And position sizing will be in such a manner that we enter, we take the number of stocks, number of position sizing, so our trade loss is less than 500, near to it, but near doesn't mean more than 500, just near it or below it. So how whatever position sizing we have to do to match it, we take it, okay? Then comes the, suppose we have four trades right now, and four trades are right now, and we have only one lakh of capital. So, and yeah, make it from 100,000 to one lakh Indian rupees. And so according to the four stocks that we are and we have entered and we haven't closed the position yet, so we will, this will affect the capital too. And also in logs, we should also log that what kind of trade it was. Was it the reversal trade? Was it the reversal trade? And what was it the continuation trade? And also, we can, when we will put the exit price, then the P&L will be automatically calculated. So rather writing how much money I got, if I will just write what is the exit price, then you will calculate the P&L according to that. So this is the flow it should follow.So yeah, according to that, on the display grid for the P&L, we are showing in date format that those grid will have green and red days according to that.


Live Trading Control

Start and stop the live trading bot.
LIVE
Next:
Trading active
Open: 09:26Prep: 09:25:30Entry: 09:31
Trading Mode
Continuation
Reversal

Connected
Continuation mode
Subscribed: 2
Paper Trader
Trades

2
Wins

0
Losses

0
Win Rate

0.0%
P&L

0.00%
Capital

$-186540
Continuation
20
Active
2
Entered
0
Rejected
Active Stocks (20)
Symbol	State	LTP	High	Low	VAH	Prev Close	Gap%	Live Vol	Base Vol (R)
COFORGE	Monitoring Exit
	1478.00	1497.80	1476.10	1468.37	1464.80	1.2%	2328256	25,11,218.6
FEDFINA	Unsubscribed
	--	162.50	162.50	163.24	162.97	-0.3%	--	8,73,272.4
INFOBEAN	Unsubscribed
	175.95	179.00	175.49	171.94	170.85	4.1%	180573	7,27,652.9
JINDALSAW	Unsubscribed
	--	246.19	246.19	254.23	247.91	-0.7%	--	31,76,685.1
LAXMIDENTL	Unsubscribed
	231.55	232.60	231.50	231.80	228.11	1.9%	17595	3,43,602.9
LODHA	Unsubscribed
	--	904.50	904.50	939.62	937.95	-3.6%	--	13,57,587.2
MOSCHIP	Unsubscribed
	218.98	220.61	218.56	218.88	216.59	1.3%	521836	26,78,496.4
OLECTRA	Unsubscribed
	1280.10	1286.70	1279.10	1275.72	1270.40	1.2%	86406	8,53,682.3
PROTEAN	Unsubscribed
	--	637.00	637.00	641.02	634.65	0.4%	--	3,25,444.3
SAKSOFT	Unsubscribed
	--	145.25	145.25	145.59	143.67	1.1%	--	2,37,974.6
SENCO	Unsubscribed
	--	352.50	352.50	354.33	351.55	0.3%	--	5,19,376.6
SERVOTECH	Unsubscribed
	--	103.51	103.51	105.42	104.27	-0.7%	--	31,83,406.4
SHANTIGOLD	Unsubscribed
	--	227.83	227.83	229.97	227.38	0.2%	--	14,89,742
SKYGOLD	Unsubscribed
	541.30	541.30	538.05	534.97	530.00	1.7%	65156	13,60,466.8
SOMANYCERA	Unsubscribed
	--	521.00	521.00	531.77	526.25	-1.0%	--	82,216.3
SUVEN	Unsubscribed
	--	268.95	268.95	271.78	269.85	-0.3%	--	19,03,327.7
VIPIND	Unsubscribed
	--	324.00	324.00	325.93	323.65	0.1%	--	4,98,297.9
VOLTAS	Monitoring Exit
	1374.10	1380.00	1362.20	1334.87	1327.60	2.6%	702403	12,14,910.3
ASHAPURMIN	Unsubscribed
	--	712.85	712.85	715.12	706.50	0.9%	--	6,38,601.9
ANANTRAJ	Unsubscribed
	--	536.75	536.75	542.47	540.70	-0.7%	--	35,30,479.3
Live Logs (66)
[08:44:57] Starting continuation bot with 20 stocks
[08:44:57] [Streamer] Protobuf loaded
[08:44:57] Loaded continuation stock: COFORGE (prev close: 1464.8)
[08:44:57] Loaded continuation stock: FEDFINA (prev close: 162.97)
[08:44:57] Loaded continuation stock: INFOBEAN (prev close: 170.85)
[08:44:57] Loaded continuation stock: JINDALSAW (prev close: 247.91)
[08:44:57] Loaded continuation stock: LAXMIDENTL (prev close: 228.11)
[08:44:57] Loaded continuation stock: LODHA (prev close: 937.95)
[08:44:57] Loaded continuation stock: MOSCHIP (prev close: 216.59)
[08:44:57] Loaded continuation stock: OLECTRA (prev close: 1270.4)
[08:44:57] Loaded continuation stock: PROTEAN (prev close: 634.65)
[08:44:57] Loaded continuation stock: SAKSOFT (prev close: 143.67)
[08:44:57] Loaded continuation stock: SENCO (prev close: 351.55)
[08:44:57] Loaded continuation stock: SERVOTECH (prev close: 104.27)
[08:44:57] Loaded continuation stock: SHANTIGOLD (prev close: 227.38)
[08:44:57] Loaded continuation stock: SKYGOLD (prev close: 530)
[08:44:57] Loaded continuation stock: SOMANYCERA (prev close: 526.25)
[08:44:57] Loaded continuation stock: SUVEN (prev close: 269.85)
[08:44:57] Loaded continuation stock: VIPIND (prev close: 323.65)
[08:44:57] Loaded continuation stock: VOLTAS (prev close: 1327.6)
[08:44:57] Loaded continuation stock: ASHAPURMIN (prev close: 706.5)
[08:44:57] Loaded continuation stock: ANANTRAJ (prev close: 540.7)
[08:44:57] Running automatic pre-market validation...
[08:44:57] Starting pre-market flow for 20 stocks (mode: continuation)
[08:44:57] Fetching volume baselines from cache...
[08:44:57] Volume baselines loaded for 20 symbols
[08:44:57] Fetching VAH for 20 continuation stocks...
[08:45:05] VAH calculated for 20 stocks
[08:45:05] Waiting for PREP_START (09:25:30)...
[09:25:30] Fetching IEP for 20 symbols...
[09:25:30] IEP fetched for 20 symbols
[09:25:30] COFORGE: VALIDATED (gap=1.24%, vah=1468.37)
[09:25:30] FEDFINA: Gap validation FAILED - Gap too flat: -0.3%
[09:25:30] INFOBEAN: VALIDATED (gap=4.11%, vah=171.94)
[09:25:30] JINDALSAW: Gap validation FAILED - Gap down or flat: -0.7% (need gap up)
[09:25:30] LAXMIDENTL: VALIDATED (gap=1.94%, vah=231.8)
[09:25:30] LODHA: Gap validation FAILED - Gap down or flat: -3.6% (need gap up)
[09:25:30] MOSCHIP: VALIDATED (gap=1.33%, vah=218.88)
[09:25:30] OLECTRA: VALIDATED (gap=1.20%, vah=1275.72)
[09:25:30] PROTEAN: VAH validation FAILED - Opening 637.00 < VAH 641.02
[09:25:30] SAKSOFT: VAH validation FAILED - Opening 145.25 < VAH 145.59
[09:25:30] SENCO: Gap validation FAILED - Gap too flat: 0.3%
[09:25:30] SERVOTECH: Gap validation FAILED - Gap down or flat: -0.7% (need gap up)
[09:25:30] SHANTIGOLD: Gap validation FAILED - Gap too flat: 0.2%
[09:25:30] SKYGOLD: VALIDATED (gap=1.70%, vah=534.97)
[09:25:30] SOMANYCERA: Gap validation FAILED - Gap down or flat: -1.0% (need gap up)
[09:25:30] SUVEN: Gap validation FAILED - Gap down or flat: -0.3% (need gap up)
[09:25:30] VIPIND: Gap validation FAILED - Gap too flat: 0.1%
[09:25:30] VOLTAS: VALIDATED (gap=2.61%, vah=1334.87)
[09:25:30] ASHAPURMIN: VAH validation FAILED - Opening 712.85 < VAH 715.12
[09:25:30] ANANTRAJ: Gap validation FAILED - Gap down or flat: -0.7% (need gap up)
[09:25:30] Pre-market complete: 7/20 validated
[09:25:30] Activating 7 pre-validated stocks
[09:25:30] Waiting for MARKET_OPEN (09:26)...
[09:26:00] MARKET OPEN
[09:26:00] [LOCK] Continuation bot singleton lock acquired
[09:26:00] [Streamer] WebSocket opened via SDK
[09:26:00] [Streamer] Subscribed to 7 instruments
[09:26:00] Waiting for ENTRY_TIME (09:31)...
[09:31:00] ENTRY TIME REACHED
[09:31:00] Phase 2: checking low violations, volume...
[09:31:02] [Streamer] Unsubscribed from 16 instruments
[09:31:02] Bot started (mode: continuation), 7 stocks subscribed
[09:32:01] [Paper] ENTRY COFORGE @ 1493.90 (qty: 100, remaining: -49390.00)
[09:33:17] [Paper] ENTRY VOLTAS @ 1371.50 (qty: 100, remaining: -186540.00)
[09:33:17] [Streamer] Unsubscribed from 2 instruments


capital can't be negative too