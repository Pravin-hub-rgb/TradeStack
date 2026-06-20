"use client";

import { useState } from "react";
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField, Box, Typography,
} from "@mui/material";
import { PY_API } from "./live-trading-utils";

interface TradeEntry {
  id: number; symbol: string; entry_price: number | null;
  entry_sl: number | null; entry_date: string;
  exit_date: string | null; pnl_type: string | null; pnl_amount: number | null;
  quantity?: number; exit_price?: number | null;
}

export default function PnlDialog({
  open, trade, onClose, onSaved,
}: {
  open: boolean; trade: TradeEntry | null; onClose: () => void; onSaved: () => void;
}) {
  const [exitPrice, setExitPrice] = useState(trade?.exit_price ? String(trade.exit_price) : "");
  const [exitDate, setExitDate] = useState(trade?.exit_date || new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);

  const qty = trade?.quantity ?? 100;
  const entryPrice = trade?.entry_price ?? 0;
  const exitPriceNum = parseFloat(exitPrice);
  const hasExitPrice = !isNaN(exitPriceNum) && exitPriceNum > 0;
  const previewPnl = hasExitPrice ? (exitPriceNum - entryPrice) * qty : null;

  const handleSave = async () => {
    if (!trade) return;
    setSaving(true);
    const exitVal = exitPrice ? parseFloat(exitPrice) : null;
    await fetch(`${PY_API}/api/trades/${trade.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        exit_date: exitDate || null,
        exit_price: (exitVal && !isNaN(exitVal)) ? exitVal : null,
      }),
    }).catch(() => {});
    setSaving(false);
    onSaved();
    onClose();
  };

  const handleDelete = async () => {
    if (!trade) return;
    await fetch(`${PY_API}/api/trades/${trade.id}`, { method: "DELETE" }).catch(() => {});
    onSaved();
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth
      slotProps={{ paper: { sx: { bgcolor: "#1a1a1a", backgroundImage: "none", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 3 } } }}>
      <DialogTitle sx={{ color: "#f1f5f9", fontWeight: 700, fontSize: "1rem" }}>
        {trade?.symbol} — Edit Trade
      </DialogTitle>
      <DialogContent sx={{ pt: 2 }}>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5, mt: 1 }}>
          <TextField label="Entry Price" value={entryPrice ? `₹${entryPrice.toFixed(2)}` : ""}
            size="small" disabled
            sx={{ "& .MuiInputBase-root": { color: "#94a3b8", bgcolor: "#111" }, "& .MuiInputLabel-root": { color: "#64748b" } }} />

          <TextField label="Quantity" value={qty} size="small" disabled
            sx={{ "& .MuiInputBase-root": { color: "#94a3b8", bgcolor: "#111" }, "& .MuiInputLabel-root": { color: "#64748b" } }} />

          <TextField label="Exit Date" type="date" value={exitDate}
            onChange={(e) => setExitDate(e.target.value)} size="small"
            slotProps={{ inputLabel: { shrink: true } }}
            sx={{ "& .MuiInputBase-root": { color: "#f1f5f9", bgcolor: "#111" }, "& .MuiInputLabel-root": { color: "#64748b" } }} />

          <TextField label="Exit Price (₹)" type="number" value={exitPrice}
            onChange={(e) => setExitPrice(e.target.value)} size="small"
            slotProps={{ htmlInput: { min: 0, step: 0.05 } }}
            sx={{ "& .MuiInputBase-root": { color: "#f1f5f9", bgcolor: "#111" }, "& .MuiInputLabel-root": { color: "#64748b" } }} />

          {previewPnl !== null && (
            <Box sx={{ p: 2, borderRadius: 2, bgcolor: previewPnl >= 0 ? "rgba(16,185,129,0.1)" : "rgba(239,68,68,0.1)", border: `1px solid ${previewPnl >= 0 ? "rgba(16,185,129,0.3)" : "rgba(239,68,68,0.3)"}` }}>
              <Typography variant="body2" sx={{ color: previewPnl >= 0 ? "#10b981" : "#ef4444", fontWeight: 700, fontFamily: "monospace", fontSize: "1rem" }}>
                P&L: {previewPnl >= 0 ? "+" : ""}₹{previewPnl.toFixed(2)}
              </Typography>
              <Typography variant="caption" sx={{ color: "#64748b", fontSize: "0.7rem" }}>
                ({qty} shares × ₹{(exitPriceNum - entryPrice).toFixed(2)} per share)
              </Typography>
            </Box>
          )}
        </Box>
      </DialogContent>
      <DialogActions sx={{ p: 2, gap: 1 }}>
        <Button onClick={handleDelete} color="error"
          sx={{ textTransform: "none", fontWeight: 600, color: "#ef4444" }}>
          Delete
        </Button>
        <Box sx={{ flex: 1 }} />
        <Button onClick={onClose} sx={{ textTransform: "none", color: "#94a3b8", fontWeight: 600 }}>Cancel</Button>
        <Button onClick={handleSave} disabled={saving} variant="contained"
          sx={{ textTransform: "none", fontWeight: 600, bgcolor: "#6366f1", "&:hover": { bgcolor: "#4f46e5" }, borderRadius: "8px" }}>
          {saving ? "Saving..." : "Save"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
