/**
 * Shared scanner results table: sortable header from a column config and a
 * per-row toggle cell. Row cells arrive pre-rendered from the caller config.
 */
"use client";

import { Fragment } from "react";
import {
  Table, TableBody, TableCell, TableContainer, TableHead,
  TableRow, TableSortLabel, IconButton, Tooltip,
} from "@mui/material";
import { Add as AddIcon, Close as CloseIcon } from "@mui/icons-material";

export interface ScannerTableColumn {
  key: string;
  label: string;
}

export interface ScannerTableProps<R> {
  columns: ScannerTableColumn[];
  rows: R[];
  rowKey: (row: R) => string;
  sortKey: string;
  sortDir: "asc" | "desc";
  /** Controlled: callers only pass column keys. */
  onSort: (key: string) => void;
  /** Active sort-label color (scanner primary). */
  sortActiveColor: string;
  /** Row toggle icon color when NOT in list (scanner accent). */
  toggleAccentColor: string;
  savedSymbols: string[];
  onToggleRow: (row: R) => void;
  toggleTooltipLabel: string;
  renderCells: (row: R) => React.ReactNode[];
}

export default function ScannerTable<R>({
  columns, rows, rowKey, sortKey, sortDir, onSort, sortActiveColor, toggleAccentColor,
  savedSymbols, onToggleRow, toggleTooltipLabel, renderCells,
}: ScannerTableProps<R>) {
  return (
    <TableContainer>
      <Table size="small">
        <TableHead>
          <TableRow sx={{ backgroundColor: "rgba(255,255,255,0.02)" }}>
            <TableCell sx={{ color: "#94a3b8", fontWeight: 600, width: 80, borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
              Actions
            </TableCell>
            {columns.map((col) => (
              <TableCell key={col.key} sx={{ color: "#94a3b8", fontWeight: 600, borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
                <TableSortLabel
                  active={sortKey === col.key}
                  direction={sortKey === col.key ? sortDir : "asc"}
                  onClick={() => onSort(col.key)}
                  sx={{
                    color: "#94a3b8 !important",
                    "&:hover": { color: "#f8fafc !important" },
                    "&.MuiTableSortLabel-active": { color: `${sortActiveColor} !important` },
                  }}
                >
                  {col.label}
                </TableSortLabel>
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row) => {
            const key = rowKey(row);
            const inList = savedSymbols.includes(key);
            return (
              <TableRow
                key={key}
                hover
                sx={{ "&:hover": { backgroundColor: "rgba(255,255,255,0.02)" } }}
              >
                <TableCell>
                  <Tooltip
                    title={inList ? `Remove from ${toggleTooltipLabel} list` : `Add to ${toggleTooltipLabel} list`}
                    placement="right"
                  >
                    <IconButton
                      size="small"
                      onClick={() => onToggleRow(row)}
                      sx={{ color: inList ? "#ef4444" : toggleAccentColor }}
                    >
                      {inList ? <CloseIcon fontSize="small" /> : <AddIcon fontSize="small" />}
                    </IconButton>
                  </Tooltip>
                </TableCell>
                {renderCells(row).map((cell, i) => (
                  <Fragment key={i}>{cell}</Fragment>
                ))}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
