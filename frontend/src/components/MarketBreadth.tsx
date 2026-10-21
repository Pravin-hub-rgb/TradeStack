"use client";

import { useState, useEffect } from "react";
import {
  Typography, Box, Paper, Button, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, Card, CardContent,
  Chip, Alert,
} from "@mui/material";
import { Refresh as RefreshIcon } from "@mui/icons-material";
import CandleProgress from "./CandleProgress";
import { PY_API } from "@/lib/api";

const API = PY_API;

interface BreadthResult {
  date: string;
  up_4_5_pct: number;
  down_4_5_pct: number;
  up_20_pct_5d: number;
  down_20_pct_5d: number;
  above_20ma: number;
  below_20ma: number;
  above_50ma: number;
  below_50ma: number;
}

interface BreadthBias {
  date: string | null;
  bias: string;
  setup_preference: string;
  size_multiplier: number;
  easy_day: boolean;
  risk_level: string;
  reasoning: string[];
  warnings: string[];
  action_plan: string;
  readings: {
    up_4_5: number;
    down_4_5: number;
    up_20_5d: number;
    down_20_5d: number;
    above_20ma: number;
    below_20ma: number;
    above_50ma: number;
    below_50ma: number;
  } | null;
  phase: string;
  cycle: string;
  divergence: string;
}

const getUp45Color = (value: number): string => {
  if (value < 50) return "#ff7300ff";
  if (value >= 50 && value <= 69) return "#ff9900ff";
  if (value >= 70 && value <= 89) return "#ffcd00";
  if (value >= 90 && value <= 109) return "#eee418";
  if (value >= 110 && value <= 129) return "#cae627";
  if (value >= 130 && value <= 149) return "#7ec019";
  if (value >= 150) return "#2A9915";
  return "#B22222";
};

const getDown45Color = (value: number): string => {
  if (value < 35) return "#2A9915";
  if (value >= 35 && value < 50) return "#7ec019";
  if (value >= 50 && value <= 65) return "#eee418";
  if (value >= 66 && value <= 99) return "#ffcd00";
  if (value > 100) return "#ff7300ff";
  return "#2A9915";
};

const getUp20Color = (value: number): string => {
  if (value < 25) return "#ff7300ff";
  if (value >= 25 && value <= 37) return "#FF8C00";
  if (value >= 38 && value <= 50) return "#32CD32";
  if (value > 50) return "#2A9915";
  return "#ff7300ff";
};

const getDown20Color = (value: number): string => {
  if (value < 20) return "#ffffff";
  if (value >= 20 && value < 30) return "rgba(255, 187, 102, 0.6)";
  if (value >= 30 && value <= 50) return "rgba(255, 140, 0, 0.4)";
  if (value > 50) return "#ff7300ff";
  return "#ffffff";
};

const getAbove20MAColor = (value: number): string => {
  if (value < 200) return "#ff7300ff";
  if (value >= 200 && value < 500) return "#ff9900ff";
  if (value >= 500 && value < 800) return "#ffcd00";
  if (value >= 800 && value < 900) return "#eee418";
  if (value >= 900 && value < 1200) return "#cae627";
  if (value >= 1200 && value < 1400) return "#7ec019";
  if (value >= 1400) return "#2A9915";
  return "#ff7300ff";
};

const getBelow20MAColor = (value: number): string => {
  if (value < 200) return "#2A9915";
  if (value >= 200 && value < 500) return "#7ec019";
  if (value >= 500 && value < 800) return "#cae627";
  if (value >= 800 && value < 900) return "#eee418";
  if (value >= 900 && value < 1200) return "#ffcd00";
  if (value >= 1200 && value < 1400) return "#ff9900ff";
  if (value >= 1400) return "#ff7300ff";
  return "#2A9915";
};

const getAbove50MAColor = (value: number): string => {
  if (value < 200) return "#ff7300ff";
  if (value >= 200 && value < 500) return "#ff9900ff";
  if (value >= 500 && value < 800) return "#ffcd00";
  if (value >= 800 && value < 900) return "#eee418";
  if (value >= 900 && value < 1200) return "#cae627";
  if (value >= 1200 && value < 1400) return "#7ec019";
  if (value >= 1400) return "#2A9915";
  return "#ff7300ff";
};

const getBelow50MAColor = (value: number): string => {
  if (value < 200) return "#2A9915";
  if (value >= 200 && value < 500) return "#7ec019";
  if (value >= 500 && value < 800) return "#cae627";
  if (value >= 800 && value < 900) return "#eee418";
  if (value >= 900 && value < 1200) return "#ffcd00";
  if (value >= 1200 && value < 1400) return "#ff9900ff";
  if (value >= 1400) return "#ff7300ff";
  return "#2A9915";
};

const cellSx = (bgColor: string) => ({
  backgroundColor: bgColor,
  color: "#000000",
  fontWeight: "bold",
  borderBottom: "1px solid black",
  borderRight: "1px solid black",
  textAlign: "center" as const,
  fontSize: "0.9rem",
  py: "2px",
});

const biasColor: Record<string, string> = {
  AVOID: "#ef4444",
  REVERSALS: "#f59e0b",
  CONTINUATIONS: "#10b981",
  FLEXIBLE: "#94a3b8",
};

function BiasBox({ bias }: { bias: BreadthBias }) {
  const sizePercent = Math.round(bias.size_multiplier * 100);
  const color = biasColor[bias.bias] || "#94a3b8";

  return (
    <Card sx={{
      background: "linear-gradient(135deg, #111111 0%, #1a1a1a 100%)",
      border: "1px solid rgba(255,255,255,0.1)",
      mb: 3,
    }}>
      <CardContent sx={{ p: 3 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 0.5 }}>
          <Typography variant="h6" sx={{ color, fontWeight: 700 }}>
            {bias.bias}
          </Typography>
          {bias.easy_day && (
            <Chip label="EASY DAY" size="small" sx={{ fontSize: "0.65rem", height: 20, bgcolor: "rgba(16,185,129,0.12)", color: "#10b981", border: "1px solid rgba(16,185,129,0.3)" }} />
          )}
          {!bias.easy_day && sizePercent > 0 && (
            <Chip label="HARD DAY" size="small" sx={{ fontSize: "0.65rem", height: 20, bgcolor: "rgba(245,158,11,0.12)", color: "#f59e0b", border: "1px solid rgba(245,158,11,0.3)" }} />
          )}
          <Chip label={`Risk: ${bias.risk_level}`} size="small" sx={{ fontSize: "0.65rem", height: 20, bgcolor: "rgba(255,255,255,0.06)", color: "#94a3b8", border: "1px solid rgba(255,255,255,0.1)" }} />
          {bias.date && (
            <Typography variant="body2" sx={{ color: "#64748b", ml: "auto" }}>{bias.date}</Typography>
          )}
        </Box>

        <Box sx={{ display: "flex", gap: 4, mt: 2 }}>
          <Box>
            <Typography variant="caption" sx={{ color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px", fontSize: "0.65rem" }}>Size</Typography>
            <Typography variant="body2" sx={{ color: sizePercent === 0 ? "#ef4444" : "#f1f5f9", fontWeight: 600, fontFamily: "monospace" }}>{sizePercent}%</Typography>
          </Box>
        </Box>

        {(bias.reasoning.length > 0 || bias.warnings.length > 0) && (
          <Box sx={{ mt: 1.5, pt: 1.5, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
            {bias.reasoning.map((r, i) => (
              <Typography key={`r-${i}`} variant="body2" sx={{ color: "#94a3b8", fontSize: "0.8rem", mb: 0.3 }}>
                {r}
              </Typography>
            ))}
            {bias.warnings.map((w, i) => (
              <Typography key={`w-${i}`} variant="body2" sx={{ color: "#f59e0b", fontSize: "0.8rem", mb: 0.3 }}>
                {w}
              </Typography>
            ))}
          </Box>
        )}
      </CardContent>
    </Card>
  );
}

export default function MarketBreadth() {
  const [results, setResults] = useState<BreadthResult[]>([]);
  const [bias, setBias] = useState<BreadthBias | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [progress, setProgress] = useState(0);

  const loadBreadthData = async () => {
    try {
      const r = await fetch(`${API}/api/breadth/data`);
      const d = await r.json();
      if (d.data && d.data.length > 0) {
        setResults(d.data);
        setLastUpdated(d.last_updated);
      }
    } catch {
      /* ignore */
    }
  };

  const loadBias = async () => {
    try {
      const r = await fetch(`${API}/api/breadth/bias`);
      const d = await r.json();
      setBias(d);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    loadBreadthData();
    loadBias();
  }, []);

  const handleUpdate = async () => {
    setIsUpdating(true);
    setProgress(0);
    try {
      const r = await fetch(`${API}/api/breadth/update`, { method: "POST" });
      const d = await r.json();
      if (d.status === "started") {
        poll(d.operation_id);
      } else {
        setIsUpdating(false);
      }
    } catch {
      setIsUpdating(false);
    }
  };

  const poll = async (opId: string) => {
    const iv = setInterval(async () => {
      try {
        const r = await fetch(`${API}/api/scanner/status/${opId}`);
        const d = await r.json();
        setProgress(d.progress || 0);

        if (d.status === "completed") {
          clearInterval(iv);
          setIsUpdating(false);
          setProgress(100);
          const res = d.result || {};
          if (res.data) {
            setResults(res.data);
            setLastUpdated(res.last_updated || null);
          }
          // Refresh bias after update
          loadBias();
        } else if (d.status === "error") {
          clearInterval(iv);
          setIsUpdating(false);
        }
      } catch {
        clearInterval(iv);
        setIsUpdating(false);
      }
    }, 1000);
  };

  const darkCardSx = {
    background: "linear-gradient(135deg, #111111 0%, #1a1a1a 100%)",
    border: "1px solid rgba(255,255,255,0.1)",
  };

  return (
    <Box>
      {/* BIAS BOX — at the top */}
      {bias && bias.bias !== "NO_DATA" && (
        <BiasBox bias={bias} />
      )}

      {bias && bias.bias === "NO_DATA" && (
        <Alert severity="info" sx={{ mb: 3 }}>
          No breadth data available. Click &quot;Update&quot; to calculate market breadth first.
        </Alert>
      )}

      {/* Status card */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <Box>
              <Typography variant="h6" gutterBottom>
                Status: {results.length > 0 ? `${results.length} dates cached` : "No data cached"}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Last Updated: {lastUpdated ? new Date(lastUpdated).toLocaleString() : "Never"}
              </Typography>
            </Box>
            <Button
              variant="contained"
              startIcon={<RefreshIcon />}
              onClick={handleUpdate}
              disabled={isUpdating}
              size="large"
            >
              {isUpdating ? "Updating..." : "Update"}
            </Button>
          </Box>
        </CardContent>
      </Card>

      {/* Progress bar */}
      {isUpdating && (
        <Box sx={{ mb: 3 }}>
          <CandleProgress progress={progress} />
        </Box>
      )}

      {/* Breadth data table */}
      {results.length > 0 && (
        <Card sx={darkCardSx}>
          <CardContent>
            <TableContainer component={Paper} sx={{ backgroundColor: "transparent" }}>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ color: "#f8fafc", fontWeight: 600, borderBottom: "1px solid black", borderRight: "1px solid black", textAlign: "center" }}>
                      Date
                    </TableCell>
                    <TableCell sx={{ color: "#f8fafc", fontWeight: 600, borderBottom: "1px solid black", borderRight: "1px solid black", textAlign: "center" }}>
                      Up 4.5%
                    </TableCell>
                    <TableCell sx={{ color: "#f8fafc", fontWeight: 600, borderBottom: "1px solid black", borderRight: "1px solid black", textAlign: "center" }}>
                      Down 4.5%
                    </TableCell>
                    <TableCell sx={{ color: "#f8fafc", fontWeight: 600, borderBottom: "1px solid black", borderRight: "1px solid black", textAlign: "center" }}>
                      Up 20% 5d
                    </TableCell>
                    <TableCell sx={{ color: "#f8fafc", fontWeight: 600, borderBottom: "1px solid black", borderRight: "1px solid black", textAlign: "center" }}>
                      Down 20% 5d
                    </TableCell>
                    <TableCell sx={{ color: "#f8fafc", fontWeight: 600, borderBottom: "1px solid black", borderRight: "1px solid black", textAlign: "center" }}>
                      Above 20MA
                    </TableCell>
                    <TableCell sx={{ color: "#f8fafc", fontWeight: 600, borderBottom: "1px solid black", borderRight: "1px solid black", textAlign: "center" }}>
                      Below 20MA
                    </TableCell>
                    <TableCell sx={{ color: "#f8fafc", fontWeight: 600, borderBottom: "1px solid black", borderRight: "1px solid black", textAlign: "center" }}>
                      Above 50MA
                    </TableCell>
                    <TableCell sx={{ color: "#f8fafc", fontWeight: 600, borderBottom: "1px solid black", textAlign: "center" }}>
                      Below 50MA
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {results.map((row) => (
                    <TableRow key={row.date} sx={{
                      "&:hover": { backgroundColor: "rgba(255,255,255,0.02)" },
                    }}>
                      <TableCell sx={{
                        color: "#f8fafc", borderBottom: "1px solid black",
                        borderRight: "1px solid black", fontSize: "0.85rem",
                        py: "2px", textAlign: "center",
                      }}>
                        {row.date}
                      </TableCell>
                      <TableCell sx={{ ...cellSx(getUp45Color(row.up_4_5_pct)) }}>
                        {row.up_4_5_pct}
                      </TableCell>
                      <TableCell sx={{ ...cellSx(getDown45Color(row.down_4_5_pct)) }}>
                        {row.down_4_5_pct}
                      </TableCell>
                      <TableCell sx={{ ...cellSx(getUp20Color(row.up_20_pct_5d)) }}>
                        {row.up_20_pct_5d}
                      </TableCell>
                      <TableCell sx={{ ...cellSx(getDown20Color(row.down_20_pct_5d)) }}>
                        {row.down_20_pct_5d}
                      </TableCell>
                      <TableCell sx={{ ...cellSx(getAbove20MAColor(row.above_20ma)) }}>
                        {row.above_20ma}
                      </TableCell>
                      <TableCell sx={{ ...cellSx(getBelow20MAColor(row.below_20ma)) }}>
                        {row.below_20ma}
                      </TableCell>
                      <TableCell sx={{ ...cellSx(getAbove50MAColor(row.above_50ma)) }}>
                        {row.above_50ma}
                      </TableCell>
                      <TableCell sx={{
                        ...cellSx(getBelow50MAColor(row.below_50ma)),
                        borderRight: "none",
                      }}>
                        {row.below_50ma}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </CardContent>
        </Card>
      )}

      {/* Empty state */}
      {results.length === 0 && !isUpdating && (
        <Card sx={{ p: 6, textAlign: "center", ...darkCardSx }}>
          <Typography variant="h6" gutterBottom sx={{ color: "text.secondary" }}>
            No Breadth Analysis Results
          </Typography>
          <Typography variant="body2" sx={{ color: "text.secondary", mb: 3 }}>
            Click &quot;Update&quot; to calculate and cache the latest market breadth analysis
          </Typography>
        </Card>
      )}
    </Box>
  );
}
