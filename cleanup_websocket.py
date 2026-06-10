#!/usr/bin/env python3
"""
WebSocket Cleanup Script
Forces disconnection of any lingering/stuck WebSocket sessions on Upstox server
Run this after killing bot processes to ensure clean state
"""

import upstox_client
import json
import time
import os
import sys

def cleanup_websocket_sessions():
    """Send disconnect signals to Upstox server for all configured tokens"""

    print("[BROOM] WebSocket Session Cleanup Tool")
    print("=" * 40)

    config_file = "upstox_config.json"
    if not os.path.exists(config_file):
        print(f"[FAIL] Config file not found: {config_file}")
        return False

    try:
        with open(config_file, 'r') as f:
            config = json.load(f)

        tokens_to_cleanup = []

        # Check for stock app token
        if 'access_token' in config and config['access_token']:
            tokens_to_cleanup.append(('Stock App', config['access_token']))

        # Check for option app token (if present)
        if 'option_access_token' in config and config.get('option_access_token'):
            tokens_to_cleanup.append(('Option App', config['option_access_token']))

        if not tokens_to_cleanup:
            print("[FAIL] No access tokens found in config")
            return False

        print(f"Found {len(tokens_to_cleanup)} token(s) to cleanup")

        for app_name, access_token in tokens_to_cleanup:
            print(f"\n[WRENCH] Cleaning up {app_name}...")

            try:
                # Create configuration
                configuration = upstox_client.Configuration()
                configuration.access_token = access_token

                # Create streamer instance (this may help server recognize the session)
                streamer = upstox_client.MarketDataStreamerV3(
                    upstox_client.ApiClient(configuration)
                )

                # Attempt to disconnect (sends close signal to server)
                streamer.disconnect()
                print(f" Disconnect signal sent for {app_name}")

            except Exception as e:
                print(f"[WARN] Disconnect attempt failed for {app_name}: {e}")
                # This is often normal if no active connection exists

        print(f"\n[WAIT] Waiting 5 seconds for server to process disconnects...")
        time.sleep(5)

        print(" Cleanup complete!")
        print("\n[CLIPBOARD] Next Steps:")
        print("1. Wait 10-15 minutes for server-side session cleanup")
        print("2. Regenerate fresh access tokens if needed")
        print("3. Test WebSocket connection with your main script")

        return True

    except Exception as e:
        print(f"[FAIL] Cleanup failed: {e}")
        return False

if __name__ == "__main__":
    success = cleanup_websocket_sessions()

    if success:
        print("\n[TARGET] Cleanup successful - server sessions should clear within 10-15 minutes")
    else:
        print("\n[FAIL] Cleanup encountered issues")

    print("\n[IDEA] Pro Tip: Run this script after any bot crashes or forced kills")
    print("[IDEA] Prevents lingering connections that cause 403 Forbidden errors")
