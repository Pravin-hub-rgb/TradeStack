# Live Trading Continuation Bot — Fix Discussion

## 1. Dashboard UI — Stock Tables

### Problem
- All 6 stocks in a single table, states mixed (`unsubscribed`, `monitoring_entry`, `initialized`, `monitoring_exit`) — hard to tell which are being actively traded
- Missing columns: IEP (intraday entry price), entry price, stop loss
- No visual distinction between active positions and background/queued stocks

### Required Fix
- Separate active trades into their own highlighted section/table
- Show full trade details per row: symbol, entry price, stop loss, current P&L, IEP
- Active positions should be visually distinct (different card/color/badge)

---

## 2. Position Sizing

### Formula
- Risk-based, denominated in **₹** (not $)
- Example: stock price = ₹100, max risk = ₹500
- Position size = risk_amount / (entry_price * (stop_loss_pct / 100))
- This determines how many shares to buy so the SL hit costs exactly ₹500

### Capital Deduction
- When a position is entered, its cost (entry_price × quantity) is deducted from total capital
- Remaining capital = initial capital − sum of all open position costs + realized P&L
- Example: ₹1L capital, first trade costs ₹20K → remaining = ₹80K

---

## 3. Live Trade Management (from Dashboard)

- At the bottom of the Live Trading tab, show a table of **currently active positions** (not all scanned stocks)
- From this table, user can **set exit price** and **close the position**
- Closed positions flow into the **Trade Log** with profit/loss recorded
- Backend should update `status = 'closed'` and release capital

---

## 4. Terminology / State Labels

| Current | Proposed | Reason |
|---------|----------|--------|
| `monitoring_entry` | `waiting for entry` | Clearer — we selected the stock and are waiting for the entry trigger |
| `monitoring_exit` | (keep or change to `holding`) | Bot won't auto-exit on SL (swing trading), so user needs to know position is being held |

---

## 5. Infrastructure Concerns

- **24/7 Monitoring**: Swing trading requires always-on monitoring (SL hits, target hits). Current setup only runs when system is on. Need a server deployment.
- **Token Expiry**: Upstox token expires daily. If token is updated at 10 AM but market opens at 9:15, the pre-market window is missed. Need a token refresh strategy that covers the full market window.
