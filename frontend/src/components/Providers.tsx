"use client";

import { ThemeProvider, createTheme, CssBaseline } from "@mui/material";
import { AppRouterCacheProvider } from "@mui/material-nextjs/v16-appRouter";
import { AppStateProvider } from "@/lib/AppStateContext";

const theme = createTheme({
  palette: {
    mode: "dark",
    primary: { main: "#6366f1" },
    secondary: { main: "#ec4899" },
    success: { main: "#10b981" },
    warning: { main: "#f59e0b" },
    info: { main: "#06b6d4" },
    background: { default: "#0a0a0a", paper: "#111111" },
    text: { primary: "#f8fafc", secondary: "#94a3b8" },
  },
  typography: {
    fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
    h4: { fontWeight: 700, letterSpacing: "-0.025em" },
    h5: { fontWeight: 600, letterSpacing: "-0.025em" },
    h6: { fontWeight: 600, letterSpacing: "-0.025em" },
    body1: { lineHeight: 1.6 },
  },
  shape: { borderRadius: 12 },
  components: {
    MuiCard: {
      styleOverrides: {
        root: {
          background: "linear-gradient(135deg, #111111 0%, #1a1a1a 100%)",
          border: "1px solid #2a2a2a",
          backdropFilter: "blur(10px)",
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          textTransform: "none",
          fontWeight: 600,
          boxShadow: "none",
          "&:hover": { boxShadow: "0 4px 12px rgba(0,0,0,0.3)" },
        },
      },
    },
    MuiTabs: {
      styleOverrides: {
        root: {
          "& .MuiTabs-indicator": { height: 3, borderRadius: 2 },
        },
      },
    },
  },
});

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AppRouterCacheProvider>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <AppStateProvider>
          {children}
        </AppStateProvider>
      </ThemeProvider>
    </AppRouterCacheProvider>
  );
}
