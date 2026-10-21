"use client";

import React from "react";
import { Box, Button, Typography } from "@mui/material";
import ErrorIcon from "@mui/icons-material/Error";
import { logger } from "@/lib/logger";
import { errorMessage } from "@/lib/errors";

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Top-level React error boundary. Any uncaught render error in a page shows
 * a recoverable error card instead of a blank screen. Error details are
 * logged through the structured logger; the raw stack stays out of the UI.
 */
export default class ErrorBoundary extends React.Component<{ children: React.ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    logger.error("ErrorBoundary", `${errorMessage(error)} (component stack: ${errorInfo.componentStack ?? "n/a"})`, error);
  }

  private reset = () => this.setState({ error: null });

  render(): React.ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
        <Box sx={{ maxWidth: 560, width: "100%", bgcolor: "#111827", border: "1px solid rgba(239,68,68,0.35)", borderRadius: 2, p: 4, textAlign: "center" }}>
          <ErrorIcon sx={{ fontSize: 44, color: "#ef4444", mb: 1 }} />
          <Typography variant="h6" sx={{ color: "#f8fafc", mb: 1 }}>Something went wrong</Typography>
          <Typography variant="body2" sx={{ color: "#94a3b8", mb: 3, wordBreak: "break-word" }}>
            {errorMessage(this.state.error)}
          </Typography>
          <Box sx={{ display: "flex", gap: 2, justifyContent: "center" }}>
            <Button variant="outlined" size="small" onClick={this.reset} sx={{ color: "#94a3b8", borderColor: "rgba(148,163,184,0.4)" }}>
              Try again
            </Button>
            <Button variant="contained" size="small" onClick={() => window.location.reload()} sx={{ bgcolor: "#6366f1" }}>
              Reload page
            </Button>
          </Box>
        </Box>
      </Box>
    );
  }
}
