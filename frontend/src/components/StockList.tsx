"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Box, Typography, Card, CardContent, Button, IconButton, Tooltip, Chip, Grid,
} from "@mui/material";
import {
  Delete as DeleteIcon,
  DeleteSweep as ClearIcon,
  TrendingUp as UpIcon,
  TrendingDown as DownIcon,
} from "@mui/icons-material";

const API = "http://127.0.0.1:8001";

interface StockItem {
  id: number; list_type: string; symbol: string; close: number | null;
  trend_context: string | null; period: number | null;
  depth_pct: number | null; added_at: string;
}

export default function StockList() {
  const [contStocks, setContStocks] = useState<StockItem[]>([]);
  const [revStocks, setRevStocks] = useState<StockItem[]>([]);
  const [status, setStatus] = useState("");
  const statusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showStatus = (msg: string) => {
    setStatus(msg);
    if (statusTimer.current) clearTimeout(statusTimer.current);
    statusTimer.current = setTimeout(() => setStatus(""), 3000);
  };

  const fetchLists = useCallback(async () => {
    try {
      const [cr, rr] = await Promise.all([
        fetch(`${API}/api/stock-list/continuation`).then(r => r.json()),
        fetch(`${API}/api/stock-list/reversal`).then(r => r.json()),
      ]);
      setContStocks(cr.stocks || []);
      setRevStocks(rr.stocks || []);
    } catch {
      showStatus("Failed to load stock lists");
    }
  }, []);

  useEffect(() => { fetchLists(); }, [fetchLists]);

  const removeStock = async (listType: string, symbol: string) => {
    try {
      await fetch(`${API}/api/stock-list/${listType}/${symbol}`, { method: "DELETE" });
      await fetchLists();
      showStatus(`Removed ${symbol}`);
    } catch {
      showStatus(`Failed to remove ${symbol}`);
    }
  };

  const clearList = async (listType: string) => {
    try {
      const r = await fetch(`${API}/api/stock-list/${listType}`, { method: "DELETE" });
      const d = await r.json();
      await fetchLists();
      showStatus(`Cleared ${d.count} stocks`);
    } catch {
      showStatus(`Failed to clear ${listType} list`);
    }
  };

  const cardSx = (color: string) => ({
    background: "linear-gradient(135deg, #111111 0%, #1a1a1a 100%)",
    border: "1px solid rgba(255,255,255,0.06)",
    borderLeft: `3px solid ${color}`,
    borderRadius: 2,
    height: "100%",
    display: "flex",
    flexDirection: "column" as const,
  });

  const StockCard = ({ title, icon, color, stocks, listType, emptyMsg }: any) => (
    <Card sx={cardSx(color)}>
      <CardContent sx={{ p: 0, display: "flex", flexDirection: "column", height: "100%" }}>
        <Box sx={{
          px: 2, py: 1.5,
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
            {icon}
            <Typography sx={{ fontWeight: 600, color: "#f8fafc", fontSize: "0.95rem" }}>
              {title}
            </Typography>
            <Chip
              label={stocks.length.toString()}
              size="small"
              sx={{
                bgcolor: `${color}20`, color, fontWeight: 700,
                border: `1px solid ${color}40`, height: 20, fontSize: "0.7rem",
                minWidth: 28, "& .MuiChip-label": { px: 0.5 },
              }}
            />
          </Box>
        </Box>

        <Box sx={{ height: 2, bgcolor: `${color}15`, mx: 2, mb: 0.5 }} />

        {stocks.length === 0 ? (
          <Box sx={{ p: 3, textAlign: "center", flex: 1 }}>
            <Typography sx={{ color: "#475569", fontSize: "0.85rem" }}>
              {emptyMsg}
            </Typography>
          </Box>
        ) : (
          <Box sx={{ overflow: "auto", flex: 1 }}>
            {stocks.map((stock: StockItem, i: number) => (
              <Box key={stock.id} sx={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                px: 2, py: 1.15,
                borderBottom: i < stocks.length - 1 ? "1px solid rgba(255,255,255,0.03)" : "none",
                transition: "all 0.15s ease",
                "&:hover": {
                  bgcolor: "rgba(255,255,255,0.015)",
                  "& .delete-btn": { opacity: 1 },
                },
              }}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flex: 1, minWidth: 0 }}>
                  <Typography sx={{
                    color: "#f1f5f9", fontWeight: 600, fontSize: "0.875rem",
                    fontFamily: '"SF Mono", "Fira Code", monospace',
                    minWidth: 80, overflow: "hidden", textOverflow: "ellipsis",
                  }}>
                    {stock.symbol}
                  </Typography>
                  <Typography sx={{
                    color: "#94a3b8", fontSize: "0.8rem",
                    fontFamily: '"SF Mono", "Fira Code", monospace',
                    minWidth: 65,
                  }}>
                    ₹{stock.close?.toFixed(2) ?? "—"}
                  </Typography>
                  {listType === "continuation" && stock.depth_pct != null && (
                    <Typography sx={{
                      color: "#64748b", fontSize: "0.75rem",
                      fontFamily: '"SF Mono", "Fira Code", monospace',
                    }}>
                      {stock.depth_pct.toFixed(1)}%
                    </Typography>
                  )}
                  {listType === "reversal" && (
                    <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
                      {stock.trend_context && (
                        <Typography sx={{
                          color: "#f59e0b", fontSize: "0.7rem", fontWeight: 500,
                          letterSpacing: "0.02em",
                        }}>
                          {stock.trend_context}
                        </Typography>
                      )}
                      {stock.period != null && (
                        <Typography sx={{
                          color: "#64748b", fontSize: "0.75rem",
                          fontFamily: '"SF Mono", "Fira Code", monospace',
                        }}>
                          {stock.period}d
                        </Typography>
                      )}
                    </Box>
                  )}
                </Box>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <Typography sx={{
                    color: "#c2c2c2", fontSize: "0.65rem", whiteSpace: "nowrap",
                  }}>
                    {stock.added_at ? new Date(stock.added_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) : ""}
                  </Typography>
                  <Tooltip title={`Remove ${stock.symbol}`}>
                    <IconButton
                      className="delete-btn"
                      size="small"
                      onClick={() => removeStock(listType, stock.symbol)}
                      sx={{
                        color: "#475569", opacity: 0, transition: "opacity 0.15s ease",
                        p: 0.3, "&:hover": { color: "#ef4444", bgcolor: "rgba(239,68,68,0.1)" },
                      }}
                    >
                      <DeleteIcon sx={{ fontSize: 14 }} />
                    </IconButton>
                  </Tooltip>
                </Box>
              </Box>
            ))}
          </Box>
        )}

        {stocks.length > 0 && (
          <Box sx={{
            px: 2, py: 0.75,
            borderTop: "1px solid rgba(255,255,255,0.04)",
            display: "flex", justifyContent: "flex-end",
          }}>
            <Button
              size="small" disabled={stocks.length === 0}
              onClick={() => clearList(listType)}
              sx={{
                color: "#999999", fontSize: "0.7rem", textTransform: "none",
                fontWeight: 500, minWidth: 0, p: 0.5,
                "&:hover": { color: "#ef4444", bgcolor: "transparent" },
              }}
            >
              Clear all
            </Button>
          </Box>
        )}
      </CardContent>
    </Card>
  );

  return (
    <Box>
      {status && (
        <Box sx={{
          mb: 1.5, px: 2, py: 0.75,
          borderRadius: 1, display: "inline-block",
          bgcolor: status.includes("fail") ? "rgba(239,68,68,0.1)" : "rgba(16,185,129,0.1)",
        }}>
          <Typography sx={{
            color: status.includes("fail") ? "#ef4444" : "#10b981",
            fontSize: "0.8rem", fontWeight: 500,
          }}>
            {status}
          </Typography>
        </Box>
      )}

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 7 }}>
          <StockCard
            title="Continuation"
            icon={<UpIcon sx={{ color: "#10b981", fontSize: 18 }} />}
            color="#10b981"
            stocks={contStocks}
            listType="continuation"
            emptyMsg="No continuation stocks saved. Run a scan and tap + to add."
          />
        </Grid>
        <Grid size={{ xs: 12, md: 5 }}>
          <StockCard
            title="Reversal"
            icon={<DownIcon sx={{ color: "#f59e0b", fontSize: 18 }} />}
            color="#f59e0b"
            stocks={revStocks}
            listType="reversal"
            emptyMsg="No reversal stocks saved. Run a scan and tap + to add."
          />
        </Grid>
      </Grid>
    </Box>
  );
}
