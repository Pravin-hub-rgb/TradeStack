"use client";

import React, { useState } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Typography,
  IconButton,
  InputAdornment,
  Alert,
  CircularProgress,
  Box,
} from "@mui/material";
import {
  Visibility,
  VisibilityOff,
  Key as KeyIcon,
  CheckCircle as CheckCircleIcon,
} from "@mui/icons-material";

const API = "http://127.0.0.1:8001";

interface TokenDialogProps {
  open: boolean;
  onClose: () => void;
  onTokenSaved: () => void;
}

const TokenDialog: React.FC<TokenDialogProps> = ({ open, onClose, onTokenSaved }) => {
  const [token, setToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [validating, setValidating] = useState(false);
  const [result, setResult] = useState<{ valid: boolean; message: string } | null>(null);

  const handleValidate = async () => {
    if (!token.trim()) return;
    setValidating(true);
    setResult(null);
    try {
      const resp = await fetch(`${API}/api/token/validate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: token.trim() }),
      });
      const data = await resp.json();
      setResult({ valid: data.valid, message: data.message || data.error || "Unknown" });
      if (data.valid) {
        setTimeout(() => {
          onTokenSaved();
          onClose();
          setToken("");
          setResult(null);
        }, 1500);
      }
    } catch {
      setResult({ valid: false, message: "Failed to connect to server" });
    } finally {
      setValidating(false);
    }
  };

  const handleClose = () => {
    setToken("");
    setResult(null);
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <KeyIcon color="primary" />
        Upstox Access Token
      </DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Enter your Upstox API access token. This is required to download historical market data.
          The token is stored securely in the local database.
        </Typography>
        <TextField
          fullWidth
          label="Access Token"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          type={showToken ? "text" : "password"}
          variant="outlined"
          disabled={validating}
          autoFocus
          slotProps={{
            input: {
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton onClick={() => setShowToken(!showToken)} edge="end">
                    {showToken ? <VisibilityOff /> : <Visibility />}
                  </IconButton>
                </InputAdornment>
              ),
            },
          }}
        />
        {result && (
          <Alert severity={result.valid ? "success" : "error"} sx={{ mt: 2 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              {result.valid && <CheckCircleIcon fontSize="small" />}
              {result.message}
            </Box>
          </Alert>
        )}
      </DialogContent>
      <DialogActions sx={{ p: 2, pt: 0 }}>
        <Button onClick={handleClose} disabled={validating}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleValidate}
          disabled={!token.trim() || validating}
          startIcon={validating ? <CircularProgress size={16} /> : <KeyIcon />}
        >
          {validating ? "Validating..." : "Validate & Update"}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default TokenDialog;
