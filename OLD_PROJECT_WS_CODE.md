# Old Project — WebSocket Connection Source Code

## File: `MA_Stock_Trader/src/trading/live_trading/simple_data_streamer.py`

```python
# -*- coding: utf-8 -*-
"""
Simplified Data Streamer for Live Testing
Minimal imports to avoid conflicts with upstox_client
"""

import upstox_client
import json
import os
import sys
import logging
from datetime import datetime, timedelta
import pytz

logger = logging.getLogger(__name__)
IST = pytz.timezone('Asia/Kolkata')

class SimpleStockStreamer:
    """Minimal WebSocket streamer for testing"""

    def __init__(self, instrument_keys, stock_symbols):
        self.instrument_keys = instrument_keys
        self.stock_symbols = stock_symbols
        self.streamer = None
        self.connected = False
        self.running = True
        self.reconnecting = False
        self.connection_attempts = 0
        self.max_reconnect_attempts = 5
        self.last_connection_time = None
        self.last_disconnection_time = None
        self.reconnection_reason = None
        self.active_instruments = set(instrument_keys.copy())
        self.intentional_disconnect = False

        config_file = os.path.join(os.path.dirname(__file__), '..', '..', '..', 'upstox_config.json')
        with open(config_file, 'r') as f:
            config = json.load(f)
        self.access_token = config['access_token']

        logger.info(f"Simple streamer monitoring {len(instrument_keys)} stocks")

    def connect(self):
        """Connect to WebSocket using Market Data Feed endpoint with auto-redirect"""
        try:
            configuration = upstox_client.Configuration()
            configuration.access_token = self.access_token
            configuration.redirect_uri = None

            self.streamer = upstox_client.MarketDataStreamerV3(
                upstox_client.ApiClient(configuration)
            )

            self.streamer.on("open", self.on_open)
            self.streamer.on("message", self.on_message)
            self.streamer.on("error", self.on_error)
            self.streamer.on("close", self.on_close)

            print("Connecting to Market Data Feed...")
            self.streamer.connect()
            return True

        except Exception as e:
            print(f"Connection failed: {e}")
            return False

    def on_open(self):
        current_time = datetime.now(IST).strftime('%H:%M:%S')
        self.last_connection_time = datetime.now(IST)
        self.connection_attempts += 1

        if self.connection_attempts > 1:
            print(f"WebSocket RECONNECTED at {current_time} (attempt #{self.connection_attempts})")
        else:
            print(f"WebSocket OPENED at {current_time}")

        self.connected = True

        import time
        time.sleep(1)

        try:
            active_list = list(self.active_instruments)
            self.streamer.subscribe(active_list, "full")
            print(f"Subscribed to {len(active_list)} active instruments in 'full' mode (LTP + OHLC) at {datetime.now(IST).strftime('%H:%M:%S')}")
        except Exception as e:
            print(f"Subscription error at {datetime.now(IST).strftime('%H:%M:%S')}: {e}")

    def on_message(self, message):
        try:
            if isinstance(message, list):
                for msg_item in message:
                    self._process_message_dict(msg_item)
            elif isinstance(message, dict):
                self._process_message_dict(message)
            else:
                logger.warning(f"Unknown message format: {type(message)}")
        except Exception as e:
            error_msg = str(e) if e is not None else "Unknown error"
            logger.error(f"Message processing error: {error_msg}")

    def _process_message_dict(self, message):
        if 'feeds' in message:
            feeds = message['feeds']
            current_time = datetime.now(IST)

            for instrument_key, feed_data in feeds.items():
                if instrument_key not in self.stock_symbols:
                    continue

                symbol = self.stock_symbols[instrument_key]

                ltp = None
                ohlc_list = []

                if isinstance(feed_data, dict):
                    if 'fullFeed' in feed_data:
                        full_feed = feed_data['fullFeed']
                        if isinstance(full_feed, dict) and 'marketFF' in full_feed:
                            market_ff = full_feed['marketFF']
                            if isinstance(market_ff, dict):
                                if 'ltpc' in market_ff:
                                    ltpc_data = market_ff['ltpc']
                                    if isinstance(ltpc_data, dict):
                                        ltp = ltpc_data.get('ltp')
                                if 'marketOHLC' in market_ff:
                                    market_ohlc = market_ff['marketOHLC']
                                    if isinstance(market_ohlc, dict) and 'ohlc' in market_ohlc:
                                        ohlc_list = market_ohlc['ohlc']

                if ltp is not None:
                    ltp = float(ltp)
                    if hasattr(self, 'tick_handler'):
                        self.tick_handler(instrument_key, symbol, ltp, current_time, ohlc_list)

    def on_error(self, error):
        current_time = datetime.now(IST).strftime('%H:%M:%S')
        print(f"WebSocket ERROR at {current_time}: {error}")
        if not self.reconnecting:
            self.reconnect()

    def on_close(self, *args):
        current_time = datetime.now(IST).strftime('%H:%M:%S')
        self.last_disconnection_time = datetime.now(IST)
        close_code = args[0] if args else "unknown"
        close_reason = args[1] if len(args) > 1 else "unknown"
        print(f"WebSocket CLOSED at {current_time} - Code: {close_code}, Reason: {close_reason}")
        self.connected = False
        if not self.reconnecting and not self.intentional_disconnect:
            self.reconnect()
        else:
            print("Skipping reconnection - intentional disconnection or already reconnecting")

    def disconnect(self):
        self.intentional_disconnect = True
        if self.streamer:
            try:
                self.streamer.disconnect()
                print("WebSocket disconnected (intentional)")
            except:
                pass
        self.connected = False

    def unsubscribe(self, instrument_keys):
        try:
            for key in instrument_keys:
                if key in self.active_instruments:
                    self.active_instruments.remove(key)
            if self.streamer:
                self.streamer.unsubscribe(instrument_keys)
            print(f"Unsubscribed from {len(instrument_keys)} instruments")
            print(f"Active instruments remaining: {len(self.active_instruments)}")
        except Exception as e:
            print(f"Unsubscribe error: {e}")
            raise

    def reconnect(self):
        if self.reconnecting:
            return
        self.reconnecting = True
        attempt = 1
        while attempt <= self.max_reconnect_attempts and not self.connected:
            wait_time = 5 * (2 ** (attempt - 1))
            current_time = datetime.now(IST).strftime('%H:%M:%S')
            print(f"Reconnecting (attempt {attempt}/{self.max_reconnect_attempts}) at {current_time} - waiting {wait_time}s...")
            import time
            time.sleep(wait_time)
            try:
                if self.connect():
                    if self.connected:
                        print(f"Reconnection successful at {datetime.now(IST).strftime('%H:%M:%S')}")
                        break
            except Exception as e:
                print(f"Reconnect attempt {attempt} failed: {e}")
            attempt += 1
        self.reconnecting = False
        if not self.connected:
            print("Max reconnection attempts reached - stopping")
```

## File: `MA_Stock_Trader/src/trading/live_trading/data_streamer.py`

```python
"""
Adapted Data Streamer for Stock Live Trading
Based on option-trading-bot/upstox/data_streamer.py but modified for stocks
"""

import upstox_client
import json
from datetime import datetime
import pytz
import signal
import sys
import logging
import os
from typing import Dict, List, Optional

UPSTOX_CONFIG_FILE = os.path.join(os.path.dirname(__file__), '..', '..', '..', 'upstox_config.json')
with open(UPSTOX_CONFIG_FILE, 'r') as f:
    upstox_config = json.load(f)

ACCESS_TOKEN = upstox_config['access_token']

sys.path.append(os.path.join(os.path.dirname(__file__), '..', '..'))
from config import *

logger = logging.getLogger(__name__)
IST = pytz.timezone('Asia/Kolkata')


class StockDataStreamer:
    """WebSocket data streamer adapted for stocks"""

    def __init__(self, instrument_keys: List[str], stock_symbols: Dict[str, str]):
        self.instrument_keys = instrument_keys
        self.stock_symbols = stock_symbols
        self.running = True
        self.streamer = None
        signal.signal(signal.SIGINT, self.signal_handler)
        self.connected = False
        self.subscription_successful = False
        logger.info(f"Monitoring {len(instrument_keys)} stocks: {list(stock_symbols.values())}")

    def signal_handler(self, sig, frame):
        logger.info("Shutting down streamer...")
        self.running = False
        if self.streamer:
            self.streamer.disconnect()
        sys.exit(0)

    def connect(self):
        """Establish WebSocket connection with retry logic"""
        configuration = upstox_client.Configuration()
        configuration.access_token = ACCESS_TOKEN

        for attempt in range(MAX_RETRIES):
            try:
                self.streamer = upstox_client.MarketDataStreamerV3(
                    upstox_client.ApiClient(configuration)
                )
                self.streamer.on("open", self.on_open)
                self.streamer.on("message", self.on_message)
                self.streamer.on("error", self.on_error)
                self.streamer.on("close", self.on_close)

                logger.info("Connecting to market data...")
                self.streamer.connect()

                timeout = 10
                start_time = time.time()
                while not self.subscription_successful and (time.time() - start_time) < timeout:
                    time.sleep(0.5)

                if self.subscription_successful:
                    logger.info("Live data streaming started")
                    return True
                else:
                    raise Exception("Subscription failed")

            except Exception as e:
                logger.error(f"Connection failed: {e}")
                if attempt < MAX_RETRIES - 1:
                    logger.info(f"[REFRESH] Retrying in {RETRY_DELAY} seconds...")
                    time.sleep(RETRY_DELAY)
                else:
                    logger.error("Max retries reached")
                    return False
        return False

    def on_open(self):
        logger.info("WebSocket connected")
        self.connected = True
        import time
        time.sleep(2)
        try:
            self.streamer.subscribe(self.instrument_keys, SUBSCRIPTION_MODE)
            self.subscription_successful = True
            logger.info(f"Subscribed to {len(self.instrument_keys)} instruments")
        except Exception as e:
            logger.error(f"Subscription error: {e}")
            self.running = False

    def on_message(self, message):
        # Handles both dict (auto-decoded by SDK) and protobuf binary messages
        # Extracts LTP from fullFeed.marketFF.ltpc or ltpc paths
        try:
            if isinstance(message, dict) and 'marketInfo' in message:
                return
            if isinstance(message, dict) and 'feeds' in message:
                feeds = message['feeds']
                for instrument_key, feed_data in feeds.items():
                    if instrument_key not in self.stock_symbols:
                        continue
                    symbol = self.stock_symbols[instrument_key]
                    ltp = None
                    timestamp = None
                    ohlc_data = None

                    if isinstance(feed_data, dict):
                        if 'fullFeed' in feed_data:
                            full_feed = feed_data['fullFeed']
                            if isinstance(full_feed, dict) and 'marketFF' in full_feed:
                                market_ff = full_feed['marketFF']
                                if isinstance(market_ff, dict):
                                    if 'ltpc' in market_ff:
                                        ltpc_data = market_ff['ltpc']
                                        if isinstance(ltpc_data, dict):
                                            ltp = ltpc_data.get('ltp')
                                            ltt = ltpc_data.get('ltt', 0)
                                            timestamp = datetime.fromtimestamp(int(ltt) / 1000, IST) if ltt else datetime.now(IST)
                                    if 'marketOHLC' in market_ff:
                                        market_ohlc = market_ff['marketOHLC']
                                        if isinstance(market_ohlc, dict) and 'ohlc' in market_ohlc:
                                            ohlc_list = market_ohlc['ohlc']
                                            i1_candles = [c for c in ohlc_list if c.get('interval') == 'I1']
                                            if i1_candles:
                                                ohlc_data = max(i1_candles, key=lambda c: c.get('ts', 0))
                        elif 'ltpc' in feed_data:
                            ltpc_data = feed_data['ltpc']
                            if isinstance(ltpc_data, dict):
                                ltp = ltpc_data.get('ltp')
                                ltt = ltpc_data.get('ltt', 0)
                                timestamp = datetime.fromtimestamp(int(ltt) / 1000, IST) if ltt else datetime.now(IST)

                    if ltp is None:
                        continue
                    ltp = float(ltp)
                    if timestamp is None:
                        timestamp = datetime.now(IST)
                    if hasattr(self, 'tick_handler'):
                        self.tick_handler(instrument_key, symbol, ltp, timestamp, ohlc_data)
                return
            if isinstance(message, dict):
                return
            # binary protobuf fallback omitted for brevity
        except Exception as e:
            logger.error(f"Error processing message: {e}")

    def on_error(self, error):
        logger.error(f"WebSocket error: {error}")
        self.connected = False

    def on_close(self, *args):
        logger.warning("WebSocket closed")
        self.connected = False
        self.running = False

    def disconnect(self):
        if self.streamer:
            self.streamer.disconnect()
        self.connected = False
        self.running = False

    def run(self):
        if not self.connect():
            return False
        try:
            while self.running:
                time.sleep(1)
        except KeyboardInterrupt:
            logger.info("Received keyboard interrupt")
        finally:
            self.disconnect()
        return True
```

## File: `MA_Stock_Trader/src/trading/live_trading/run_reversal.py`

```python
# Full file at: MA_Stock_Trader\src\trading\live_trading\run_reversal.py
# Key section - how SimpleStockStreamer is initialized:

from simple_data_streamer import SimpleStockStreamer

# ...

# Initialize data streamer
data_streamer = SimpleStockStreamer(instrument_keys, stock_symbols)

# Set tick handler
data_streamer.tick_handler = tick_handler_reversal

# ... pre-market IEP fetch, gap validation ...

# Connect to data stream
if data_streamer.connect():
    print("CONNECTED Data stream connected")
    # ... run the bot ...
    data_streamer.run()
```

## File: `MA_Stock_Trader/src/trading/live_trading/run_continuation.py`

```python
# Full file at: MA_Stock_Trader\src\trading\live_trading\run_continuation.py
# Key section - same pattern as reversal:

from simple_data_streamer import SimpleStockStreamer

# Initialize data streamer with all instruments initially
data_streamer = SimpleStockStreamer(instrument_keys, stock_symbols)

# Set tick handler
data_streamer.tick_handler = tick_handler_continuation

# ... pre-market IEP fetch, VAH calculation, gap validation ...

# Connect to data stream
if data_streamer.connect():
    print("CONNECTED Data stream connected")
    # ... run the bot ...
    data_streamer.run()
```

## File: `MA_Stock_Trader/src/utils/token_config_manager.py`

```python
# Full file at: MA_Stock_Trader\src\utils\token_config_manager.py
# Token is loaded from upstox_config.json:

class TokenConfigManager:
    def __init__(self, config_file: str = 'upstox_config.json'):
        self.config_file = config_file
        self._config_cache = {}
        self._last_modified = 0
        self._lock = threading.RLock()
        self._watcher_thread = None
        self._stop_watching = threading.Event()
        self._load_config()
        self._start_file_watcher()

    def get_token(self) -> Optional[str]:
        config = self.get_config()
        return config.get('access_token')

    def update_token(self, token: str) -> bool:
        with self._lock:
            config = self.get_config()
            config['access_token'] = token
            with open(self.config_file, 'w') as f:
                json.dump(config, f, indent=2)
            self._config_cache = config
            self._last_modified = os.stat(self.config_file).st_mtime
            return True
```

## File: `upstox_client SDK — MarketDataStreamerV3`

```python
# Installed at: site-packages/upstox_client/feeder/market_data_streamer_v3.py

class MarketDataStreamerV3(Streamer):
    def __init__(self, api_client=None, instrumentKeys=[], mode="ltpc"):
        super().__init__(api_client)
        self.api_client = api_client
        self.instrumentKeys = instrumentKeys
        self.mode = mode
        # ...subscription tracking...

    def connect(self):
        self.feeder = MarketDataFeederV3(
            api_client=self.api_client,
            instrumentKeys=self.instrumentKeys,
            mode=self.mode,
            on_open=self.handle_open,
            on_message=self.handle_message,
            on_error=self.handle_error,
            on_close=self.handle_close)
        self.feeder.connect()

    def handle_open(self, ws):
        self.disconnect_valid = False
        self.reconnect_in_progress = False
        self.reconnect_attempts = 0
        self.subscribe_to_initial_keys()
        self.emit(self.Event["OPEN"])
```

## File: `upstox_client SDK — MarketDataFeederV3 (the actual WebSocket)`

```python
# Installed at: site-packages/upstox_client/feeder/market_data_feeder_v3.py

class MarketDataFeederV3(Feeder):
    def connect(self):
        if self.ws and self.ws.sock:
            return

        sslopt = {
            "cert_reqs": ssl.CERT_NONE,
            "check_hostname": False,
        }
        ws_url = "wss://api.upstox.com/v3/feed/market-data-feed"
        headers = {'Authorization': self.api_client.configuration.auth_settings().get("OAUTH2")["value"]}
        self.ws = websocket.WebSocketApp(ws_url,
                                         header=headers,
                                         on_open=self.on_open,
                                         on_message=self.on_message,
                                         on_error=self.on_error,
                                         on_close=self.on_close)

        threading.Thread(target=self.ws.run_forever,
                         kwargs={"sslopt": sslopt}).start()

    def subscribe(self, instrumentKeys, mode=None):
        if self.ws and self.ws.sock:
            request = self.build_request(instrumentKeys, self.Method["SUBSCRIBE"], mode)
            self.ws.send(request, opcode=websocket.ABNF.OPCODE_BINARY)
        else:
            raise Exception("WebSocket is not open.")

    def build_request(self, instrumentKeys, method, mode=None):
        requestObj = {
            "guid": str(uuid.uuid4()),
            "method": method,
            "data": {
                "instrumentKeys": instrumentKeys,
            },
        }
        if mode is not None:
            requestObj["data"]["mode"] = mode
        return json.dumps(requestObj).encode('utf-8')
```

## File: `upstox_client SDK — Configuration`

```python
# Installed at: site-packages/upstox_client/configuration.py

class Configuration:
    def __init__(self, sandbox=False):
        self.access_token = ""
        # ...

    def auth_settings(self):
        return {
            'OAUTH2': {
                'type': 'oauth2',
                'in': 'header',
                'key': 'Authorization',
                'value': 'Bearer ' + self.access_token
            },
        }
```

## File: `MA_Stock_Trader/upstox_config.json`

```json
{
  "api_key": "6ec86817-5a40-4d0f-929f-45486fb7193c",
  "access_token": "eyJ...JWT...token",
  "api_secret": "5yqgvu4mst"
}
```

## File: `MA_Stock_Trader/src/trading/live_trading/config.py`

```python
from datetime import time, timedelta, datetime

MARKET_OPEN = time(13, 10)  # for testing
WINDOW_LENGTH = 5
PREP_START = (datetime.combine(datetime.today(), MARKET_OPEN) - timedelta(seconds=30)).time()
ENTRY_TIME = (datetime.combine(datetime.today(), MARKET_OPEN) + timedelta(minutes=WINDOW_LENGTH)).time()

MAX_POSITIONS = 2
ENTRY_SL_PCT = 0.04
MAX_RETRIES = 3
RETRY_DELAY_SECONDS = 5
WEBSOCKET_RECONNECT_DELAY = 5
MAX_WEBSOCKET_RETRIES = 10

PAPER_TRADING = True
```
