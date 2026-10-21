/**
 * Shared scanner filter bar: numeric filter inputs, optional direction
 * select, scan date + Run Scan button. Visuals come from a palette so both
 * scanners restyle with one object.
 */
"use client";

import { Box, Button, Typography } from "@mui/material";

export interface FilterBarFilter {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
}

export interface FilterBarProps {
  filters: FilterBarFilter[];
  direction?: { value: string; onChange: (v: string) => void; options: string[] };
  scanDate: string;
  onScanDateChange: (v: string) => void;
  scanning: boolean;
  onRun: () => void;
  /** Button background (indigo for continuation, amber for reversal). */
  primary: string;
  primaryHover: string;
  buttonText: string;
}

const inputSx = {
  width: 90, px: 2, py: 0.7, borderRadius: 1.5,
  bgcolor: "#1e293b", color: "#f8fafc",
  border: "1px solid #334155", outline: "none",
  fontSize: "0.85rem", fontFamily: '"SF Mono", "Fira Code", monospace',
  textAlign: "left" as const, transition: "border-color 0.15s",
};

export default function FilterBar({
  filters, direction, scanDate, onScanDateChange, scanning, onRun,
  primary, primaryHover, buttonText,
}: FilterBarProps) {
  return (
    <Box sx={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "8px 16px" }}>
      <Typography sx={{ fontWeight: 700, color: "#f1f5f9", fontSize: "0.85rem" }}>
        Filters
      </Typography>
      <Box sx={{ height: 20, width: 1, bgcolor: "#1e293b" }} />
      {filters.map((f) => (
        <Box key={f.label} sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
          <Typography sx={{ color: "#94a3b8", fontSize: "0.8rem", whiteSpace: "nowrap" }}>
            {f.label}
          </Typography>
          <Box
            component="input"
            type="number"
            value={f.value}
            onChange={(e) => f.onChange(Number(e.target.value))}
            min={f.min}
            max={f.max}
            sx={{
              ...inputSx,
              "&:focus": { borderColor: primary },
            }}
          />
        </Box>
      ))}
      {direction && (
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
          <Typography sx={{ color: "#94a3b8", fontSize: "0.8rem", whiteSpace: "nowrap" }}>Direction</Typography>
          <Box
            component="select"
            value={direction.value}
            onChange={(e) => direction.onChange(e.target.value)}
            sx={{
              width: 100, px: 2, py: 0.7, borderRadius: 1.5,
              bgcolor: "#1e293b", color: "#f8fafc",
              border: "1px solid #334155", outline: "none",
              fontSize: "0.85rem", fontFamily: '"SF Mono", "Fira Code", monospace',
              cursor: "pointer", transition: "border-color 0.15s",
              "&:focus": { borderColor: primary },
            }}
          >
            {direction.options.map((o) => (
              <option key={o} value={o}>
                {o.charAt(0).toUpperCase() + o.slice(1)}
              </option>
            ))}
          </Box>
        </Box>
      )}
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
        <Typography sx={{ color: "#94a3b8", fontSize: "0.8rem", whiteSpace: "nowrap" }}>Scan Date</Typography>
        <Box
          component="input"
          type="date"
          value={scanDate}
          onChange={(e) => onScanDateChange(e.target.value)}
          sx={{
            width: 150, px: 1.5, py: 0.7, borderRadius: 1.5,
            bgcolor: "#1e293b", color: "#f8fafc",
            border: "1px solid #334155", outline: "none",
            fontSize: "0.85rem", fontFamily: '"SF Mono", "Fira Code", monospace',
            transition: "border-color 0.15s",
            "&:focus": { borderColor: primary },
            "&::-webkit-calendar-picker-indicator": { filter: "invert(0.7)" },
          }}
        />
        {scanDate && (
          <Box
            component="span"
            onClick={() => onScanDateChange("")}
            sx={{ cursor: "pointer", color: "#64748b", fontSize: "0.8rem", "&:hover": { color: "#f1f5f9" } }}
          >
            ✕
          </Box>
        )}
      </Box>
      <Box sx={{ flex: 1, minWidth: 40 }} />
      <Button
        variant="contained" disableElevation
        disabled={scanning}
        onClick={onRun}
        sx={{
          px: 3, py: 0.8, fontSize: "0.85rem", fontWeight: 600,
          bgcolor: primary, color: buttonText,
          borderRadius: 1.5, textTransform: "none", minWidth: 120,
          "&:hover": { bgcolor: primaryHover },
          "&:disabled": { bgcolor: "#1e293b", color: "#475569" },
        }}
      >
        {scanning ? "Scanning..." : "Run Scan"}
      </Button>
    </Box>
  );
}
