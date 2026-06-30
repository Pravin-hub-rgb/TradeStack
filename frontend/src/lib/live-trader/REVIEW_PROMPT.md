# Live Trader Review Prompt

Copy this prompt and paste it to have the AI systematically audit any live trader module.

---

You are a code reviewer. Audit the following TypeScript file against these criteria.

## File to review
[Paste file path + contents here, plus the **old Python file path** it maps to]

## Review checklist

### 1. Logic match (old → new)
- Does every `if/else` branch, loop, and conditional match the old Python exactly?
- Are there any missing checks, reversed conditions, or off-by-one errors?
- Are default values the same (e.g. `maxReconnectAttempts: 5` in TS vs `10` in Python)?
- Are any hardcoded numbers different from the old codebase (e.g. `flatGapThreshold: 0.003` vs `0.005`)?

### 2. Node.js/TypeScript correctness
- **Async/await**: Are all `async` functions awaited properly? Any dangling promises?
- **Null safety**: Are all nullable fields (`T | null`) checked before use? Any `!` assertion that could crash?
- **Error handling**: Are WebSocket errors, API failures, and parsing errors caught? No unhandled rejections?
- **Memory leaks**: Do setInterval/setTimeout get cleared on cleanup? Event listeners removed?
- **Type correctness**: Do all function signatures match their callers? No `any` types leaking?

### 3. Edge cases
- **Market closed**: What happens if WebSocket returns 302 (redirect to status page)? Is `followRedirects: true` set?
- **Late data**: What if first 1-min candle arrives 5 minutes after market open?
- **Duplicate ticks**: Can the same tick be processed twice? If so, does it double-enter?
- **Invalid prices**: What if price is 0, negative, or NaN? Are these filtered?
- **Reconnection**: After reconnect, are stale ticks processed for already-exited stocks?
- **Token expiry**: What if token expires mid-session? Is there any error handling?

### 4. State machine integrity
- Does every state transition follow `VALID_TRANSITIONS`?
- Can the FSM get stuck in an invalid state? Any path that skips a required state?
- Are `REJECTED` stocks truly unsubscribed? Or could a rejected stock still receive ticks and cause a state change?

### 5. Config vs hardcoded values
- Which values come from Settings DB vs being hardcoded?
- Are any old Python defaults missing from the `settings` table?
- Are the `settings` key names consistent between Python (snake_case) and TS (camelCase)?

### 6. Subscription lifecycle
- Are stocks unsubscribed in the correct order (gap-rejected → low-violated → non-selected after 2 positions)?
- Is `safeUnsubscribe` idempotent? Can it be called twice for the same stock?
- After `markStocksUnsubscribed`, can the stock ever be re-subscribed without a full reset?

### 7. Paper trading accuracy
- Are entry/exit prices recorded at the correct tick (within 1-second tolerance)?
- Is P&L calculated correctly (exit - entry for long positions)?
- Are rejected/exit reasons logged with the exact same strings as the old system?

## Output format
- List every issue found as: `[BUG]`, `[WARNING]`, `[INFO]`
- For each bug, explain the exact line(s) and what should change
- If no bugs found, say "No issues found for [file name]"
