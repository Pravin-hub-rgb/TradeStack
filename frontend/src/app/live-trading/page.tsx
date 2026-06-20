"use client";

import React from "react";
import { Box, Tabs, Tab } from "@mui/material";
import VpnKeyIcon from "@mui/icons-material/VpnKey";
import AnalyticsIcon from "@mui/icons-material/Analytics";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ReceiptIcon from "@mui/icons-material/Receipt";
import TokenTab from "@/components/live-trading/TokenTab";
import ValidationTab from "@/components/live-trading/ValidationTab";
import LiveTrading from "@/components/LiveTrading";
import TradeLogs from "@/components/live-trading/TradeLogs";
import { useAppState } from "@/lib/AppStateContext";

export default function LiveTradingPage() {
  const { state, setActiveLiveTradingTab } = useAppState();
  const activeTab = state.activeLiveTradingTab;

  const handleTabChange = (_event: React.SyntheticEvent, newValue: string) => {
    setActiveLiveTradingTab(newValue);
  };

  return (
    <Box sx={{ minHeight: "100vh" }}>
      <Box sx={{ mb: 4 }}>
        <Tabs
          value={activeTab}
          onChange={handleTabChange}
          sx={{
            minHeight: 39,
            backgroundColor: "rgba(12, 12, 18, 0.65)",
            backdropFilter: "blur(16px)",
            WebkitBackdropFilter: "blur(16px)",
            borderRadius: 2.5,
            border: "1px solid rgba(255,255,255,0.06)",
            boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
            padding: "0.5px",
            "& .MuiTabs-scroller": {
              height: 39,
            },
                        "& .MuiTab-root": {
              fontSize: "0.8rem",
              fontWeight: 500,
              textTransform: "none",
              minHeight: 38,
              py: "11.5px",
              borderRadius: 1.5,
              fontFamily: '"Inter", sans-serif',
              transition: "all 0.2s ease",
              "&:hover": {
                backgroundColor: "rgba(255,255,255,0.04)",
              },
            },
            "& .MuiTabs-indicator": {
              display: "none",
            },
          }}
        >
          <Tab
            label="Token Session"
            value="token"
            icon={<VpnKeyIcon sx={{ fontSize: 16 }} />}
            iconPosition="start"
            sx={{
              minWidth: 130,
              backgroundColor: activeTab === "token" ? "rgba(147, 51, 234, 0.1)" : "transparent",
              color: activeTab === "token" ? "#9333ea !important" : undefined,
            }}
          />
          <Tab
            label="List Validation"
            value="validation"
            icon={<AnalyticsIcon sx={{ fontSize: 16 }} />}
            iconPosition="start"
            sx={{
              minWidth: 130,
              backgroundColor: activeTab === "validation" ? "rgba(16, 185, 129, 0.1)" : "transparent",
              color: activeTab === "validation" ? "#10b981 !important" : undefined,
            }}
          />
          <Tab
            label="Live Trading"
            value="trading"
            icon={<CheckCircleIcon sx={{ fontSize: 16 }} />}
            iconPosition="start"
            sx={{
              minWidth: 130,
              backgroundColor: activeTab === "trading" ? "rgba(245, 158, 11, 0.1)" : "transparent",
              color: activeTab === "trading" ? "#f59e0b !important" : undefined,
            }}
          />
          <Tab
            label="Trade Logs"
            value="tradelogs"
            icon={<ReceiptIcon sx={{ fontSize: 16 }} />}
            iconPosition="start"
            sx={{
              minWidth: 130,
              backgroundColor: activeTab === "tradelogs" ? "rgba(99, 102, 241, 0.1)" : "transparent",
              color: activeTab === "tradelogs" ? "#818cf8 !important" : undefined,
            }}
          />
        </Tabs>
      </Box>

      <Box>
        {activeTab === "token" && <TokenTab />}
        {activeTab === "validation" && <ValidationTab />}
        {activeTab === "trading" && <LiveTrading />}
        {activeTab === "tradelogs" && <TradeLogs />}
      </Box>
    </Box>
  );
}
