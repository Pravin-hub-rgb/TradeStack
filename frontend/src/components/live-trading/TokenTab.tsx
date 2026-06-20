"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Typography, Box, Paper, Button, Chip, TextField, InputAdornment, IconButton,
  CircularProgress, Alert,
} from "@mui/material";
import { VpnKey as KeyIcon, CheckCircle as CheckCircleIcon, Visibility, VisibilityOff } from "@mui/icons-material";
import { PY_API } from "./live-trading-utils";

const StyledPaper = ({ children, ...sx }: any) => (
  <Paper sx={{ padding: 3, marginBottom: 3, background: "linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%)", border: "1px solid rgba(255, 255, 255, 0.08)", borderRadius: "12px", boxShadow: "0 4px 20px rgba(0, 0, 0, 0.3)", ...sx }}>{children}</Paper>
);

const ValidationResult = ({ children, ...sx }: any) => (
  <Box sx={{ marginTop: 2, padding: 2, backgroundColor: "#0d0d0d", borderRadius: "8px", fontFamily: 'Monaco, Menlo, "Ubuntu Mono", monospace', fontSize: "0.85rem", whiteSpace: "pre-wrap", overflowY: "auto", border: "1px solid #333333", color: "#e0e0e0", ...sx }}>{children}</Box>
);

export default function TokenTab() {
  const [tokenStatus, setTokenStatus] = useState<"unknown" | "valid" | "invalid">("unknown");
  const [accessToken, setAccessToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [showUpdateForm, setShowUpdateForm] = useState(false);
  const [isValidatingToken, setIsValidatingToken] = useState(false);
  const [isRefreshingToken, setIsRefreshingToken] = useState(false);
  const [tokenValidationResult, setTokenValidationResult] = useState("");

  const fetchTokenStatus = useCallback(async () => {
    try {
      const r = await fetch(`${PY_API}/api/token/status`);
      const d = await r.json();
      if (!d.exists) { setTokenStatus("unknown"); return; }
      const checkR = await fetch(`${PY_API}/api/token/check`);
      const checkD = await checkR.json();
      setTokenStatus(checkD.valid ? "valid" : "invalid");
    } catch { setTokenStatus("unknown"); }
  }, []);

  useEffect(() => { fetchTokenStatus(); }, [fetchTokenStatus]);

  const handleRefreshTokenStatus = async () => {
    setIsRefreshingToken(true);
    await fetchTokenStatus();
    setIsRefreshingToken(false);
  };

  const handleValidateToken = async () => {
    if (!accessToken.trim()) return;
    setIsValidatingToken(true);
    setTokenValidationResult("");
    try {
      const r = await fetch(`${PY_API}/api/token/validate`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: accessToken.trim() }),
      });
      const d = await r.json();
      setTokenValidationResult(d.message || JSON.stringify(d, null, 2));
      if (d.valid) { setTokenStatus("valid"); setShowUpdateForm(false); }
      else setTokenStatus("invalid");
    } catch { setTokenValidationResult("Network error - could not reach Python server"); }
    finally { setIsValidatingToken(false); }
  };

  return (
    <StyledPaper>
      <Typography variant="h6" gutterBottom sx={{ fontWeight: 600 }}>Token Session Management</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Validate and update your Upstox access token. Required before live trading.
      </Typography>

      <Box sx={{ mb: 3, p: 3, backgroundColor: "#1a1a1a", borderRadius: "8px", border: "1px solid rgba(147, 51, 234, 0.3)" }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 2 }}>
          <KeyIcon sx={{ color: "#9333ea", fontSize: 24 }} />
          <Typography variant="h6" sx={{ color: "#9333ea", fontWeight: 600 }}>Access Token</Typography>
          {tokenStatus === "valid" && <Chip label="WORKING" size="small" sx={{ backgroundColor: "#d1fae5", color: "#065f46", fontWeight: 600, fontSize: "0.75rem" }} />}
        </Box>

        {tokenStatus === "valid" && <Typography variant="body1" sx={{ color: "#10b981", fontWeight: 500, mb: 1 }}>Token is working correctly</Typography>}
        {tokenStatus === "unknown" && <Typography variant="body2" sx={{ color: "#6b7280" }}>No token configured</Typography>}
        {tokenStatus === "invalid" && <Typography variant="body2" sx={{ color: "#ef4444" }}>Token is invalid or expired</Typography>}

        {showUpdateForm && (
          <Box sx={{ mt: 2 }}>
            <Typography variant="body2" sx={{ mb: 1, color: "#6b7280" }}>Enter new Upstox access token:</Typography>
            <TextField fullWidth size="small" type={showToken ? "text" : "password"} value={accessToken}
              onChange={(e) => setAccessToken(e.target.value)} placeholder="Paste your new access token here"
              slotProps={{ input: {
                startAdornment: <InputAdornment position="start"><KeyIcon sx={{ color: "#9333ea", fontSize: 18 }} /></InputAdornment>,
                endAdornment: <InputAdornment position="end"><IconButton size="small" onClick={() => setShowToken(!showToken)} edge="end" sx={{ color: "#666" }}>{showToken ? <Visibility fontSize="small" /> : <VisibilityOff fontSize="small" />}</IconButton></InputAdornment>,
              }}}
              sx={{ "& .MuiOutlinedInput-root": { backgroundColor: "#0d0d0d", "& fieldset": { borderColor: "rgba(255, 255, 255, 0.23)" }, "&:hover fieldset": { borderColor: "#9333ea" }, "&.Mui-focused fieldset": { borderColor: "#9333ea" }, "& .MuiOutlinedInput-input": { color: "#ffffff" } } }}
            />
            <Box sx={{ mt: 1, display: "flex", gap: 1 }}>
              <Button variant="contained" size="small" onClick={handleValidateToken} disabled={isValidatingToken || !accessToken.trim()}
                startIcon={isValidatingToken ? <CircularProgress size={16} /> : <CheckCircleIcon />}
                sx={{ background: "linear-gradient(135deg, #9333ea 0%, #7c3aed 100%)", "&:hover": { background: "linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)" }, "&:disabled": { background: "#374151" }, fontSize: "0.75rem" }}>
                {isValidatingToken ? "Validating..." : "Validate & Update"}
              </Button>
              <Button variant="outlined" size="small" onClick={() => { setShowUpdateForm(false); setAccessToken(""); }}
                sx={{ color: "#6b7280", borderColor: "#666", fontSize: "0.75rem", "&:hover": { color: "#ffffff", borderColor: "#9333ea", backgroundColor: "rgba(147, 51, 234, 0.1)" } }}>
                Cancel
              </Button>
            </Box>
          </Box>
        )}

        {!showUpdateForm && (
          <Box sx={{ mt: 2, display: "flex", gap: 1 }}>
            <Button variant="outlined" size="small" onClick={handleRefreshTokenStatus} disabled={isRefreshingToken}
              startIcon={isRefreshingToken ? <CircularProgress size={14} /> : null}
              sx={{ color: "#6b7280", borderColor: "#ffffff", fontSize: "0.75rem", textTransform: "none", borderRadius: "6px", padding: "4px 12px", "&:hover": { color: "#ffffff", borderColor: "#10b981", backgroundColor: "rgba(16, 185, 129, 0.1)" }, "&:disabled": { color: "#6b7280", borderColor: "#374151" } }}>
              {isRefreshingToken ? "Refreshing..." : "Refresh Status"}
            </Button>
            <Button variant="outlined" size="small" onClick={() => setShowUpdateForm(true)}
              sx={{ color: "#6b7280", borderColor: "#ffffff", fontSize: "0.75rem", textTransform: "none", borderRadius: "6px", padding: "4px 12px", "&:hover": { color: "#ffffff", borderColor: "#9333ea", backgroundColor: "rgba(147, 51, 234, 0.1)" } }}>
              Update Token
            </Button>
          </Box>
        )}
      </Box>

      {tokenValidationResult && (
        <ValidationResult>
          <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>Token Validation Results:</Typography>
          {tokenValidationResult}
        </ValidationResult>
      )}

      <Alert severity="info" sx={{ mt: 3 }}>
        <Typography variant="body2">
          <strong>Note:</strong> Tests Upstox API connectivity, retrieves price data, saves valid token to DB.
        </Typography>
      </Alert>
    </StyledPaper>
  );
}
