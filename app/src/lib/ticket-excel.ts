/**
 * Excel importer for ticket purchase history.
 *
 * Reads the "Ticket Data" sheet from an uploaded .xlsx workbook.
 * Expected columns (case-insensitive, flexible order):
 *   Event, Venue, Date, Purchased At, Account, Section, Row,
 *   Seat From, Seat To, Ticket Type, Qty Bought, Total Cost, Cost Per Ticket
 *
 * Returns typed rows ready to be upserted into the Purchase table.
 */

import * as XLSX from "xlsx";
import { fingerprintExcel } from "./fingerprint";

export interface ExcelTicketRow {
  rowIndex: number;          // 1-based row in the sheet (header = 0)

  eventName: string;
  venue: string | null;
  eventDate: Date | null;
  purchaseDate: Date | null;
  account: string | null;
  section: string | null;
  row: string | null;
  seatFrom: string | null;
  seatTo: string | null;
  ticketType: string | null;
  quantity: number;
  totalCost: number;
  costPerTicket: number | null;

  fingerprint: string;
  parseWarnings: string[];
}

export interface ExcelParseResult {
  rows: ExcelTicketRow[];
  totalRows: number;
  skippedRows: { rowIndex: number; reason: string }[];
}

// ─── Column header aliases ────────────────────────────────────────────────────

const COL_MAP: Record<string, keyof RawRow> = {
  event:            "event",
  venue:            "venue",
  date:             "eventDate",
  "event date":     "eventDate",
  "purchased at":   "purchaseDate",
  "purchase date":  "purchaseDate",
  account:          "account",
  section:          "section",
  row:              "row",
  "seat from":      "seatFrom",
  "seat to":        "seatTo",
  "ticket type":    "ticketType",
  "qty bought":     "quantity",
  qty:              "quantity",
  quantity:         "quantity",
  "total cost":     "totalCost",
  "total":          "totalCost",
  "cost per ticket":"costPerTicket",
  "cost/ticket":    "costPerTicket",
};

interface RawRow {
  event?: unknown;
  venue?: unknown;
  eventDate?: unknown;
  purchaseDate?: unknown;
  account?: unknown;
  section?: unknown;
  row?: unknown;
  seatFrom?: unknown;
  seatTo?: unknown;
  ticketType?: unknown;
  quantity?: unknown;
  totalCost?: unknown;
  costPerTicket?: unknown;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizeHeader(h: unknown): string {
  return String(h ?? "").trim().toLowerCase();
}

function parseNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/[^0-9.-]/g, ""));
  return isNaN(n) ? null : n;
}

function parseDate(v: unknown): Date | null {
  if (v === null || v === undefined || v === "") return null;

  // xlsx serial number (Excel date)
  if (typeof v === "number") {
    const d = XLSX.SSF.parse_date_code(v);
    if (d) return new Date(Date.UTC(d.y, d.m - 1, d.d));
  }

  if (typeof v === "string") {
    const trimmed = v.trim();
    if (!trimmed) return null;
    // Try ISO first, then locale-aware parse
    const d = new Date(trimmed);
    if (!isNaN(d.getTime())) return d;
  }

  return null;
}

function str(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

// ─── Main parser ─────────────────────────────────────────────────────────────

export function parseTicketExcel(buffer: Buffer): ExcelParseResult {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: false });

  // Find the "Ticket Data" sheet (case-insensitive)
  const sheetName = workbook.SheetNames.find(
    (n) => n.trim().toLowerCase() === "ticket data"
  ) ?? workbook.SheetNames[0];

  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    return { rows: [], totalRows: 0, skippedRows: [{ rowIndex: 0, reason: "Sheet not found" }] };
  }

  // Convert to raw array-of-arrays to handle the header manually
  const raw: unknown[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: null,
    raw: true,
  });

  if (raw.length < 2) {
    return { rows: [], totalRows: 0, skippedRows: [] };
  }

  // Build column index map from the first row
  const headerRow = raw[0] as unknown[];
  const colIndex: Partial<Record<keyof RawRow, number>> = {};
  headerRow.forEach((cell, idx) => {
    const norm = normalizeHeader(cell);
    const field = COL_MAP[norm];
    if (field && !(field in colIndex)) {
      colIndex[field] = idx;
    }
  });

  const rows: ExcelTicketRow[] = [];
  const skippedRows: { rowIndex: number; reason: string }[] = [];
  const dataRows = raw.slice(1);

  dataRows.forEach((cells, zeroIdx) => {
    const rowIndex = zeroIdx + 2; // 1-based, header is row 1

    const get = (field: keyof RawRow): unknown => {
      const idx = colIndex[field];
      return idx !== undefined ? cells[idx] : undefined;
    };

    const eventName = str(get("event"));
    if (!eventName) {
      // Completely blank rows are silently skipped; rows with partial data are flagged
      const hasAnyData = cells.some((c) => c !== null && c !== undefined && String(c).trim() !== "");
      if (hasAnyData) {
        skippedRows.push({ rowIndex, reason: "Missing event name" });
      }
      return;
    }

    const warnings: string[] = [];

    const eventDate  = parseDate(get("eventDate"));
    const purchaseDate = parseDate(get("purchaseDate"));
    const account    = str(get("account"));
    const venue      = str(get("venue"));
    const section    = str(get("section"));
    const row        = str(get("row"));
    const seatFrom   = str(get("seatFrom"));
    const seatTo     = str(get("seatTo"));
    const ticketType = str(get("ticketType"));

    const qtyRaw     = parseNumber(get("quantity"));
    const quantity   = qtyRaw !== null && qtyRaw > 0 ? Math.round(qtyRaw) : 1;

    const totalCostRaw = parseNumber(get("totalCost"));
    const totalCost    = totalCostRaw ?? 0;

    const costPerTicketRaw = parseNumber(get("costPerTicket"));
    const costPerTicket =
      costPerTicketRaw !== null
        ? costPerTicketRaw
        : totalCost > 0 && quantity > 0
        ? parseFloat((totalCost / quantity).toFixed(2))
        : null;

    if (!eventDate) warnings.push("Missing or unparseable event date");
    if (totalCost === 0) warnings.push("Total cost is zero");

    const fingerprint = fingerprintExcel({
      eventName,
      eventDate,
      account,
      seatFrom,
      seatTo,
      quantity,
    });

    rows.push({
      rowIndex,
      eventName,
      venue,
      eventDate,
      purchaseDate,
      account,
      section,
      row,
      seatFrom,
      seatTo,
      ticketType,
      quantity,
      totalCost,
      costPerTicket,
      fingerprint,
      parseWarnings: warnings,
    });
  });

  return {
    rows,
    totalRows: dataRows.length,
    skippedRows,
  };
}
