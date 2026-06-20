"use client";

import { Typography, Box, Paper, Button, Chip, CircularProgress } from "@mui/material";
import { Analytics as AnalyticsIcon } from "@mui/icons-material";
import { PY_API } from "./live-trading-utils";
import { useAppState } from "@/lib/AppStateContext";

const StyledPaper = ({ children }: any) => (
  <Paper sx={{ padding: 3, marginBottom: 3, background: "linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%)", border: "1px solid rgba(255, 255, 255, 0.08)", borderRadius: "12px", boxShadow: "0 4px 20px rgba(0, 0, 0, 0.3)" }}>{children}</Paper>
);

const ValidationResult = ({ children }: any) => (
  <Box sx={{ marginTop: 2, padding: 2, backgroundColor: "#0d0d0d", borderRadius: "8px", fontFamily: 'Monaco, Menlo, "Ubuntu Mono", monospace', fontSize: "0.85rem", whiteSpace: "pre-wrap", overflowY: "auto", border: "1px solid #333333", color: "#e0e0e0" }}>{children}</Box>
);

export default function ValidationTab() {
  const { state, setValidationResult, setIsValidating, setValidationStatus } = useAppState();

  const handleValidateLists = async () => {
    setIsValidating(true);
    setValidationStatus("idle");
    setValidationResult("");
    try {
      const [cr, rr] = await Promise.all([
        fetch(`${PY_API}/api/stock-list/continuation`).then(r => r.json()),
        fetch(`${PY_API}/api/stock-list/reversal`).then(r => r.json()),
      ]);
      const cont = cr.stocks || [];
      const rev = rr.stocks || [];
      let output = `Continuation List: ${cont.length} stocks\n`;
      if (cont.length > 0) output += cont.map((s: any) => `  - ${s.symbol}${s.close ? ` (close: ${s.close})` : ""}`).join("\n");
      output += `\n\nReversal List: ${rev.length} stocks\n`;
      if (rev.length > 0) output += rev.map((s: any) => `  - ${s.symbol}${s.close ? ` (close: ${s.close})` : ""}`).join("\n");
      if (cont.length === 0 && rev.length === 0) { output += "\nBoth lists are empty."; setValidationStatus("error"); }
      else setValidationStatus("success");
      setValidationResult(output);
    } catch { setValidationResult("Failed to fetch stock lists"); setValidationStatus("error"); }
    finally { setIsValidating(false); }
  };

  return (
    <StyledPaper>
      <Typography variant="h6" gutterBottom sx={{ fontWeight: 600 }}>Trading Lists Validation</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Validate reversal and continuation stock lists for live trading readiness.
      </Typography>

      <Box sx={{ mb: 3 }}>
        <Button variant="contained" onClick={handleValidateLists} disabled={state.isValidating}
          startIcon={state.isValidating ? <CircularProgress size={20} /> : <AnalyticsIcon />}
          sx={{ background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)", "&:hover": { background: "linear-gradient(135deg, #5a6fd8 0%, #6a4190 100%)" }, borderRadius: "8px", padding: "10px 24px", fontWeight: 600 }}>
          {state.isValidating ? "Validating..." : "Validate Lists"}
        </Button>
        {state.validationStatus !== "idle" && (
          <Chip label={state.validationStatus === "success" ? "Validation Complete" : "Validation Failed"} size="small"
            sx={{ ml: 2, backgroundColor: state.validationStatus === "success" ? "#d1fae5" : "#fee2e2", color: state.validationStatus === "success" ? "#065f46" : "#991b1b", fontWeight: 600 }} />
        )}
      </Box>

      {state.validationResult && (
        <ValidationResult>
          <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>Validation Results:</Typography>
          {state.validationResult}
        </ValidationResult>
      )}
    </StyledPaper>
  );
}
