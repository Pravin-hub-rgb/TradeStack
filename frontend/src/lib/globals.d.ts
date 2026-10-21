/**
 * Ambient globals shared by the live trader runtime (browser + Next server).
 * Set once per server process in app/api/live/route.ts.
 */
declare var __addLiveLog: ((msg: string) => void) | undefined;
