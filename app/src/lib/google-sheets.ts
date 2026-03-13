/**
 * Google Sheets sync library.
 *
 * Reads "Ticket Data" and "Expenses" tabs from the configured spreadsheet
 * and returns them in the same shape the rest of the app expects.
 *
 * Authentication: Google Service Account
 * Required env vars:
 *   GOOGLE_SHEET_ID              — spreadsheet id (from the URL)
 *   GOOGLE_SERVICE_ACCOUNT_EMAIL — service account client_email
 *   GOOGLE_PRIVATE_KEY           — service account private_key (with literal \n)
 *
 * FIX NOTES (inflated values bug):
 *   - Root cause: FORMATTED_VALUE returned "€140,00" which the old num() parsed as 14000 (100x).
 *   - Fix 1: Use UNFORMATTED_VALUE so numbers arrive as raw JS numbers, no currency strings.
 *   - Fix 2: num() now handles European format (comma decimal, dot thousands) as fallback.
 *   - Fix 3: parseDate() handles DD.M.YYYY. (Croatian) format.
 */
import { google } from "googleapis";
import type { RawTicketRow, RawExpenseRow } from "@/lib/excel";

// ─── Config ───────────────────────────────────────────────────────────────────

export const SHEET_ID =
  process.env.GOOGLE_SHEET_ID ?? "1UxP652ru_KktFQQ08RKcEQOcIj-ybJZA";

export const SHEET_ID_2 = process.env.GOOGLE_SHEET_ID_2 ?? "";
export const SHEET_ID_3 = process.env.GOOGLE_SHEET_ID_3 ?? "";

// ─── Auth ─────────────────────────────────────────────────────────────────────

function getAuth() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!email || !key) {
    throw new Error(
      "Missing Google credentials. Set GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_PRIVATE_KEY in .env"
    );
  }

  return new google.auth.GoogleAuth({
    credentials: { client_email: email, private_key: key },
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

type CellValue = string | number | boolean | null | undefined;

/**
 * Convert a 2-D values array from the Sheets API into array-of-objects.
 * Works with UNFORMATTED_VALUE responses where cells may be numbers/booleans.
 */
function valuesToRows(values: CellValue[][]): Record<string, CellValue>[] {
  if (!values || values.length < 2) return [];
  const [rawHeaders, ...dataRows] = values;
  const headers = rawHeaders.map((h) => String(h ?? "").trim());

  return dataRows
    .filter((row) => row.some((cell) => cell !== null && cell !== undefined && String(cell).trim() !== ""))
    .map((row) => {
      const obj: Record<string, CellValue> = {};
      headers.forEach((h, i) => {
        if (h) obj[h] = row[i] ?? "";
      });
      return obj;
    });
}

function norm(s: string) {
  return s.toLowerCase().trim();
}

function pick(row: Record<string, CellValue>, ...candidates: string[]): CellValue {
  const normCandidates = candidates.map(norm);
  const key = Object.keys(row).find((k) => normCandidates.includes(norm(k)));
  return key !== undefined ? row[key] : "";
}

/**
 * Parse a number from a cell value.
 * With UNFORMATTED_VALUE the cell is already a JS number — just return it.
 * For string fallback, handles both standard (1,234.56) and European (1.234,56) formats.
 */
function num(v: CellValue): number {
  if (typeof v === "number") return isNaN(v) ? 0 : v;
  if (typeof v === "boolean") return v ? 1 : 0;

  let s = String(v ?? "").trim();
  // Strip currency symbols, spaces, percent
  s = s.replace(/[€$£¥%\s]/g, "");
  if (!s || s === "-") return 0;

  // European format detection: ends with comma + exactly 2 digits (e.g. "140,00", "1.244,07")
  if (/,\d{2}$/.test(s)) {
    // Remove thousands dots, convert decimal comma to dot
    s = s.replace(/\./g, "").replace(",", ".");
  } else {
    // Standard format: remove thousands commas
    s = s.replace(/,/g, "");
  }

  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

/**
 * Parse a date cell.
 * Handles:
 *   - JS number (Excel/Sheets serial date when UNFORMATTED_VALUE is used)
 *   - "DD.M.YYYY." / "DD.MM.YYYY." (Croatian format)
 *   - ISO strings and other formats parseable by Date constructor
 */
function parseDate(v: CellValue): Date | null {
  if (!v && v !== 0) return null;

  // Serial number from UNFORMATTED_VALUE (days since 1899-12-30)
  if (typeof v === "number") {
    const ms = (v - 25569) * 86400 * 1000;
    const d = new Date(ms);
    return isNaN(d.getTime()) ? null : d;
  }

  const s = String(v).trim();
  if (!s) return null;

  // Croatian format: "10.5.2025." or "10.05.2025"
  const croatian = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})\.?$/);
  if (croatian) {
    const [, day, month, year] = croatian;
    const d = new Date(Number(year), Number(month) - 1, Number(day));
    return isNaN(d.getTime()) ? null : d;
  }

  // Fallback to JS Date constructor
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function str(v: CellValue): string | null {
  const s = String(v ?? "").trim();
  return s === "" ? null : s;
}

// ─── Sheet-specific parsers ───────────────────────────────────────────────────

function parseTicketRows(rows: Record<string, CellValue>[]): RawTicketRow[] {
  return rows
    .map((row) => {
      const event = str(pick(row, "event", "event name", "show", "show name"));
      if (!event) return null;

      return {
        event,
        eventDate: parseDate(pick(row, "date", "event date", "show date")),
        venue: str(pick(row, "venue", "location")),
        section: str(pick(row, "section", "sec")),
        row: str(pick(row, "row")),
        seats: str(pick(row, "seats", "seat", "seat numbers", "seat from")),
        quantity: Math.max(1, num(pick(row, "quantity", "qty", "qty bought", "tickets"))),
        totalCost: num(pick(row, "total cost", "cost", "purchase price", "paid")),
        income: num(pick(row, "income", "revenue", "sale price", "proceeds")),
        profit: num(pick(row, "profit", "net profit", "gain")),
        // "Sold/Listed" = selling platform (Viagogo, Stubhub) — the one that pays out
        platform: str(pick(row, "sold/listed", "platform", "marketplace", "site")),
        account: str(pick(row, "account", "seller account", "account name")),
        status: str(pick(row, "status", "sale status", "listing status")),
        paidOut: /^y(es)?$/i.test(String(pick(row, "paid out", "paidout", "paid") ?? "").trim()),
      } satisfies RawTicketRow;
    })
    .filter((r): r is RawTicketRow => r !== null);
}

function parseExpenseRows(rows: Record<string, CellValue>[]): RawExpenseRow[] {
  return rows
    .map((row) => {
      const amount = num(pick(row, "amount", "cost", "value", "expense amount"));
      const description = str(pick(row, "description", "expense", "note", "item"));
      if (amount === 0 && !description) return null;

      return {
        date: parseDate(pick(row, "date", "expense date")),
        description,
        category: str(pick(row, "category", "type", "kind")),
        amount,
      } satisfies RawExpenseRow;
    })
    .filter((r): r is RawExpenseRow => r !== null);
}

// ─── Payout table parser ──────────────────────────────────────────────────────

export interface PayoutEntry {
  platform: string;
  amount: number;
}

/**
 * Reads the "Financial Summary" (or similar) tab and extracts the Payout table.
 * Strategy: find the cell containing "Payout" header, then read platform names
 * from the column to its left and amounts from that column, until "SUM" or empty.
 */
export async function fetchPayoutTable(
  sheets: ReturnType<typeof google.sheets>,
  spreadsheetId: string
): Promise<PayoutEntry[]> {
  if (!spreadsheetId) return [];
  try {
    const meta = await sheets.spreadsheets.get({ spreadsheetId });
    const tabNames = (meta.data.sheets ?? [])
      .map((s) => s.properties?.title ?? "")
      .filter(Boolean);

    const summaryTab = tabNames.find((t) =>
      ["financial", "summary", "dashboard", "payout"].some((kw) =>
        t.toLowerCase().includes(kw)
      )
    ) ?? tabNames[0];

    if (!summaryTab) return [];

    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `'${summaryTab}'`,
      valueRenderOption: "UNFORMATTED_VALUE",
      dateTimeRenderOption: "SERIAL_NUMBER",
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const values = (res.data.values ?? []) as any[][];

    // Find the "Payout" header cell
    let payoutCol = -1;
    let payoutRow = -1;
    for (let r = 0; r < values.length; r++) {
      for (let c = 0; c < (values[r]?.length ?? 0); c++) {
        if (String(values[r][c] ?? "").toLowerCase().trim() === "payout") {
          payoutCol = c;
          payoutRow = r;
          break;
        }
      }
      if (payoutCol !== -1) break;
    }

    if (payoutCol === -1) {
      console.log("[sync] Payout header not found in Financial Summary tab");
      return [];
    }

    // Read rows below the header: platform name is in column to the left, amount is payoutCol
    const entries: PayoutEntry[] = [];
    for (let r = payoutRow + 1; r < values.length; r++) {
      const row = values[r] ?? [];
      const platform = String(row[payoutCol - 1] ?? "").trim();
      const amount = row[payoutCol];

      if (!platform || platform.toLowerCase() === "sum") break;
      if (typeof amount === "number" && amount > 0) {
        entries.push({ platform, amount });
      }
    }

    console.log(`[sync] Payout table from Financial Summary: ${entries.length} entries`, entries);
    return entries;
  } catch (err) {
    console.error("[sync] Failed to fetch payout table:", err);
    return [];
  }
}

// ─── Main fetch ───────────────────────────────────────────────────────────────

export interface SheetsData {
  tickets: RawTicketRow[];
  expenses: RawExpenseRow[];
  payoutEntries: PayoutEntry[];
}

async function fetchFromSheet(
  sheets: ReturnType<typeof google.sheets>,
  spreadsheetId: string
): Promise<SheetsData> {
  // Get actual tab names from the spreadsheet metadata
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const tabNames = (meta.data.sheets ?? [])
    .map((s) => s.properties?.title ?? "")
    .filter(Boolean);

  console.log(`[sync] Sheet ${spreadsheetId} tabs:`, tabNames);

  const findTab = (keyword: string) =>
    tabNames.find((t) => t.toLowerCase().includes(keyword.toLowerCase()));

  const ticketTab = findTab("ticket");
  const expenseTab = findTab("expense");

  console.log(`[sync] Ticket tab: ${ticketTab ?? "NOT FOUND"}`);
  console.log(`[sync] Expense tab: ${expenseTab ?? "NOT FOUND"}`);

  const getTab = async (tabName: string | undefined): Promise<CellValue[][]> => {
    if (!tabName) return [];
    try {
      const res = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `'${tabName}'`,
        // UNFORMATTED_VALUE returns raw numbers (not "€140,00") — fixes 100x inflation bug
        valueRenderOption: "UNFORMATTED_VALUE",
        // With UNFORMATTED_VALUE, dates are serial numbers; we handle them in parseDate()
        dateTimeRenderOption: "SERIAL_NUMBER",
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (res.data.values ?? []) as any[][];
    } catch (err) {
      console.error(`[sync] Failed to fetch tab "${tabName}":`, err);
      return [];
    }
  };

  const [ticketValues, expenseValues] = await Promise.all([
    getTab(ticketTab),
    getTab(expenseTab),
  ]);

  const ticketRows = valuesToRows(ticketValues);
  const expenseRows = valuesToRows(expenseValues);

  console.log(`[sync] Raw rows — tickets: ${ticketRows.length}, expenses: ${expenseRows.length}`);

  const tickets = parseTicketRows(ticketRows);
  const expenses = parseExpenseRows(expenseRows);

  console.log(`[sync] Parsed rows — tickets: ${tickets.length}, expenses: ${expenses.length}`);

  if (tickets.length > 0) {
    const totalCost = tickets.reduce((s, t) => s + t.totalCost, 0);
    const income = tickets.reduce((s, t) => s + t.income, 0);
    const profit = tickets.reduce((s, t) => s + t.profit, 0);
    console.log(`[sync] Ticket totals — spend: ${totalCost.toFixed(2)}, revenue: ${income.toFixed(2)}, profit: ${profit.toFixed(2)}`);
  }

  if (expenses.length > 0) {
    const total = expenses.reduce((s, e) => s + e.amount, 0);
    console.log(`[sync] Expense total: ${total.toFixed(2)}`);
  }

  return { tickets, expenses, payoutEntries: [] };
}

export async function fetchSheetData(): Promise<SheetsData> {
  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });

  const sheetIds = [SHEET_ID, SHEET_ID_2, SHEET_ID_3].filter(Boolean);
  console.log(`[sync] Fetching from ${sheetIds.length} sheet(s):`, sheetIds);

  // Fetch ticket/expense data from all sheets + payout table from SHEET_ID_3
  const [results, payoutEntries] = await Promise.all([
    Promise.all(sheetIds.map((id) => fetchFromSheet(sheets, id))),
    SHEET_ID_3 ? fetchPayoutTable(sheets, SHEET_ID_3) : Promise.resolve([]),
  ]);

  const merged: SheetsData = {
    tickets: results.flatMap((r) => r.tickets),
    expenses: results.flatMap((r) => r.expenses),
    payoutEntries,
  };

  console.log(`[sync] Merged totals — tickets: ${merged.tickets.length}, expenses: ${merged.expenses.length}, payout entries: ${payoutEntries.length}`);

  return merged;
}
