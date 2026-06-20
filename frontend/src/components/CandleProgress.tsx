"use client";

import { Box } from "@mui/material";

const baseHeights = [36, 48, 32, 56, 40, 28, 52, 44, 38, 50, 34, 46, 42, 54, 30, 48, 36, 52, 40, 44];
const baseWickT = [14, 10, 18, 8, 12, 20, 8, 10, 16, 12, 14, 10, 18, 8, 16, 12, 10, 14, 8, 16];
const baseWickB = [12, 16, 8, 14, 10, 18, 12, 16, 8, 14, 10, 12, 16, 10, 18, 8, 14, 10, 16, 12];

interface CandleProgressProps {
  total?: number;
  progress?: number;
  height?: number;
  candleWidth?: number;
  gap?: number;
  borderWidth?: number;
  wickWidth?: number;
  fillDirection?: "horizontal" | "vertical";
}

export default function CandleProgress({ total = 100, progress = 0, height = 20, candleWidth = 8, gap = 0.4, borderWidth = 0.5, wickWidth = 0.5, fillDirection = "vertical" }: CandleProgressProps) {
  const c1 = "#22c55e";
  const c2 = "#ef4444";
  const raw = total * (progress / 100);
  const fullCandles = Math.floor(raw);
  const fraction = raw - fullCandles;
  const scale = height / 50;
  const bodyW = Math.max(1, candleWidth - borderWidth * 2);

  return (
    <Box sx={{ display: "flex", alignItems: "flex-end", gap, height, width: "100%", px: 0.25 }}>
      {Array.from({ length: total }).map((_, i) => {
        const isFull = i < fullCandles;
        const isPartial = i === fullCandles && fraction > 0;
        const c = i % 2 === 0 ? c1 : c2;
        const fillPct = isFull ? 100 : isPartial ? Math.round(fraction * 100) : 0;

        const bodyH = Math.round(baseHeights[i % baseHeights.length] * scale);
        const wickTop = Math.round(baseWickT[i % baseWickT.length] * scale);
        const wickBot = Math.round(baseWickB[i % baseWickB.length] * scale);
        const fillOpacity = fillPct > 0 ? 1 : 0;

        const isVertical = fillDirection === "vertical";
        const fillSx = isVertical
          ? (i % 2 === 0 ? { bottom: 0, left: 0, right: 0, height: `${fillPct}%` } : { top: 0, left: 0, right: 0, height: `${fillPct}%` })
          : { left: 0, top: 0, bottom: 0, width: `${fillPct}%` };

        return (
          <Box key={i} sx={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center" }}>
            <Box sx={{ width: 0, height: wickTop, borderLeft: `${wickWidth}px solid ${c}` }} />
            <Box sx={{ position: "relative", width: bodyW, height: bodyH, border: `${borderWidth}px solid ${c}`, borderRadius: `${Math.max(0.5, borderWidth)}px`, overflow: "hidden" }}>
              <Box sx={{
                position: "absolute",
                ...fillSx,
                bgcolor: c,
                transition: "height 0.2s ease, width 0.2s ease",
                opacity: fillOpacity,
              }} />
            </Box>
            <Box sx={{ width: 0, height: wickBot, borderLeft: `${wickWidth}px solid ${c}` }} />
          </Box>
        );
      })}
    </Box>
  );
}
