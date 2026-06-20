"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Typography,
  Box,
  Paper,
  Button,
  Card,
  CardContent,
  IconButton,
  CircularProgress,
  FormControl,
  FormLabel,
  RadioGroup,
  FormControlLabel,
  Radio,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
} from "@mui/material";
import {
  PlayArrow as StartIcon,
  Stop as StopIcon,
  Refresh as RefreshIcon,
} from "@mui/icons-material";
import { useAppState } from "@/lib/AppStateContext";
import StockTables from "./live-trading/StockTables";
import TerminalLogs from "./live-trading/TerminalLogs";
import {
  PY_API,
  POLL_INTERVAL,
  TradingMode,
  LiveStatus,
  BotSummary,
  StatusDot,
  Stat,
  cardSx,
  formatCountdown,
  secondsUntilIST,
  getNextEvent,
} from "./live-trading/live-trading-utils";


export default function LiveTrading() {
  const {} = useAppState();

  const [tradingMode, setTradingMode] = useState<TradingMode>("continuation");
  const [isStarting, setIsStarting] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState<LiveStatus | null>(null);
  const [countdown, setCountdown] = useState(0);
  const [logs, setLogs] = useState<string[]>([]);
  const logEndRef = useRef<HTMLDivElement>(null);
  const logContainerRef = useRef<HTMLDivElement>(null);
  const [userScrolledUp, setUserScrolledUp] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [marketTimes, setMarketTimes] = useState<{
    open: string;
    close: string;
  } | null>(null);
  const [capitalStats, setCapitalStats] = useState<{
    initial_capital: number;
    available_capital: number;
    open_position_value: number;
    realized_pnl: number;
  } | null>(null);

  const [cacheFreshness, setCacheFreshness] = useState<{
    is_fresh: boolean;
    latest_cache_date: string | null;
    latest_nse_date: string | null;
    days_behind: number | null;
    message: string;
  } | null>(null);
  const [showStaleDialog, setShowStaleDialog] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const r = await fetch(`/api/live?mode=${tradingMode}`);
      if (!r.ok) return;
      const data = await r.json();
      setStatus(data);
      if (data.logs) setLogs(data.logs);
    } catch {
      /* */
    }
  }, [tradingMode]);

  useEffect(() => {
    fetchStatus();
    intervalRef.current = setInterval(fetchStatus, POLL_INTERVAL);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchStatus]);

  useEffect(() => {
    function tick() {
      if (!status?.config || !status.running) {
        setCountdown(0);
        return;
      }
      const next = getNextEvent(
        status.config,
        status.preMarketComplete,
        status.running,
      );
      if (next && next.target) setCountdown(secondsUntilIST(next.target));
      else setCountdown(0);
    }
    tick();
    countdownRef.current = setInterval(tick, 1000);
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [status?.config, status?.running, status?.preMarketComplete]);

  useEffect(() => {
    let es: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout>;
    function connect() {
      es = new EventSource("/api/live/events");
      es.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.type === "log")
            setLogs((prev) => {
              const next = [...prev, `[${data.timestamp}] ${data.message}`];
              return next.length > 200 ? next.slice(-200) : next;
            });
        } catch {
          /* */
        }
      };
      es.onerror = () => {
        es?.close();
        reconnectTimer = setTimeout(connect, 3000);
      };
    }
    connect();
    return () => {
      es?.close();
      clearTimeout(reconnectTimer);
    };
  }, []);

  useEffect(() => {
    fetch(`${PY_API}/api/settings/market_open`)
      .then((r) => r.json())
      .then((d) => {
        fetch(`${PY_API}/api/settings/market_close`)
          .then((r) => r.json())
          .then((d2) =>
            setMarketTimes({
              open: d.value || "09:15",
              close: d2.value || "15:30",
            }),
          )
          .catch(() =>
            setMarketTimes({ open: d.value || "09:15", close: "15:30" }),
          );
      })
      .catch(() => setMarketTimes({ open: "09:15", close: "15:30" }));
    fetch(`${PY_API}/api/data/cache-freshness`)
      .then((r) => r.json())
      .then((d) => setCacheFreshness(d))
      .catch(() => {});
  }, []);

  // Poll capital stats on same interval as status
  useEffect(() => {
    function fetchCap() {
      fetch(`${PY_API}/api/trades/capital-stats`)
        .then(r => r.json())
        .then(d => setCapitalStats(d))
        .catch(() => {});
    }
    fetchCap();
    const id = setInterval(fetchCap, POLL_INTERVAL);
    return () => clearInterval(id);
  }, []);

  const doStart = async () => {
    setIsStarting(true);
    setError("");
    try {
      const listR = await fetch(`${PY_API}/api/stock-list/${tradingMode}/resolved`);
      const listD = await listR.json();
      const rawStocks = listD.stocks || [];
      if (rawStocks.length === 0) {
        setError(`No ${tradingMode} stocks saved.`);
        setIsStarting(false);
        return;
      }

      const symbols = rawStocks.map((s: any) => s.symbol);
      const keyR = await fetch(`${PY_API}/api/instrument-keys`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbols }),
      });
      const keyD = await keyR.json();
      const keyMap = keyD.keys || {};
      if (Object.keys(keyMap).length === 0) {
        setError("Could not resolve instrument keys.");
        setIsStarting(false);
        return;
      }

      const stocks = rawStocks.map((s: any) => ({
        symbol: s.symbol,
        instrumentKey: keyMap[s.symbol],
        previousClose: s.close ?? 0,
        declineDays: s.period ?? 0,
        situation:
          tradingMode === "reversal"
            ? s.trend_context === "uptrend"
              ? "reversal_s1"
              : "reversal_s2"
            : "continuation",
      }));

      const r = await fetch(`/api/live`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "start",
          mode: tradingMode,
          instruments: stocks.map((s: any) => s.instrumentKey),
          stocks,
        }),
      });
      const d = await r.json();
      if (!r.ok) {
        setError(d.error || "Failed to start");
        return;
      }
      await fetchStatus();
    } catch {
      setError("Could not connect to server");
    } finally {
      setIsStarting(false);
    }
  };

  const handleStart = async () => {
    if (!cacheFreshness) {
      await doStart();
      return;
    }
    if (cacheFreshness.is_fresh) {
      await doStart();
      return;
    }
    setShowStaleDialog(true);
  };

  const handleStartAnyway = async () => {
    setShowStaleDialog(false);
    await doStart();
  };

  const handleStop = async () => {
    setIsStopping(true);
    try {
      await fetch(`/api/live`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "stop", mode: tradingMode }),
      });
      await fetchStatus();
    } catch {
      setError("Could not connect to server");
    } finally {
      setIsStopping(false);
    }
  };

  const running = status?.running ?? false;
  const connected = status?.connected ?? false;
  const selectedMode: TradingMode =
    running && (status?.mode === "reversal" || status?.mode === "continuation")
      ? status.mode
      : tradingMode;
  const summary: BotSummary | null =
    selectedMode === "reversal"
      ? (status?.reversal ?? null)
      : (status?.continuation ?? null);
  const stockEntries = summary?.stockDetails
    ? Object.entries(summary.stockDetails)
    : [];
  const activeStates = [
    "initialized",
    "waiting_for_open",
    "gap_validated",
    "qualified",
    "selected",
    "waiting_for_entry",
    "entered",
  ];
  const terminalStates = ["rejected", "unsubscribed", "exited", "not_selected"];
  const activeStocks = stockEntries.filter(([, s]) =>
    activeStates.includes(s.state),
  );
  const rejectedStocks = stockEntries.filter(([, s]) =>
    terminalStates.includes(s.state),
  );

  return (
    <>

          <Box
            sx={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              mb: 3,
            }}
          >
            <Box>
              <Typography variant="h6" gutterBottom sx={{ fontWeight: 600 }}>
                Live Trading Control
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Start and stop the live trading bot.
              </Typography>
            </Box>
            {marketTimes && (
              <Box
                sx={{
                  p: 2,
                  backgroundColor: "#1e293b",
                  borderRadius: 2,
                  border: "1px solid #334155",
                }}
              >
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 3,
                    flexWrap: "wrap",
                  }}
                >
                  <Typography
                    variant="body2"
                    sx={{
                      color: "#ffffff",
                      fontFamily: "monospace",
                      fontSize: "0.85rem",
                    }}
                  >
                    Market Open:{" "}
                    <Box
                      component="span"
                      sx={{
                        color: "#fbbf24",
                        fontWeight: 700,
                        fontSize: "1.1rem",
                      }}
                    >
                      {marketTimes.open}
                    </Box>
                  </Typography>
                  <Typography
                    variant="body2"
                    sx={{
                      color: "#ffffff",
                      fontFamily: "monospace",
                      fontSize: "0.85rem",
                    }}
                  >
                    Market Close:{" "}
                    <Box
                      component="span"
                      sx={{
                        color: "#fbbf24",
                        fontWeight: 700,
                        fontSize: "1.1rem",
                      }}
                    >
                      {marketTimes.close}
                    </Box>
                  </Typography>
                  {cacheFreshness && (
                    <Typography
                      variant="body2"
                      sx={{
                        color: "#ffffff",
                        fontFamily: "monospace",
                        fontSize: "0.85rem",
                      }}
                    >
                      Cache:{" "}
                      <Box
                        component="span"
                        sx={{
                          color: cacheFreshness.is_fresh ? "#4ade80" : "#f59e0b",
                          fontWeight: 700,
                          fontSize: "1.1rem",
                        }}
                      >
                        {cacheFreshness.latest_cache_date
                          ? new Date(cacheFreshness.latest_cache_date).toLocaleDateString("en-GB", {
                              day: "2-digit",
                              month: "short",
                            })
                          : "No data"}
                      </Box>
                      {!cacheFreshness.is_fresh && (
                        <Box component="span" sx={{ color: "#ef4444", ml: 1, fontSize: "0.75rem" }}>
                          ⚠️
                        </Box>
                      )}
                    </Typography>
                  )}
                </Box>
                {capitalStats && (
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 3,
                      flexWrap: "wrap",
                      mt: 1.5,
                      pt: 1.5,
                      borderTop: "1px solid #334155",
                    }}
                  >
                    <Typography
                      variant="body2"
                      sx={{
                        color: "#ffffff",
                        fontFamily: "monospace",
                        fontSize: "0.85rem",
                      }}
                    >
                      Remaining:{" "}
                      <Box
                        component="span"
                        sx={{
                          color:
                            capitalStats.available_capital > 0
                              ? "#4ade80"
                              : "#ef4444",
                          fontWeight: 700,
                          fontSize: "1.1rem",
                        }}
                      >
                        ₹{capitalStats.available_capital.toFixed(0)}
                      </Box>
                    </Typography>
                    <Typography
                      variant="body2"
                      sx={{
                        color: "#ffffff",
                        fontFamily: "monospace",
                        fontSize: "0.85rem",
                      }}
                    >
                      In Use:{" "}
                      <Box
                        component="span"
                        sx={{
                          color: "#f59e0b",
                          fontWeight: 700,
                          fontSize: "1.1rem",
                        }}
                      >
                        ₹{capitalStats.open_position_value.toFixed(0)}
                      </Box>
                    </Typography>
                  </Box>
                )}
              </Box>
            )}
          </Box>

          {error && (
            <Paper
              sx={{
                p: 2,
                mb: 3,
                bgcolor: "#451a1a",
                border: "1px solid #7f1d1d",
                borderRadius: 2,
              }}
            >
              <Typography variant="body2" sx={{ color: "#fca5a5" }}>
                {error}
              </Typography>
            </Paper>
          )}

          {/* Stale cache warning dialog */}
          <Dialog
            open={showStaleDialog}
            onClose={() => setShowStaleDialog(false)}
            slotProps={{
              paper: {
                sx: {
                  bgcolor: "#1e293b",
                  color: "#e2e8f0",
                  border: "1px solid #7c3aed",
                  borderRadius: 2,
                  minWidth: 420,
                },
              },
            }}
          >
            <DialogTitle sx={{ fontWeight: 700, color: "#fbbf24" }}>
              Bhavcopy Data May Be Stale
            </DialogTitle>
            <DialogContent>
              <DialogContentText sx={{ color: "#cbd5e1", mb: 2 }}>
                {cacheFreshness?.message ?? "Cache data is outdated."}
              </DialogContentText>
              <Typography variant="body2" sx={{ color: "#94a3b8", fontFamily: "monospace" }}>
                Latest cache: <strong style={{ color: "#f1f5f9" }}>{cacheFreshness?.latest_cache_date ?? "N/A"}</strong>
              </Typography>
              <Typography variant="body2" sx={{ color: "#94a3b8", fontFamily: "monospace", mb: 2 }}>
                NSE latest: <strong style={{ color: "#f1f5f9" }}>{cacheFreshness?.latest_nse_date ?? "N/A"}</strong>
              </Typography>
              <Typography variant="body2" sx={{ color: "#94a3b8" }}>
                Prices and signals may be inaccurate without the latest data.
              </Typography>
            </DialogContent>
            <DialogActions sx={{ p: 2, gap: 1 }}>
              <Button
                onClick={() => { setShowStaleDialog(false); }}
                sx={{ color: "#94a3b8", textTransform: "none" }}
              >
                Cancel
              </Button>
              <Button
                onClick={handleStartAnyway}
                variant="outlined"
                sx={{
                  borderColor: "#f59e0b",
                  color: "#f59e0b",
                  textTransform: "none",
                  "&:hover": { borderColor: "#fbbf24", color: "#fbbf24" },
                }}
              >
                Start Anyway
              </Button>
              <Button
                onClick={() => {
                  setShowStaleDialog(false);
                  window.open("/scanner", "_self");
                }}
                variant="contained"
                sx={{
                  background: "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)",
                  textTransform: "none",
                  "&:hover": { background: "linear-gradient(135deg, #4f46e5 0%, #4338ca 100%)" },
                }}
              >
                Update Bhav Data
              </Button>
            </DialogActions>
          </Dialog>

          {status?.config && running && (
            <Box
              sx={{
                mb: 3,
                p: 2,
                borderRadius: 1,
                backgroundColor: "#1e293b",
                border: "1px solid #334155",
                display: "flex",
                alignItems: "center",
                gap: 3,
                flexWrap: "wrap",
              }}
            >
              <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                <StatusDot connected={connected} />
                <Typography
                  variant="caption"
                  sx={{
                    color: "#cbd5e1",
                    fontFamily: "monospace",
                    fontSize: "0.75rem",
                  }}
                >
                  {connected ? "LIVE" : "CONNECTING"}
                </Typography>
              </Box>
              {(() => {
                const next = getNextEvent(
                  status.config!,
                  status.preMarketComplete,
                  running,
                );
                if (!next) return null;
                return (
                  <>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                      <Typography
                        variant="caption"
                        sx={{
                          color: "#94a3b8",
                          fontFamily: "monospace",
                          fontSize: "0.7rem",
                        }}
                      >
                        Next:
                      </Typography>
                      <Chip
                        label={next.label}
                        size="small"
                        sx={{
                          backgroundColor: "#334155",
                          color:
                            next.label === "Trading active"
                              ? "#4ade80"
                              : "#818cf8",
                          fontWeight: 700,
                          fontSize: "0.7rem",
                          fontFamily: "monospace",
                          borderRadius: "4px",
                          height: 20,
                        }}
                      />
                    </Box>
                    {next.target && countdown > 0 && (
                      <Typography
                        variant="body2"
                        sx={{
                          color: "#fbbf24",
                          fontWeight: 700,
                          fontFamily: "monospace",
                          fontSize: "1rem",
                          letterSpacing: "1px",
                        }}
                      >
                        {formatCountdown(countdown)}
                      </Typography>
                    )}
                    {next.target && countdown <= 0 && (
                      <Typography
                        variant="body2"
                        sx={{
                          color: "#4ade80",
                          fontWeight: 700,
                          fontFamily: "monospace",
                          fontSize: "1rem",
                        }}
                      >
                        NOW
                      </Typography>
                    )}
                    <Box
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        gap: 2,
                        ml: "auto",
                      }}
                    >
                      <Typography
                        variant="caption"
                        sx={{
                          color: "#94a3b8",
                          fontFamily: "monospace",
                          fontSize: "0.7rem",
                        }}
                      >
                        Open:{" "}
                        <Box
                          component="span"
                          sx={{ color: "#e2e8f0", fontWeight: 600 }}
                        >
                          {status.config!.marketOpen}
                        </Box>
                      </Typography>
                      <Typography
                        variant="caption"
                        sx={{
                          color: "#94a3b8",
                          fontFamily: "monospace",
                          fontSize: "0.7rem",
                        }}
                      >
                        Prep:{" "}
                        <Box
                          component="span"
                          sx={{ color: "#e2e8f0", fontWeight: 600 }}
                        >
                          {status.config!.prepStart}
                        </Box>
                      </Typography>
                      <Typography
                        variant="caption"
                        sx={{
                          color: "#94a3b8",
                          fontFamily: "monospace",
                          fontSize: "0.7rem",
                        }}
                      >
                        Entry:{" "}
                        <Box
                          component="span"
                          sx={{ color: "#e2e8f0", fontWeight: 600 }}
                        >
                          {status.config!.entryTime}
                        </Box>
                      </Typography>
                    </Box>
                  </>
                );
              })()}
            </Box>
          )}

          <Box sx={{ display: "flex", gap: 4, mb: 3, flexWrap: "wrap" }}>
            <FormControl component="fieldset">
              <FormLabel
                component="legend"
                sx={{
                  color: "#94a3b8",
                  fontWeight: 600,
                  mb: 1.5,
                  fontSize: "0.75rem",
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                }}
              >
                Paper vs Real
              </FormLabel>
              <RadioGroup row value="paper">
                <FormControlLabel
                  value="paper"
                  control={
                    <Radio
                      sx={{
                        color: "#10b981",
                        "&.Mui-checked": { color: "#10b981" },
                      }}
                    />
                  }
                  label="Paper Trading"
                  sx={{
                    "& .MuiFormControlLabel-label": {
                      color: "#e2e8f0",
                      fontWeight: 500,
                      fontSize: "0.85rem",
                    },
                  }}
                />
                <FormControlLabel
                  value="real"
                  control={<Radio sx={{ color: "#64748b" }} />}
                  label="Real Trading"
                  onClick={() =>
                    alert(
                      "Real trading is not yet available. Only paper trading is supported.",
                    )
                  }
                  sx={{
                    "& .MuiFormControlLabel-label": {
                      color: "#4b5563",
                      fontWeight: 500,
                      fontSize: "0.85rem",
                    },
                  }}
                />
              </RadioGroup>
            </FormControl>

            <FormControl component="fieldset">
              <FormLabel
                component="legend"
                sx={{
                  color: "#f1f5f9",
                  fontWeight: 600,
                  mb: 1.5,
                  fontSize: "0.9rem",
                }}
              >
                Trading Mode
              </FormLabel>
              <RadioGroup
                row
                value={selectedMode}
                onChange={(e) => setTradingMode(e.target.value as TradingMode)}
                sx={{ gap: 4 }}
              >
                <FormControlLabel
                  value="continuation"
                  control={
                    <Radio
                      sx={{
                        color: "#10b981",
                        "&.Mui-checked": { color: "#10b981" },
                      }}
                    />
                  }
                  label="Continuation"
                  disabled={running}
                  sx={{
                    "& .MuiFormControlLabel-label": {
                      color:
                        running && selectedMode !== "continuation"
                          ? "#4b5563"
                          : "#e2e8f0",
                      fontWeight: 500,
                    },
                  }}
                />
                <FormControlLabel
                  value="reversal"
                  control={
                    <Radio
                      sx={{
                        color: "#f59e0b",
                        "&.Mui-checked": { color: "#f59e0b" },
                      }}
                    />
                  }
                  label="Reversal"
                  disabled={running}
                  sx={{
                    "& .MuiFormControlLabel-label": {
                      color:
                        running && selectedMode !== "reversal"
                          ? "#4b5563"
                          : "#e2e8f0",
                      fontWeight: 500,
                    },
                  }}
                />
              </RadioGroup>
            </FormControl>
          </Box>

          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 3,
              flexWrap: "wrap",
              mb: 3,
            }}
          >
            <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
              <StatusDot connected={running ? connected : null} />
              <Box>
                <Typography
                  variant="body2"
                  sx={{
                    color: "#f1f5f9",
                    fontWeight: 600,
                    fontFamily: "monospace",
                  }}
                >
                  {running
                    ? connected
                      ? "Connected"
                      : "Connecting..."
                    : "Stopped"}
                </Typography>
                {running && (
                  <Typography
                    variant="caption"
                    sx={{ color: "#64748b", fontFamily: "monospace" }}
                  >
                    {selectedMode === "reversal" ? "Reversal" : "Continuation"}{" "}
                    mode
                  </Typography>
                )}
              </Box>
            </Box>
            <Box>
              <Typography
                variant="caption"
                sx={{ color: "#64748b", fontFamily: "monospace" }}
              >
                Subscribed:{" "}
                <Box
                  component="span"
                  sx={{ color: "#f1f5f9", fontWeight: 600 }}
                >
                  {status?.subscribed ?? 0}
                </Box>
              </Typography>
            </Box>
            <Box sx={{ ml: "auto", display: "flex", gap: 1.5 }}>
              {!running ? (
                <Button
                  variant="contained"
                  onClick={handleStart}
                  disabled={isStarting || isStopping}
                  startIcon={
                    isStarting ? (
                      <CircularProgress size={18} sx={{ color: "#fff" }} />
                    ) : (
                      <StartIcon />
                    )
                  }
                  sx={{
                    background:
                      "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                    "&:hover": {
                      background:
                        "linear-gradient(135deg, #059669 0%, #047857 100%)",
                    },
                    "&:disabled": { background: "#374151" },
                    borderRadius: "8px",
                    px: 3,
                    py: 1.2,
                    fontWeight: 600,
                    textTransform: "none",
                  }}
                >
                  {isStarting ? "Starting..." : "Start Trading"}
                </Button>
              ) : (
                <Button
                  variant="contained"
                  onClick={handleStop}
                  disabled={isStarting || isStopping}
                  startIcon={
                    isStopping ? (
                      <CircularProgress size={18} sx={{ color: "#fff" }} />
                    ) : (
                      <StopIcon />
                    )
                  }
                  sx={{
                    background:
                      "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)",
                    "&:hover": {
                      background:
                        "linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)",
                    },
                    "&:disabled": { background: "#374151" },
                    borderRadius: "8px",
                    px: 3,
                    py: 1.2,
                    fontWeight: 600,
                    textTransform: "none",
                  }}
                >
                  {isStopping ? "Stopping..." : "Stop Trading"}
                </Button>
              )}
              <IconButton
                size="small"
                onClick={fetchStatus}
                sx={{ color: "#64748b" }}
              >
                <RefreshIcon fontSize="small" />
              </IconButton>
            </Box>
          </Box>

          {status?.paperTrader && (
            <Card sx={{ ...cardSx, mb: 3 }}>
              <CardContent sx={{ p: 3 }}>
                <Typography
                  variant="subtitle2"
                  sx={{
                    color: "#94a3b8",
                    mb: 2,
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                    fontSize: "0.75rem",
                  }}
                >
                  Paper Trader
                </Typography>
                <Box sx={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  <Stat
                    label="Trades"
                    value={String(status.paperTrader.totalTrades ?? 0)}
                  />
                  <Stat
                    label="Wins"
                    value={String(status.paperTrader.wins ?? 0)}
                    color="#10b981"
                  />
                  <Stat
                    label="Losses"
                    value={String(status.paperTrader.losses ?? 0)}
                    color="#ef4444"
                  />
                  <Stat
                    label="Win Rate"
                    value={`${(status.paperTrader.winRate ?? 0).toFixed(1)}%`}
                  />
                  <Stat
                    label="P&L"
                    value={`₹${(status.paperTrader.totalPnl ?? 0).toFixed(0)}`}
                    color={
                      (status.paperTrader.totalPnl ?? 0) >= 0
                        ? "#10b981"
                        : "#ef4444"
                    }
                  />
                  <Stat
                    label="Initial Capital"
                    value={`₹${(capitalStats?.initial_capital ?? status.paperTrader.initialCapital ?? 0).toFixed(0)}`}
                  />
                  <Stat
                    label="Available Capital"
                    value={`₹${(capitalStats?.available_capital ?? status.paperTrader.capital ?? 0).toFixed(0)}`}
                    color={
                      (capitalStats?.available_capital ?? status.paperTrader.capital ?? 0) > 0
                        ? "#10b981" : "#ef4444"
                    }
                  />
                </Box>
              </CardContent>
            </Card>
          )}

          {summary && (
            <Box sx={{ display: "flex", gap: 2, mb: 3 }}>
              <Card sx={{ flex: 1, ...cardSx }}>
                <CardContent sx={{ p: 2.5 }}>
                  <Typography
                    variant="caption"
                    sx={{
                      color:
                        selectedMode === "reversal" ? "#f59e0b" : "#10b981",
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.5px",
                    }}
                  >
                    {selectedMode === "reversal" ? "Reversal" : "Continuation"}
                  </Typography>
                  <Box sx={{ display: "flex", gap: 3, mt: 1 }}>
                    <Box>
                      <Typography
                        variant="h5"
                        sx={{ color: "#f1f5f9", fontWeight: 700 }}
                      >
                        {activeStocks.length}
                      </Typography>
                      <Typography variant="caption" sx={{ color: "#64748b" }}>
                        Active
                      </Typography>
                    </Box>
                    <Box>
                      <Typography
                        variant="h5"
                        sx={{ color: "#10b981", fontWeight: 700 }}
                      >
                        {summary.enteredPositions}
                      </Typography>
                      <Typography variant="caption" sx={{ color: "#64748b" }}>
                        Entered
                      </Typography>
                    </Box>
                    <Box>
                      <Typography
                        variant="h5"
                        sx={{ color: "#ef4444", fontWeight: 700 }}
                      >
                        {rejectedStocks.length}
                      </Typography>
                      <Typography variant="caption" sx={{ color: "#64748b" }}>
                        Rejected
                      </Typography>
                    </Box>
                  </Box>
                </CardContent>
              </Card>
            </Box>
          )}

          <StockTables
            active={activeStocks}
            rejected={rejectedStocks}
            running={running}
          />
          <TerminalLogs
            logs={logs}
            running={running}
            userScrolledUp={userScrolledUp}
            setUserScrolledUp={setUserScrolledUp}
            logContainerRef={logContainerRef}
            logEndRef={logEndRef}
          />
    </>
  );
}
