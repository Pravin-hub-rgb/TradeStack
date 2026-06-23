# WebSocket 403 — Root Cause & Fix (SOLVED)

## Problem
New TypeScript live trader got 403 when connecting WebSocket to Upstox.

## Root Cause
**Concurrent WebSocket sessions on the same token.** The old bot was killed without sending a WebSocket close frame (`process.terminate()` / `process.kill()`), so Upstox's server kept the session alive. When a new bot tried to connect with the same token, Upstox rejected it with 403 (one active session per token limit).

**`isPlusPlan: false` in the JWT was a red herring** — the REST API worked fine, and the WebSocket would work too if no stale session existed.

## Old Project's Solution (mirrored)
1. **`kill_duplicate_processes()`** — Pre-emptive: kills any other process running the same bot script (`psutil`)
2. **`acquire_singleton_lock()`** — File-based exclusive lock using `portalocker` (`LOCK_EX | LOCK_NB`)
3. **`cleanup_websocket.py`** — Manual tool to send disconnect signals to Upstox after crashes
4. **`finally: cleanup_singleton_lock()`** — Always releases lock on exit

## New Project's Fix
- Added `frontend/src/lib/live-trader/lock.ts` — `LockManager` with atomic file lock (equivalent of `portalocker`)
- Lock acquired in `streamer.connect()` before WebSocket handshake
- Lock released in `streamer.disconnect()` on clean shutdown
- Stale lock detection: if lock file PID is dead, auto-cleanup
- If lock can't be acquired, `connect()` returns false and emits `lock_denied` status

## Verification
- [x] Lock file created in `data/.live_trader.lock` with PID + timestamp
- [x] Logs `[LOCK] Live trader singleton lock acquired` (mirrors old project)
- [x] Logs `[UNLOCK] Live trader singleton lock released` on disconnect
- [x] Logs `ERROR: Another live trader instance is already running` if lock exists
- [x] Stale lock auto-cleaned if locking process is dead
