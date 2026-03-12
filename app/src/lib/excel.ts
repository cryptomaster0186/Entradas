/**
 * Excel import logic.
 * Uses SheetJS (xlsx) to parse "Ticket Data" and "Expenses" sheets.
 *
 * Column name matching is case-insensitive and trims whitespace so it is
 * resilient to minor formatting differences in the uploaded workbook.
 */
import * as XLSX from "xlsx";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RawTicketRow {
  event: string;
  eventDate: Date | null;
  venue: string | null;
  section: string | null;
  row: string | null;
  seats: string | null;
  quantity: number;
  totalCost: number;
  income: number;
  profit: number;
  platform: string | null;
  account: string | null;
  status: string | null;
}

export interface RawExpenseRow {
  date: Date | null;
  description: string | null;
  category: string | null;
  amount: number;
}

export interface ParsedWorkbook {
  tickets: RawTicketRow[];
  expenses: RawExpenseRow[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function norm(s: unknown): string {
  return String(s ?? "")
    .toLowerCase()
    .trim();
}

function str(v: unknown): string | null {
  const s = String(v ?? "").trim();
  return s === "" ? null : s;
}

function num(v: unknown): number {
  const n = parseFloat(String(v ?? "0").replace(/[^0-9.\-]/g, ""));
  return isNaN(n) ? 0 : n;
}

function date(v: unknown): Date | null {
  if (!v) return null;
  // SheetJS can return a JS Date or a serial number
  if (v instanceof Date) return v;
  if (typeof v === "number") {
    return XLSX.SSF.parse_date_code
      ? new Date((v - 25569) * 86400 * 1000)
      : null;
  }
  const d = new Date(String(v));
  return isNaN(d.getTime()) ? null : d;
}

/** Find the value in a row by matching any of the candidate column keys. */
function pick(
  row: Record<string, unknown>,
  headers: string[],
  ...candidates: string[]
): unknown {
  const normCandidates = candidates.map((c) => c.toLowerCase().trim());
  const key = headers.find((h) => normCandidates.includes(h.toLowerCase().trim()));
  return key !== undefined ? row[key] : undefined;
}

function sheetToRows(sheet: XLSX.WorkSheet): Record<string, unknown>[] {
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
    raw: false,
    dateNF: "yyyy-mm-dd",
  });
}

function getHeaders(sheet: XLSX.WorkSheet): string[] {
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
  });
  if (rows.length === 0) return [];
  return Object.keys(rows[0]);
}

// ─── Sheet parsers ────────────────────────────────────────────────────────────

export function parseTicketSheet(sheet: XLSX.WorkSheet): RawTicketRow[] {
  const rows = sheetToRows(sheet);
  const headers = getHeaders(sheet);

  return rows
    .map((row) => {
      const eventVal = pick(row, headers, "event", "event name", "show", "show name");
      if (!eventVal || String(eventVal).trim() === "") return null;

      return {
        event: String(eventVal).trim(),
        eventDate: date(pick(row, headers, "date", "event date", "show date")),
        venue: str(pick(row, headers, "venue", "location")),
        section: str(pick(row, headers, "section", "sec")),
        row: str(pick(row, headers, "row")),
        seats: str(pick(row, headers, "seats", "seat", "seat numbers")),
        quantity: Math.max(1, num(pick(row, headers, "quantity", "qty", "tickets"))),
        totalCost: num(pick(row, headers, "total cost", "cost", "purchase price", "paid")),
        income: num(pick(row, headers, "income", "revenue", "sale price", "proceeds")),
        profit: num(pick(row, headers, "profit", "net profit", "gain")),
        platform: str(pick(row, headers, "platform", "marketplace", "site")),
        account: str(pick(row, headers, "account", "seller account", "account name")),
        status: str(pick(row, headers, "status", "sale status", "listing status")),
      } satisfies RawTicketRow;
    })
    .filter((r): r is RawTicketRow => r !== null);
}

export function parseExpenseSheet(sheet: XLSX.WorkSheet): RawExpenseRow[] {
  const rows = sheetToRows(sheet);
  const headers = getHeaders(sheet);

  return rows
    .map((row) => {
      const amtVal = pick(row, headers, "amount", "cost", "value", "expense amount");
      const amt = num(amtVal);
      if (amt === 0 && !pick(row, headers, "description", "expense", "note")) return null;

      return {
        date: date(pick(row, headers, "date", "expense date")),
        description: str(pick(row, headers, "description", "expense", "note", "item")),
        category: str(pick(row, headers, "category", "type", "kind")),
        amount: amt,
      } satisfies RawExpenseRow;
    })
    .filter((r): r is RawExpenseRow => r !== null);
}

// ─── Main entry ──────────────────────────────────────────────────────────────

export function parseWorkbook(buffer: Buffer): ParsedWorkbook {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });

  // Try to find sheets by name (case-insensitive)
  const sheetName = (target: string) =>
    workbook.SheetNames.find((n) => n.toLowerCase().trim() === target.toLowerCase().trim());

  const ticketSheetName = sheetName("ticket data") ?? sheetName("tickets") ?? workbook.SheetNames[0];
  const expenseSheetName =
    sheetName("expenses") ?? sheetName("expense") ?? workbook.SheetNames.find((n) => n !== ticketSheetName);

  const tickets = ticketSheetName
    ? parseTicketSheet(workbook.Sheets[ticketSheetName])
    : [];

  const expenses = expenseSheetName
    ? parseExpenseSheet(workbook.Sheets[expenseSheetName])
    : [];

  return { tickets, expenses };
}
