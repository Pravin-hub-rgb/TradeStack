"use client";

import React, { useEffect, useState } from "react";
import { Box, Typography } from "@mui/material";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ErrorIcon from "@mui/icons-material/Error";
import WarningIcon from "@mui/icons-material/Warning";

interface ToastNotificationProps {
  message: string;
  type: "success" | "error" | "warning";
  onClose: () => void;
  duration?: number;
  slideFrom?: "left" | "right";
}

const accentMap: Record<string, { color: string; icon: React.ReactNode }> = {
  success: {
    color: "#10b981",
    icon: <CheckCircleIcon sx={{ fontSize: 18, color: "#10b981" }} />,
  },
  error: {
    color: "#ef4444",
    icon: <ErrorIcon sx={{ fontSize: 18, color: "#ef4444" }} />,
  },
  warning: {
    color: "#f59e0b",
    icon: <WarningIcon sx={{ fontSize: 18, color: "#f59e0b" }} />,
  },
};

const ToastNotification: React.FC<ToastNotificationProps> = ({
  message,
  type,
  onClose,
  duration = 3500,
  slideFrom = "right",
}) => {
  const [isDisappearing, setIsDisappearing] = useState(false);
  const accent = accentMap[type];
  const isLeft = slideFrom === "left";
  const slideAnim = isLeft ? "slideInFromLeft" : "slideIn";

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsDisappearing(true);
      setTimeout(() => {
        onClose();
      }, 600);
    }, duration - 600);
    return () => clearTimeout(timer);
  }, [duration]);

  return (
    <Box
      className={isDisappearing ? "toast-disappearing" : ""}
      sx={{
        minWidth: 320,
        maxWidth: 420,
        bgcolor: "#111827",
        [isLeft ? "borderRight" : "borderLeft"]: "3px solid #e2e8f0",
        borderRadius: 1,
        boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
        overflow: "hidden",
        animation: `${slideAnim} 0.35s ease-out`,
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, px: 2, py: 1.5 }}>
        {accent.icon}
        <Typography sx={{ color: "#e2e8f0", fontSize: "0.85rem", lineHeight: 1.4 }}>
          {message}
        </Typography>
      </Box>
      <Box sx={{ height: 2, bgcolor: "rgba(255,255,255,0.1)", position: "relative" }}>
        <Box
          sx={{
            position: "absolute",
            top: 0,
            height: "100%",
            [isLeft ? "right" : "left"]: 0,
            bgcolor: "#e2e8f0",
            animation: `countdown ${duration}ms linear forwards`,
          }}
        />
      </Box>

      <style>{`
        @keyframes slideIn {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        @keyframes slideInFromLeft {
          from { transform: translateX(-100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        @keyframes countdown {
          from { width: 0%; }
          to { width: 100%; }
        }
        @keyframes fadeOut {
          0% { opacity: 1; }
          100% { opacity: 0; }
        }
        .toast-disappearing {
          animation: fadeOut 0.6s ease-out forwards !important;
        }
      `}</style>
    </Box>
  );
};

export default ToastNotification;
