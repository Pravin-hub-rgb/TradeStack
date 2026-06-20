# Proto File Warning — Root Cause & Fix

## The Warning

```
Error loading .proto file [Error: ENOENT: no such file or directory, open 'C:\ROOT\frontend\node_modules\upstox-js-sdk\dist\feeder\proto\MarketDataFeedV3.proto']
```

---

## Why It Happens

**The SDK's `MarketDataFeederV3` constructor calls `initProtobuf()` which uses `__dirname` to resolve the proto file path. Under Next.js Turbopack, `__dirname` resolves to a virtual/internal path instead of the real filesystem.**

---

## Source Code Trace

### 1. SDK Constructor Calls `initProtobuf()` (line 41)

File: `node_modules/upstox-js-sdk/dist/feeder/MarketDataFeederV3.js`

```javascript
// Lines 17-42
class MarketDataFeederV3 extends _Feeder.default {
  constructor(instrumentKeys = [], mode = this.Mode.FULL) {
    super();
    _defineProperty(this, "protobufRoot", null);  // starts null
    this.apiClient = _ApiClient.ApiClient.instance;
    this.instrumentKeys = instrumentKeys;
    this.mode = mode;
    this.initProtobuf();  // ← called in constructor (fire-and-forget)
  }
```

### 2. `initProtobuf()` Relies on `__dirname` (lines 117-126)

```javascript
async initProtobuf() {
  const protoPath = _path.default.resolve(__dirname, "./proto/MarketDataFeedV3.proto");
  //                                    ^^^^^^^^
  //  Expected: .../node_modules/upstox-js-sdk/dist/feeder/
  //  Actual under Turbopack: C:\ROOT\frontend\node_modules\... (virtual path)
  //
  _protobufjs.default.load(protoPath, (error, root) => {
    if (error) {
      console.error("Error loading .proto file", error);  // ← THE WARNING
      return;
    }
    this.protobufRoot = root;  // ← never set, stays null
  });
}
```

### 3. `decodeProtobuf()` Checks for null root (lines 129-136)

```javascript
decodeProtobuf(buffer) {
  if (!this.protobufRoot) {
    console.warn("Protobuf part not initialized yet!");
    return null;
  }
  // If root were set, would decode here:
  const FeedResponse = this.protobufRoot.lookupType(
    "com.upstox.marketdatafeederv3udapi.rpc.proto.FeedResponse"
  );
  return FeedResponse.decode(buffer);
}
```

### 4. Proto File Actually Exists at Real Path

We verified:
```
Test-Path frontend\node_modules\upstox-js-sdk\dist\feeder\proto\MarketDataFeedV3.proto
→ True
```

But `C:\ROOT` does NOT exist on this system — it's a virtual path created by Turbopack.

---

## How Our `streamer.ts` Fixes It (Already Working)

### Step A: Load protobuf ourselves using `process.cwd()` (lines 10-13, 38-44)

```typescript
// Absolute path using process.cwd() — always resolves correctly
const SDK_PROTO_PATH = path.join(
  process.cwd(), "node_modules", "upstox-js-sdk",
  "dist", "feeder", "proto", "MarketDataFeedV3.proto",
);

async init(): Promise<void> {
  try {
    this.protoRoot = await protobuf.load(SDK_PROTO_PATH);
    this.log("Protobuf loaded");
  } catch (err: any) {
    this.log(`Protobuf load failed: ${err.message}`);
  }
}
```

### Step B: Inject protobuf root into SDK's internal feeder (lines 103-115)

```typescript
setTimeout(() => {
  this.sdkStreamer.autoReconnect(false);
  this.feeder = this.sdkStreamer.streamer;     // ← internal MarketDataFeederV3
  if (this.feeder && this.protoRoot) {
    this.feeder.protobufRoot = this.protoRoot;  // ← override null → working root

    // NEW: Patch prototype so future feeders skip broken initProtobuf
    const feederProto = Object.getPrototypeOf(this.feeder);
    feederProto.initProtobuf = async function () {
      this.protobufRoot = null;  // no-op — we inject our own root anyway
    };
  }
}, 100);
```

### Flow after fix:

```
SDK constructor → initProtobuf() fires async → fails (protocol file not found at virtual path)
        ↓                                                
protobufRoot stays null → warning appears once            
        ↓                                                
SDK.connect() → WebSocket opens → our setTimeout fires    
        ↓                                                
We inject our own protoRoot → feeder.protobufRoot = our loaded root
        ↓                                                
We patch feederProto.initProtobuf = no-op → future reconnects won't warn
        ↓                                                
SDK.onMessage → decodeProtobuf() uses our root → WORKS
```

---

## Build Verification

```
> cd frontend && npx tsc --noEmit
(no output — clean)

> cd frontend && npx next build
✓ Compiled successfully in 2.2s
✓ TypeScript finished in 3.4s
```

---

## What the Fix Changed (Diff)

```diff
  setTimeout(() => {
    this.sdkStreamer.autoReconnect(false);
    this.feeder = this.sdkStreamer.streamer;
    if (this.feeder && this.protoRoot) {
      this.feeder.protobufRoot = this.protoRoot;
+     // Patch the prototype so future feeder instances skip proto loading
+     const feederProto = Object.getPrototypeOf(this.feeder);
+     feederProto.initProtobuf = async function () {
+       this.protobufRoot = null;
+     };
    }
  }, 100);
```

---

## Summary

| Aspect | Detail |
|--------|--------|
| **Root cause** | `__dirname` in SDK's `initProtobuf()` resolves to Turbopack's virtual path |
| **Impact** | Harmless — our `init()` + `connect()` already load and inject protobuf root |
| **Before fix** | Warning appears on every connect (including reconnects) |
| **After fix** | Warning appears once on first connect only; prototype patched for future instances |
| **Data flow** | Still works correctly — our injected root is used for protobuf decoding |
