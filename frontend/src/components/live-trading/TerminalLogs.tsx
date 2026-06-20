"use client";

import { useEffect } from "react";
import { Box, Typography } from "@mui/material";

export default function TerminalLogs({ logs, running, userScrolledUp, setUserScrolledUp, logContainerRef, logEndRef }:
  { logs: string[]; running: boolean; userScrolledUp: boolean; setUserScrolledUp: (v: boolean) => void; logContainerRef: React.RefObject<HTMLDivElement | null>; logEndRef: React.RefObject<HTMLDivElement | null> }) {

  useEffect(() => {
    if (userScrolledUp) return;
    const el = logContainerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [logs, userScrolledUp]);

  return (
    <>
      {logs.length > 0 && (
        <Box sx={{ mt: 3 }}>
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1 }}>
            <Typography variant="subtitle2" sx={{ color: "#94a3b8", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px", fontSize: "0.75rem" }}>
              Live Logs ({logs.length})
            </Typography>
            <Typography variant="caption" sx={{ color: "#4b5563", cursor: "ns-resize", userSelect: "none" }}>Drag to resize</Typography>
          </Box>
          <Box ref={logContainerRef}
            onScroll={() => {
              const el = logContainerRef.current;
              if (!el) return;
              const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 30;
              if (atBottom && userScrolledUp) setUserScrolledUp(false);
              if (!atBottom && !userScrolledUp) setUserScrolledUp(true);
            }}
            sx={{ background: "#0d0d0d", borderRadius: 2, p: 2, border: "1px solid rgba(255,255,255,0.06)", height: 300, overflowY: "auto", resize: "vertical", fontFamily: 'Monaco, Menlo, "Ubuntu Mono", monospace', fontSize: "0.75rem", lineHeight: 1.6, minHeight: 100, maxHeight: 800 }}>
            {logs.map((line, i) => (
              <Box key={i} sx={{ color: line.includes("error") ? "#ef4444" : line.includes("Starting") || line.includes("started") ? "#10b981" : line.includes("Stopping") || line.includes("stopped") ? "#f59e0b" : line.includes("Loaded") || line.includes("Loading") ? "#60a5fa" : "#94a3b8", whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
                {line}
              </Box>
            ))}
            <div ref={logEndRef} />
          </Box>
        </Box>
      )}
      {running && logs.length === 0 && (
        <Box sx={{ mt: 3 }}>
          <Typography variant="subtitle2" sx={{ color: "#94a3b8", mb: 1, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px", fontSize: "0.75rem" }}>Live Logs</Typography>
          <Box sx={{ background: "#0d0d0d", borderRadius: 2, p: 2, border: "1px solid rgba(255,255,255,0.06)", height: 120, overflowY: "auto", resize: "vertical", fontFamily: 'Monaco, Menlo, "Ubuntu Mono", monospace', fontSize: "0.75rem", lineHeight: 1.6, minHeight: 60, maxHeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Typography variant="body2" sx={{ color: "#4b5563" }}>Waiting for log output...</Typography>
          </Box>
        </Box>
      )}
    </>
  );
}
