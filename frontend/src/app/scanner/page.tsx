"use client";

import React from "react";
import { Box, Tabs, Tab } from "@mui/material";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import TrendingDownIcon from "@mui/icons-material/TrendingDown";
import StorageIcon from "@mui/icons-material/Storage";
import ListIcon from "@mui/icons-material/List";
import CacheData from "@/components/CacheData";
import ContinuationScanner from "@/components/ContinuationScanner";
import ReversalScanner from "@/components/ReversalScanner";
import StockList from "@/components/StockList";
import { useAppState } from "@/lib/AppStateContext";

export default function ScannerPage() {
  const { state, setActiveScannerTab } = useAppState();
  const activeTab = state.activeScannerTab;

  const handleTabChange = (_event: React.SyntheticEvent, newValue: string) => {
    setActiveScannerTab(newValue);
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
            label="Cache Data"
            value="cache"
            icon={<StorageIcon sx={{ fontSize: 16 }} />}
            iconPosition="start"
            sx={{
              minWidth: 130,
              backgroundColor: activeTab === "cache" ? "rgba(59, 130, 246, 0.1)" : "transparent",
              color: activeTab === "cache" ? "#3b82f6 !important" : undefined,
            }}
          />
          <Tab
            label="Continuation"
            value="continuation"
            icon={<TrendingUpIcon sx={{ fontSize: 16 }} />}
            iconPosition="start"
            sx={{
              minWidth: 130,
              backgroundColor: activeTab === "continuation" ? "rgba(16, 185, 129, 0.1)" : "transparent",
              color: activeTab === "continuation" ? "#10b981 !important" : undefined,
            }}
          />
          <Tab
            label="Reversal"
            value="reversal"
            icon={<TrendingDownIcon sx={{ fontSize: 16 }} />}
            iconPosition="start"
            sx={{
              minWidth: 130,
              backgroundColor: activeTab === "reversal" ? "rgba(245, 158, 11, 0.1)" : "transparent",
              color: activeTab === "reversal" ? "#f59e0b !important" : undefined,
            }}
          />
          <Tab
            label="Stocks List"
            value="stocks-list"
            icon={<ListIcon sx={{ fontSize: 16 }} />}
            iconPosition="start"
            sx={{
              minWidth: 130,
              backgroundColor: activeTab === "stocks-list" ? "rgba(139, 92, 246, 0.1)" : "transparent",
              color: activeTab === "stocks-list" ? "#8b5cf6 !important" : undefined,
            }}
          />
        </Tabs>
      </Box>

      <Box>
        {activeTab === "cache" && <CacheData />}
        {activeTab === "continuation" && <ContinuationScanner />}
        {activeTab === "reversal" && <ReversalScanner />}
        {activeTab === "stocks-list" && <StockList />}
      </Box>
    </Box>
  );
}
