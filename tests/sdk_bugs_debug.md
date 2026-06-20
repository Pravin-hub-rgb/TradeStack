# `upstox-js-sdk` v2.28.0 — Two Runtime Bugs

## Bug 1: `clearSubscriptions is not a function`

**Error:**
```
TypeError: this.streamer.clearSubscriptions is not a function
    at ignore-listed frames
```

**Cause:** `Streamer.js` (base class) auto-reconnect at line 115 calls `this.streamer.clearSubscriptions()`, but `this.streamer` is a `MarketDataFeederV3` instance, which doesn't have this method.

Source: `frontend/node_modules/upstox-js-sdk/dist/feeder/Streamer.js`

```javascript
// Lines 101-119 — auto-reconnect logic
function _prepareAutoReconnect2() {
  let counter = 0;
  const attemptReconnect = async () => {
    // ...
    if (counter >= _classPrivateFieldGet(this, _retryCount)) {
      clearInterval(_classPrivateFieldGet(this, _reconnectInterval));
      this.streamer.clearSubscriptions();  // ← BUG: MarketDataFeederV3 has no such method
      this.emit(this.Event.AUTO_RECONNECT_STOPPED, ...);
      return;
    }
  };
  // ...
}
```

`MarketDataStreamerV3` has a `_clearSubscriptions2` private method, but `Streamer` (its parent) calls `this.streamer.clearSubscriptions()` on the Feeder, not the Streamer. This is a naming collision — the private method name happens to match but belongs to a different class.

**Consequence:** The `AUTO_RECONNECT_STOPPED` event is never emitted, so retry count is never enforced. Auto-reconnect loops infinitely, flooding the console with errors.

---

## Bug 2: Proto file not found (ENOENT)

**Error:**
```
Error loading .proto file [Error: ENOENT: no such file or directory, open '.../dist/feeder/proto/MarketDataFeedV3.proto']
```

**Cause:** `MarketDataFeederV3.initProtobuf()` uses `__dirname` at line 118:

```javascript
// MarketDataFeederV3.js — constructor calls initProtobuf()
async initProtobuf() {
  const protoPath = _path.default.resolve(__dirname, "./proto/MarketDataFeedV3.proto");
  _protobufjs.default.load(protoPath, (error, root) => {
    if (error) { console.error("Error loading .proto file", error); return; }
    this.protobufRoot = root;
  });
}
```

`__dirname` resolves to `dist/feeder/` inside the package. This works in plain Node.js but can fail when:
- Next.js Turbopack bundles the file (changing `__dirname` resolution)
- The project is symlinked or copied
- There's a workspace/lockfile mismatch

The proto file **does** exist in the installed package:
```
node_modules/upstox-js-sdk/dist/feeder/proto/MarketDataFeedV3.proto
```

**Consequence:** `protobufRoot` stays `null`. `decodeProtobuf()` returns `null`. All WebSocket messages are parsed as `JSON.stringify(null)` = `"null"`. **No market data can ever be decoded.**

---

## Effects on the 403 issue (separate)

The 403 (`Unexpected server response: 403`) is a **separate** issue caused by `isPlusPlan: false` on the account token. REST works, WebSocket doesn't. This is visible in the logs as:

```
[Streamer] Auth failed (Unexpected server response: 403)
```

Even with both bugs fixed, the connection will still get 403 until a paid-plan token is used. But at least the SDK won't crash/hang.

---

## Console Output (What You Saw)

```
[ORCHESTRATOR] Streamer disconnected
[16:08:04] [Streamer] Auto reconnect attempt 31/5       ← Bug 1: retry count exceeded but never stopped
[ORCHESTRATOR] Reconnecting (attempt 31)...
TypeError: this.streamer.clearSubscriptions is not a function  ← Bug 1
Error loading .proto file [ENOENT: ...]                       ← Bug 2
[16:08:04] [Streamer] Auth failed (Unexpected server response: 403)  ← Account plan issue
[16:08:04] [Streamer] WebSocket closed
[ORCHESTRATOR] Streamer disconnected
```

Repeats forever because Bug 1 prevents the retry limit from being enforced.

---

## Fixes Applied in `streamer.ts`

| Bug | Fix |
|-----|-----|
| Bug 1 (clearSubscriptions) | Called `sdkStreamer.autoReconnect(false)` 100ms after connect. Implemented our own reconnect with exponential backoff (same as before). |
| Bug 2 (proto path) | Load protobuf ourselves via absolute path: `process.cwd() + /node_modules/upstox-js-sdk/dist/feeder/proto/MarketDataFeedV3.proto`. Inject `protobufRoot` into feeder via `sdkStreamer.streamer.protobufRoot = root`. |
| 403 (account plan) | Cannot fix in code — requires a token from a paid-plan (`isPlusPlan: true`) account. |
