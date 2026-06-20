"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { AppBar, Toolbar, Typography, Box, Button } from "@mui/material";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import SearchIcon from "@mui/icons-material/Search";
import AnalyticsIcon from "@mui/icons-material/Analytics";
import SettingsIcon from "@mui/icons-material/Settings";
import HomeIcon from "@mui/icons-material/Home";

const navItems = [
  { path: "/", label: "Home", icon: <HomeIcon sx={{ fontSize: 18 }} /> },
  { path: "/scanner", label: "Scanner", icon: <SearchIcon sx={{ fontSize: 18 }} /> },
  { path: "/breadth", label: "Breadth", icon: <AnalyticsIcon sx={{ fontSize: 18 }} /> },
  { path: "/live-trading", label: "Live", icon: <TrendingUpIcon sx={{ fontSize: 18 }} /> },
  { path: "/settings", label: "Settings", icon: <SettingsIcon sx={{ fontSize: 18 }} /> },
];

const Navbar: React.FC = () => {
  const router = useRouter();
  const pathname = usePathname();
  const [serverHealthy, setServerHealthy] = useState<boolean | null>(null);

  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch("http://127.0.0.1:8001/health");
        const data = await res.json();
        setServerHealthy(data.status === "healthy");
      } catch {
        setServerHealthy(false);
      }
    };
    check();
    const interval = setInterval(check, 30000);
    return () => clearInterval(interval);
  }, []);

  const dotColor = serverHealthy === null ? "#facc15" : serverHealthy ? "#22c55e" : "#ef4444";

  return (
    <AppBar position="sticky" suppressHydrationWarning sx={{
      bgcolor: "#09090b",
      borderBottom: "1px solid #1e293b",
      boxShadow: "none",
      zIndex: 1000,
    }}>
      <Toolbar sx={{ px: 3, minHeight: "39px !important", gap: 0.5 }}>
        {navItems.map((item) => {
          const active = item.path === "/" ? pathname === "/" : pathname.startsWith(item.path);
          return (
            <Button
              key={item.label}
              onClick={() => router.push(item.path)}
              sx={{
                position: "relative",
                display: "flex", alignItems: "center", gap: 1,
                px: 1.5, py: 1,
                minWidth: 0, height: 36,
                fontWeight: 500,
                fontSize: "0.9rem",
                textTransform: "none",
                color: active ? "#f8fafc" : "#64748b",
                bgcolor: "transparent",
                borderRadius: 1.5,
                transition: "color 0.15s ease, background-color 0.15s ease, opacity 0.15s ease",
                "&:hover": {
                  bgcolor: "rgba(255,255,255,0.04)",
                  color: "#f8fafc",
                },
                "&::after": {
                  content: '""',
                  position: "absolute",
                  bottom: 0,
                  left: "20%",
                  right: "20%",
                  height: 2,
                  bgcolor: "#6366f1",
                  borderRadius: "1px 1px 0 0",
                  opacity: active ? 1 : 0,
                  transition: "opacity 0.15s ease",
                },
              }}
            >
              {item.icon}
              {item.label}
            </Button>
          );
        })}

        <Box sx={{ flex: 1 }} />

        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Box sx={{
            width: 8, height: 8, borderRadius: "50%",
            bgcolor: dotColor,
            boxShadow: `0 0 6px ${dotColor}`,
            animation: "server-pulse 2s ease-in-out infinite",
            "@keyframes server-pulse": {
              "0%, 100%": { opacity: 1, transform: "scale(1)", boxShadow: `0 0 6px ${dotColor}` },
              "50%": { opacity: 0.6, transform: "scale(0.85)", boxShadow: `0 0 12px ${dotColor}` },
            },
          }} />
          <Typography sx={{ color: "#94a3b8", fontSize: "0.8rem", fontWeight: 500 }}>
            Server
          </Typography>
        </Box>
      </Toolbar>
    </AppBar>
  );
};

export default Navbar;
