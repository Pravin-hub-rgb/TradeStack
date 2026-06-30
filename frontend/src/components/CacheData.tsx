"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Box,
  Typography,
  Button,
  Card,
  CardContent,
  Grid,
  Chip,
  Alert,
} from "@mui/material";
import ToastNotification from "@/components/ToastNotification";
import TokenDialog from "@/components/TokenDialog";
import CandleProgress from "./CandleProgress";
import {
  Refresh as RefreshIcon,
  Storage as StorageIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  Info as InfoIcon,
  CloudDownload as CloudDownloadIcon,
  CheckCircleOutlined as CheckCircleOutlinedIcon,
} from "@mui/icons-material";

const API = "http://127.0.0.1:8001";

interface CacheInfo {
  stock_count: number;
  total_size_mb: number;
  latest_date: string | null;
}

interface OperationStatus {
  type: string;
  status: "running" | "completed" | "error";
  progress: number;
  message: string;
  error?: string;
  result?: any;
  logs?: string[];
}

const CacheData: React.FC = () => {
  const [cacheInfo, setCacheInfo] = useState<CacheInfo | null>(null);
  const [operationStatus, setOperationStatus] = useState<OperationStatus | null>(null);
  const [operationId, setOperationId] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [logLines, setLogLines] = useState<string[]>([]);
  const terminalRef = useRef<HTMLDivElement>(null);
  const [showTokenDialog, setShowTokenDialog] = useState(false);
  const [isDownloadingHistorical, setIsDownloadingHistorical] = useState(false);
  const [checkingToken, setCheckingToken] = useState(false);

  interface CacheFreshness {
    is_fresh: boolean;
    latest_cache_date: string | null;
    latest_nse_date: string | null;
    days_behind: number | null;
    message: string;
  }

  const [cacheFreshness, setCacheFreshness] = useState<CacheFreshness | null>(null);
  const [freshnessLoading, setFreshnessLoading] = useState(true);

  useEffect(() => {
    if (operationStatus?.logs) {
      setLogLines(operationStatus.logs);
    }
  }, [operationStatus?.logs]);

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [logLines]);

  const [toasts, setToasts] = useState<
    Array<{ id: string; message: string; type: "success" | "error" | "warning"; position: number }>
  >([]);

  const checkFreshness = async () => {
    try {
      const res = await fetch(`${API}/api/data/cache-freshness`);
      const data = await res.json();
      setCacheFreshness(data);
    } catch {
      // ignore
    } finally {
      setFreshnessLoading(false);
    }
  };

  useEffect(() => {
    loadCacheInfo();
    checkFreshness();
    const interval = setInterval(checkFreshness, 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    let interval: number | null = null;
    if (operationId && operationStatus?.status === "running") {
      interval = window.setInterval(() => {
        checkOperationStatus();
      }, 2000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [operationId, operationStatus?.status]);

  const loadCacheInfo = async () => {
    try {
      const response = await fetch(`${API}/api/data/cache-info`);
      // Try to parse, handle non-JSON gracefully
      const text = await response.text();
      try {
        const data = JSON.parse(text);
        setCacheInfo(data);
      } catch {
        console.error("Invalid JSON from cache-info");
      }
    } catch (error) {
      console.error("Failed to load cache info:", error);
    }
  };

  const hasSufficientData = useCallback(() => {
    if (!cacheInfo || !cacheInfo.latest_date) return false;
    const rowsPerStock = cacheInfo.stock_count > 0 ? Math.round(cacheInfo.total_size_mb / cacheInfo.stock_count * 100) : 0;
    const earliest = new Date(cacheInfo.latest_date);
    earliest.setDate(earliest.getDate() - 120);
    const hasEnoughRows = cacheInfo.stock_count > 100;
    return hasEnoughRows;
  }, [cacheInfo]);

  const handleDownloadHistorical = async () => {
    setCheckingToken(true);
    try {
      const tokenResp = await fetch(`${API}/api/token/status`);
      const tokenData = await tokenResp.json();
      if (!tokenData.exists) {
        setShowTokenDialog(true);
        return;
      }
      setIsDownloadingHistorical(true);
      const resp = await fetch(`${API}/api/data/download-historical`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await resp.json();
      if (data.status === "error") {
        if (data.message?.includes("token")) {
          setShowTokenDialog(true);
        } else {
          showToast(data.message || "Failed to start download", "error");
        }
        setIsDownloadingHistorical(false);
        return;
      }
      if (data.status === "started") {
        setOperationId(data.operation_id);
        setOperationStatus({
          type: "historical_download",
          status: "running",
          progress: 0,
          message: "Downloading historical data...",
        });
      }
    } catch {
      showToast("Failed to connect to server", "error");
    } finally {
      setCheckingToken(false);
    }
  };

  const handleUpdateBhavcopy = async () => {
    setIsUpdating(true);
    try {
      const response = await fetch(`${API}/api/data/update-bhavcopy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await response.json();
      if (data.status === "started") {
        setOperationId(data.operation_id);
        setOperationStatus({
          type: "bhavcopy_update",
          status: "running",
          progress: 0,
          message: "Bhavcopy data update started",
        });
      } else if (data.status === "up_to_date") {
        setIsUpdating(false);
        showToast(data.message || "Cache is already up to date", "success");
        // Refresh freshness to reflect latest state
        checkFreshness();
      }
    } catch (error) {
      console.error("Failed to start bhavcopy update:", error);
      setIsUpdating(false);
    }
  };

  const checkOperationStatus = async () => {
    if (!operationId) return;
    try {
      const response = await fetch(`${API}/api/data/status/${operationId}`);
      const data = await response.json();
      setOperationStatus(data);
      if (data.status === "completed") {
        setIsUpdating(false);
        setIsDownloadingHistorical(false);
        setOperationId(null);
        const label = data.type === "fill_gaps"
          ? `Cache updated: ${data.result?.dates_filled} date(s), ${data.result?.total_updated} stocks`
          : data.type === "historical_download"
          ? "Historical data"
          : `Cache updated for ${data.result?.date}`;
        showToast(data.result?.updated
          ? `${label}: ${data.result.updated} stocks updated`
          : label,
          "success"
        );
        loadCacheInfo();
      } else if (data.status === "error") {
        setIsUpdating(false);
        setIsDownloadingHistorical(false);
        setOperationId(null);
        showToast(data.error || "Operation failed", "error");
      }
    } catch (error) {
      console.error("Failed to check operation status:", error);
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "Never";
    return new Date(dateString).toLocaleString();
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "running": return "info";
      case "completed": return "success";
      case "error": return "error";
      default: return "default";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed": return <CheckCircleIcon />;
      case "error": return <ErrorIcon />;
      default: return <InfoIcon />;
    }
  };

  const showToast = (message: string, type: "success" | "error" | "warning" = "success") => {
    const toastId = `toast-${Date.now()}-${Math.random()}`;
    const occupiedPositions = toasts.map((t) => t.position).sort((a, b) => a - b);
    let position = 0;
    for (let i = 0; i < occupiedPositions.length; i++) {
      if (occupiedPositions[i] !== i) {
        position = i;
        break;
      }
    }
    if (position === 0 && occupiedPositions.length > 0) {
      position = occupiedPositions.length;
    }
    setToasts((prev) => [...prev, { id: toastId, message, type, position }]);
  };

  const removeToast = (toastId: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== toastId));
  };

  return (
    <Box sx={{ minHeight: "100vh", p: 3 }}>
      <Grid container spacing={3}>
        {/* Cache Information Card */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Card sx={{ height: "100%" }}>
            <CardContent>
              <Box sx={{ display: "flex", alignItems: "center", mb: 2 }}>
                <StorageIcon sx={{ mr: 1, color: "primary.main" }} />
                <Typography variant="h6">Cache Status</Typography>
              </Box>
              {cacheInfo ? (
                <Box>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                    Last date on cache:
                  </Typography>
                  <Typography variant="h6" sx={{ fontWeight: 600 }}>
                    {cacheInfo.latest_date
                      ? new Date(cacheInfo.latest_date).toLocaleDateString("en-GB", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })
                      : "No data"}
                  </Typography>
                  <Box sx={{ mt: 2 }}>
                    <Typography variant="body2" color="text.secondary">
                      Total Files: <strong>{cacheInfo.stock_count}</strong>
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Cache Size:{" "}
                      <strong>
                        {typeof cacheInfo.total_size_mb === "number"
                          ? `${cacheInfo.total_size_mb.toFixed(2)} MB`
                          : "N/A"}
                      </strong>
                    </Typography>
                  </Box>
                </Box>
              ) : (
                <Typography>Loading cache information...</Typography>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Update Controls Card */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Card sx={{ height: "100%" }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Update Market Data
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                Download the latest NSE bhavcopy data and update the local cache. This ensures your
                scanner has the most recent market information.
              </Typography>
              <Button
                variant="contained"
                startIcon={cacheFreshness?.is_fresh ? <CheckCircleOutlinedIcon /> : <RefreshIcon />}
                onClick={handleUpdateBhavcopy}
                disabled={isUpdating || freshnessLoading || cacheFreshness?.is_fresh === true}
                fullWidth
                sx={{ mb: 2 }}
                title={cacheFreshness?.is_fresh ? cacheFreshness.message : "Check for new market data"}
              >
                {isUpdating ? "Updating..." : cacheFreshness?.is_fresh ? "Up to Date" : "Update Bhavcopy Data"}
              </Button>
              {cacheFreshness?.is_fresh && (
                <Typography variant="caption" sx={{ display: "block", mb: 2, color: "#4ade80", textAlign: "center" }}>
                  {cacheFreshness.message}
                </Typography>
              )}
              <Button
                variant="outlined"
                startIcon={isDownloadingHistorical ? <CloudDownloadIcon sx={{ animation: "spin 1s linear infinite" }} /> : <CloudDownloadIcon />}
                onClick={handleDownloadHistorical}
                disabled={isUpdating || isDownloadingHistorical || checkingToken || hasSufficientData()}
                fullWidth
                sx={{ mb: 2, borderColor: "rgba(99, 102, 241, 0.4)", color: "primary.main" }}
              >
                {isDownloadingHistorical ? "Downloading..." : checkingToken ? "Checking..." : "Download Data"}
              </Button>
              <Typography variant="caption" color="text.secondary">
                Downloads 180 calendar days (~120 trading days) of historical data for all stocks via Upstox API.
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
                Recommended: Run once on a fresh install. Requires a valid Upstox access token.
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        {/* Operation Status */}
        {operationStatus && (
          <Grid size={{ xs: 12 }}>
            <Card>
              <CardContent>
                <Box sx={{ display: "flex", alignItems: "center", mb: 2 }}>
                  {getStatusIcon(operationStatus.status)}
                  <Typography variant="h6" sx={{ ml: 1 }}>
                    Operation Status
                  </Typography>
                  <Chip
                    label={operationStatus.status.toUpperCase()}
                    color={getStatusColor(operationStatus.status)}
                    size="small"
                    sx={{ ml: "auto" }}
                  />
                </Box>
                <Typography variant="body1" sx={{ mb: 2 }}>
                  {operationStatus.message}
                </Typography>
                {operationStatus.status === "running" && (
                  <Box sx={{ mb: 1 }}>
                    <CandleProgress progress={operationStatus.progress} />
                  </Box>
                )}
                {operationStatus.error && (
                  <Alert severity="error" sx={{ mt: 2 }}>
                    {operationStatus.error}
                  </Alert>
                )}
              </CardContent>
            </Card>
          </Grid>
        )}
      </Grid>

      {/* Terminal Logs */}
      {operationStatus && logLines.length > 0 && (
        <Card sx={{ mt: 3 }}>
          <CardContent sx={{ p: 2, "&:last-child": { pb: 2 } }}>
            <Box sx={{ display: "flex", alignItems: "center", mb: 1, gap: 1 }}>
              <Box sx={{ width: 10, height: 10, borderRadius: "50%", bgcolor: operationStatus.status === "running" ? "#10b981" : operationStatus.status === "completed" ? "#6366f1" : "#ef4444" }} />
              <Typography variant="caption" sx={{ color: "#94a3b8", fontWeight: 600, letterSpacing: "0.5px", textTransform: "uppercase" }}>
                Update Log
              </Typography>
              <Typography variant="caption" sx={{ ml: "auto", color: "#64748b" }}>
                {logLines.length} lines
              </Typography>
            </Box>
            <Box
              ref={terminalRef}
              sx={{
                bgcolor: "#0a0a0a",
                border: "1px solid #1e293b",
                borderRadius: 2,
                p: 2,
                height: 300,
                overflowY: "auto",
                fontFamily: '"JetBrains Mono", "Fira Code", "Consolas", monospace',
                fontSize: "0.75rem",
                lineHeight: 1.6,
                "&::-webkit-scrollbar": { width: 6 },
                "&::-webkit-scrollbar-track": { background: "#0a0a0a" },
                "&::-webkit-scrollbar-thumb": { background: "#1e293b", borderRadius: 3 },
              }}
            >
              {logLines.map((line, i) => (
                <Box
                  key={i}
                  sx={{
                    color: line.includes("Done") ? "#10b981"
                      : line.includes("Failed") || line.includes("error") ? "#ef4444"
                      : line.includes("Updated cache") ? "#60a5fa"
                      : line.includes("Progress") ? "#94a3b8"
                      : "#64748b",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-all",
                  }}
                >
                  {line}
                </Box>
              ))}
            </Box>
          </CardContent>
        </Card>
      )}

      {/* Token Dialog */}
      <TokenDialog
        open={showTokenDialog}
        onClose={() => setShowTokenDialog(false)}
        onTokenSaved={() => {
          showToast("Token saved and validated successfully!", "success");
          setTimeout(() => handleDownloadHistorical(), 500);
        }}
      />

      {/* Toast Notifications */}
      {toasts.map((toast) => (
        <Box
          key={toast.id}
          sx={{
            position: "fixed",
            bottom: 24 + toast.position * 60,
            left: 24,
            zIndex: 9999,
            minWidth: 450,
            maxWidth: 600,
            animation: "slideInFromLeft 0.3s ease-out both",
          }}
        >
          <ToastNotification
            message={toast.message}
            type={toast.type}
            onClose={() => removeToast(toast.id)}
            duration={3500}
          />
        </Box>
      ))}

      <style>
        {`
          @keyframes slideInFromLeft {
            from { transform: translateX(-120%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
          }
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}
      </style>
    </Box>
  );
};

export default CacheData;
