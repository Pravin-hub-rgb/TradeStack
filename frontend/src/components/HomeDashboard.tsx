"use client";

import React from "react";
import { Box, Typography, Grid } from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import AnalyticsIcon from "@mui/icons-material/Analytics";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import StorageIcon from "@mui/icons-material/Storage";
import Lightfall from "@/components/Lightfall";
import GlitchText from "@/components/GlitchText";

const features = [
  {
    title: "Scanner",
    icon: <SearchIcon sx={{ fontSize: 28 }} />,
    summary:
      "Scan NSE equities for continuation and reversal setups. Configurable SMA, ADR%, volume surge, and base filters.",
    color: "#6366f1",
  },
  {
    title: "Market Breadth",
    icon: <AnalyticsIcon sx={{ fontSize: 28 }} />,
    summary:
      "NSE advance/decline ratios, sector performance, trend strength, and real-time market health indicators.",
    color: "#10b981",
  },
  {
    title: "Live Trading",
    icon: <TrendingUpIcon sx={{ fontSize: 28 }} />,
    summary:
      "WebSocket streaming via Upstox. Live ticks, position management, trade logging, and real-time P&L tracking.",
    color: "#f59e0b",
  },
  {
    title: "Cache Management",
    icon: <StorageIcon sx={{ fontSize: 28 }} />,
    summary:
      "Download historical NSE data, manage .pkl cache, monitor freshness across 2000+ symbols with SQLite index.",
    color: "#3b82f6",
  },
];

const GlassCard: React.FC<{
  title: string;
  icon: React.ReactNode;
  summary: string;
  color: string;
}> = ({ title, icon, summary, color }) => (
  <Box
    sx={{
      position: "relative",
      height: "100%",
      borderRadius: 3,
      overflow: "hidden",
      background: "rgba(255, 255, 255, 0.005)",
      backdropFilter: "blur(4px)",
      WebkitBackdropFilter: "blur(4px)",
      border: "1px solid rgba(255, 255, 255, 0.10)",
      boxShadow:
        "0 4px 16px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.05)",
      transition: "all 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
      "&::before": {
        content: '""',
        position: "absolute",
        inset: 0,
        borderRadius: "inherit",
        background: `
          radial-gradient(circle at 15% 20%, rgba(255,255,255,0.10) 0%, transparent 50%),
          radial-gradient(circle at 85% 75%, rgba(255,255,255,0.05) 0%, transparent 40%),
          linear-gradient(
            180deg,
            rgba(255,255,255,0.02) 0%,
            transparent 30%,
            transparent 70%,
            rgba(255,255,255,0.02) 100%
          )
        `,
        pointerEvents: "none",
        zIndex: 1,
      },
      "&::after": {
        content: '""',
        position: "absolute",
        inset: 0,
        borderRadius: "inherit",
        background: `
          radial-gradient(circle 4px at 18% 22%, rgba(255,255,255,0.18) 0%, transparent 100%),
          radial-gradient(circle 3px at 52% 65%, rgba(255,255,255,0.12) 0%, transparent 100%),
          radial-gradient(circle 5px at 78% 28%, rgba(255,255,255,0.10) 0%, transparent 100%),
          radial-gradient(circle 2px at 88% 82%, rgba(255,255,255,0.15) 0%, transparent 100%),
          radial-gradient(circle 3px at 35% 40%, rgba(255,255,255,0.08) 0%, transparent 100%),
          radial-gradient(circle 2px at 60% 15%, rgba(255,255,255,0.10) 0%, transparent 100%)
        `,
        pointerEvents: "none",
        zIndex: 2,
      },
      "&:hover": {
        transform: "translateY(-4px)",
        borderColor: `${color}70`,
        boxShadow: `0 20px 60px rgba(0,0,0,0.5), 0 0 40px ${color}20, inset 0 1px 0 rgba(255,255,255,0.12)`,
        "& .steam-streak": {
          opacity: 1,
        },
        "& .droplet-reflection": {
          opacity: 0.6,
        },
      },
    }}
  >
    <Box
      className="steam-streak"
      sx={{
        position: "absolute",
        inset: 0,
        borderRadius: "inherit",
        background: `
          linear-gradient(
            108deg,
            transparent 0%,
            transparent 25%,
            rgba(255,255,255,0.06) 40%,
            rgba(255,255,255,0.10) 50%,
            rgba(255,255,255,0.06) 60%,
            transparent 75%,
            transparent 100%
          )
        `,
        opacity: 0,
        transition: "opacity 0.6s ease",
        pointerEvents: "none",
        zIndex: 3,
      }}
    />
    <Box
      className="droplet-reflection"
      sx={{
        position: "absolute",
        bottom: 8,
        right: 12,
        width: 6,
        height: 10,
        borderRadius: "50%",
        background: "rgba(255,255,255,0.12)",
        filter: "blur(1px)",
        opacity: 0.3,
        transition: "opacity 0.4s ease",
        zIndex: 3,
        pointerEvents: "none",
      }}
    />
    <Box
      sx={{
        position: "relative",
        zIndex: 4,
        p: 2.5,
        display: "flex",
        flexDirection: "column",
        gap: 1.5,
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
        <Box sx={{ color, display: "flex", opacity: 0.85 }}>
          {icon}
        </Box>
        <Typography sx={{ fontWeight: 700, fontSize: "0.95rem", color: "#f8fafc", letterSpacing: "-0.01em" }}>
          {title}
        </Typography>
      </Box>
      <Typography sx={{ color: "rgba(255, 255, 255, 0.55)", fontSize: "0.8rem", lineHeight: 1.65 }}>
        {summary}
      </Typography>
    </Box>
  </Box>
);

const HomeDashboard: React.FC = () => {
  return (
    <Box
      sx={{
        position: "relative",
        flex: 1,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <Box sx={{ position: "fixed", inset: 0, zIndex: 0 }}>
        <Lightfall
          colors={["#01fc1a", "#fc0000", "#ffffff"]}
          backgroundColor="#000000"
          speed={0.7}
          streakCount={1}
          streakWidth={0.2}
          streakLength={1.3}
          glow={1.2}
          density={0.5}
          twinkle={0}
          zoom={1.7}
          backgroundGlow={0}
          opacity={1}
          mouseInteraction={false}
        />
      </Box>

      <Box
        sx={{
          position: "relative",
          zIndex: 1,
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          px: 2,
        }}
      >
          <Box sx={{ textAlign: "center", mb: 3 }}>
            <Box sx={{ display: "inline-flex", justifyContent: "center", mx: "auto", bgcolor: "#000000", border: "1.5px solid #ffffff", borderRadius: 2, px: 2.5, py: 0.8 }}>
              <GlitchText speed={2.8} enableShadows={false} enableOnHover={true} className="whitespace-nowrap">
                TradeStack
              </GlitchText>
            </Box>
            <Typography
              sx={{
                mt: 1,
                color: "rgba(255, 255, 255, 0.49)",
                fontWeight: 400,
                fontSize: "0.8rem",
                maxWidth: 440,
                mx: "auto",
                lineHeight: 1.5,
              }}
            >
              Systematic NSE equity swing trading platform with real-time data
              streaming, technical scanners, and market breadth analysis.
            </Typography>
          </Box>

        <Grid container spacing={3} sx={{ maxWidth: 1000, mx: "auto" }}>
          {features.map((f) => (
            <Grid key={f.title} size={{ xs: 12, sm: 6, md: 3 }}>
              <GlassCard title={f.title} icon={f.icon} summary={f.summary} color={f.color} />
            </Grid>
          ))}
        </Grid>

        <Box sx={{ textAlign: "center", mt: 4 }}>
          <Typography sx={{ color: "rgba(255, 255, 255, 0.51)", fontSize: "0.7rem", letterSpacing: "0.5px" }}>
            Data sourced from NSE &amp; Upstox. For educational purposes only.
          </Typography>
        </Box>
      </Box>
    </Box>
  );
};

export default HomeDashboard;
