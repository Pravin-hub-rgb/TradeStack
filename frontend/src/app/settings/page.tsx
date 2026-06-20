"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Box, Typography, Paper, TextField, Switch, Button,
  CircularProgress, IconButton, Tooltip, Snackbar, Alert,
  Accordion, AccordionSummary, AccordionDetails,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import SaveIcon from "@mui/icons-material/Save";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import VisibilityIcon from "@mui/icons-material/Visibility";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";

const API = "http://127.0.0.1:8001";

const CATEGORIES: Record<string, string> = {
  trading_schedule: "Trading Schedule",
  risk_management: "Risk Management",
  entry_conditions: "Entry Conditions",
  scanner_base: "Scanner \u2014 Base Filters",
  scanner_continuation: "Scanner \u2014 Continuation",
  scanner_reversal: "Scanner \u2014 Reversal",
  volume_validation: "Volume Validation",
  volume_profile: "Volume Profile",
  indicators: "Technical Indicators",
  connection: "Connection",
  error_handling: "Error Handling",
  credentials: "API Credentials",
  paper_trading: "Paper Trading",
  data_management: "Data Management",
  logging: "Logging",
};

interface Setting {
  key: string; value: string; type: string; category: string;
  label: string; description: string; min?: string; max?: string; step?: string;
}

export default function SettingsPage() {
  const [settings, setSettings] = useState([] as Setting[]);
  const [original, setOriginal] = useState({} as Record<string, string>);
  const [edited, setEdited] = useState({} as Record<string, string>);
  const [saving, setSaving] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; severity: "success" | "error" } | null>(null);
  const [showPasswords, setShowPasswords] = useState(false);
  const [resetting, setResetting] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      try {
        const res = await fetch(`${API}/api/settings`, { signal: controller.signal });
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        const d = await res.json();
        setSettings(d.settings);
        setLoadError(null);
        const e: Record<string, string> = {};
        d.settings.forEach((s: Setting) => { e[s.key] = s.value; });
        setEdited(e);
        setOriginal({ ...e });
      } catch (err: any) {
        if (err.name === "AbortError") return;
        setLoadError(`Could not load settings \u2014 ${err.message}`);
        setToast({ msg: "Failed to load from backend. Make sure the Python server (port 8001) is running.", severity: "error" });
      }
    };
    load();
    return () => controller.abort();
  }, []);

  const isDirty = (key: string) => edited[key] !== original[key];

  const save = useCallback(async (key: string) => {
    setSaving(key);
    try {
      const res = await fetch(`${API}/api/settings/${key}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: String(edited[key] ?? "") }),
      });
      if (!res.ok) throw new Error(await res.text());
      setOriginal(p => ({ ...p, [key]: edited[key] }));
      setToast({ msg: "Saved", severity: "success" });
    } catch {
      setToast({ msg: "Failed to save", severity: "error" });
    }
    setSaving(null);
  }, [edited]);

  const resetCat = useCallback(async (cat: string) => {
    setResetting(cat);
    try {
      const res = await fetch(`${API}/api/settings/reset/${cat}`, { method: "POST" });
      if (!res.ok) throw new Error(await res.text());
      const r2 = await fetch(`${API}/api/settings`);
      const d = await r2.json();
      setSettings(d.settings);
      const e: Record<string, string> = {};
      d.settings.forEach((s: Setting) => { e[s.key] = s.value; });
      setEdited(e);
      setOriginal({ ...e });
      setToast({ msg: "Reset to defaults", severity: "success" });
    } catch {
      setToast({ msg: "Failed to reset", severity: "error" });
    }
    setResetting(null);
  }, []);

  const list = settings || [];
  const categories = [...new Set(list.map(s => s.category))].sort();
  const catSettings = (cat: string) => list.filter(s => s.category === cat);

  const renderInput = (s: Setting) => {
    if (s.type === "boolean") {
      return (
        <Switch
          checked={edited[s.key] === "true"}
          onChange={e => setEdited(p => ({ ...p, [s.key]: e.target.checked ? "true" : "false" }))}
          sx={{ "& .MuiSwitch-switchBase.Mui-checked": { color: "#6366f1" },
                "& .MuiSwitch-switchBase.Mui-checked+.MuiSwitch-track": { background: "#6366f1" } }}
        />
      );
    }
    if (s.type === "password") {
      return (
        <TextField
          size="small" type={showPasswords ? "text" : "password"}
          value={edited[s.key] ?? ""}
          onChange={e => setEdited(p => ({ ...p, [s.key]: e.target.value }))}
          sx={{ input: { color: "#e0e0e0", fontSize: "0.85rem", fontFamily: "monospace" },
                "& .MuiOutlinedInput-root": { "& fieldset": { borderColor: "rgba(255,255,255,0.15)" },
                                               "&:hover fieldset": { borderColor: "rgba(255,255,255,0.3)" },
                                               "&.Mui-focused fieldset": { borderColor: "#6366f1" } } }}
          slotProps={{ input: { endAdornment: (
            <IconButton size="small" onClick={() => setShowPasswords(p => !p)} sx={{ color: "rgba(255,255,255,0.4)" }}>
              {showPasswords ? <VisibilityOffIcon fontSize="small" /> : <VisibilityIcon fontSize="small" />}
            </IconButton>
          )}}}
        />
      );
    }
    return (
      <TextField
        size="small"
        value={edited[s.key] ?? ""}
        onChange={e => setEdited(p => ({ ...p, [s.key]: e.target.value }))}
        type={s.type === "number" ? "number" : "text"}
        slotProps={s.type === "number" ? {
          htmlInput: { min: s.min, max: s.max, step: s.step }
        } : undefined}
        sx={{ width: 160,
              "& .MuiOutlinedInput-root": { borderRadius: "8px",
                "& fieldset": { borderColor: "rgba(255,255,255,0.15)" },
                "&:hover fieldset": { borderColor: "rgba(255,255,255,0.3)" },
                "&.Mui-focused fieldset": { borderColor: "#6366f1" },
              },
              "& input": { color: "#e0e0e0", fontSize: "0.9rem", textAlign: "right", py: "10px", px: "12px" },
              "& input[type=number]": { MozAppearance: "textfield" },
              "& input[type=number]::-webkit-outer-spin-button, & input[type=number]::-webkit-inner-spin-button": {
                WebkitAppearance: "none", margin: 0,
              } }}
      />
    );
  };

  return (
    <Box sx={{ p: 3, maxWidth: 1200, mx: "auto" }}>

      {loadError && (
        <Paper sx={{ mb: 2, p: 2, borderRadius: 2, background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)" }}>
          <Typography variant="body2" sx={{ color: "#ef4444" }}>{loadError}</Typography>
          <Typography variant="caption" sx={{ color: "rgba(255,255,255,0.5)", mt: 0.5, display: "block" }}>
            Make sure the Python backend is running on port 8001 (run `bun run dev` from the project root).
          </Typography>
        </Paper>
      )}

      {!loadError && !settings.length && (
        <Paper sx={{ p: 4, textAlign: "center", borderRadius: 3, background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)" }}>
          <CircularProgress size={28} sx={{ color: "#6366f1" }} />
          <Typography variant="body2" sx={{ color: "rgba(255,255,255,0.4)", mt: 2 }}>
            Loading settings...
          </Typography>
        </Paper>
      )}

      <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
        {categories.map(cat => (
          <Accordion
            key={cat}
            defaultExpanded={false}
            sx={{
              width: "100%",
              background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)",
              borderRadius: "12px !important",
              border: "1px solid rgba(255,255,255,0.06)",
              boxShadow: "0 4px 20px rgba(0,0,0,0.2)",
              "&::before": { display: "none" },
              "&.Mui-expanded": { margin: 0 },
            }}
          >
            <AccordionSummary
              expandIcon={<ExpandMoreIcon sx={{ color: "rgba(255,255,255,0.4)" }} />}
              sx={{ "& .MuiAccordionSummary-content": { alignItems: "center", justifyContent: "space-between" } }}
            >
              <Typography sx={{ fontWeight: 600, color: "#e0e0e0", fontSize: "0.95rem" }}>
                {CATEGORIES[cat] || cat.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase())}
              </Typography>
            </AccordionSummary>

            <AccordionDetails sx={{ pt: 0 }}>
              <Box sx={{ display: "flex", justifyContent: "flex-end", mb: 0.5 }}>
                <Box
                  role="button" tabIndex={0}
                  onClick={e => { e.stopPropagation(); resetCat(cat); }}
                  onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); resetCat(cat); } }}
                  sx={{ display: "inline-flex", alignItems: "center", gap: 0.5, cursor: "pointer",
                         color: "rgba(255,255,255,0.35)", fontSize: "0.75rem", fontWeight: 500,
                         "&:hover": { color: "#ef4444" },
                         userSelect: "none", }}
                >
                  {resetting === cat ? <CircularProgress size={12} sx={{ color: "inherit" }} /> : <RestartAltIcon sx={{ fontSize: 14 }} />}
                  Reset to defaults
                </Box>
              </Box>
              {catSettings(cat).map(s => (
                <Box
                  key={s.key}
                  sx={{
                    display: "flex", alignItems: "center", gap: 1.5,
                    py: 1.25, borderBottom: "1px solid rgba(255,255,255,0.04)",
                    "&:last-child": { borderBottom: "none" },
                  }}
                >
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" sx={{ color: "#c0c0c0", fontWeight: 500, fontSize: "0.85rem" }}>
                      {s.label || s.key}
                    </Typography>
                    {s.description && (
                      <Typography variant="caption" sx={{ color: "rgba(255,255,255,0.3)", fontSize: "0.72rem", display: "block", mt: 0.15 }}>
                        {s.description}
                      </Typography>
                    )}
                  </Box>

                  <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, flexShrink: 0 }}>
                    {renderInput(s)}
                    <Tooltip title={isDirty(s.key) ? "Save" : "No changes"}>
                      <span>
                        <IconButton
                          size="small"
                          onClick={() => save(s.key)}
                          disabled={!isDirty(s.key) || saving === s.key}
                          sx={{ color: isDirty(s.key) ? "#6366f1" : "rgba(255,255,255,0.15)" }}
                        >
                          {saving === s.key ? <CircularProgress size={18} /> : <SaveIcon fontSize="small" />}
                        </IconButton>
                      </span>
                    </Tooltip>
                  </Box>
                </Box>
              ))}
            </AccordionDetails>
          </Accordion>
        ))}
      </Box>

      <Snackbar open={!!toast} autoHideDuration={toast?.severity === "error" ? 8000 : 2000} onClose={() => setToast(null)} anchorOrigin={{ vertical: "bottom", horizontal: "center" }}>
        <Alert severity={toast?.severity || "info"} sx={{ width: "100%" }}>{toast?.msg}</Alert>
      </Snackbar>
    </Box>
  );
}
