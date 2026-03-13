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

// ─── Financial Summary parsers ────────────────────────────────────────────────

export interface FinancialSummaryKPIs {
  totalExpenses: number;
  totalSpend: number;
  revenue: number;
  netIncome: number;
  profitOnSales: number;
  extraExpenses: number;
  unsoldInventoryCost: number;
}

/**
 * Reads the Financial Summary tab and extracts the main KPI values.
 * Strategy: scan every cell for known label keywords; the value is in the
 * adjacent cell to the right (or, if the label spans cols, one column over).
 */
export async function fetchFinancialSummaryKPIs(
  sheets: ReturnType<typeof google.sheets>,
  spreadsheetId: string
): Promise<FinancialSummaryKPIs | null> {
  if (!spreadsheetId) return null;
  try {
    const meta = await sheets.spreadsheets.get({ spreadsheetId });
    const tabNames = (meta.data.sheets ?? [])
      .map((s) => s.properties?.title ?? "")
      .filter(Boolean);

    const summaryTab = tabNames.find((t) =>
      ["financial", "summary", "dashboard"].some((kw) =>
        t.toLowerCase().includes(kw)
      )
    ) ?? tabNames[0];

    if (!summaryTab) return null;

    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `'${summaryTab}'`,
      valueRenderOption: "UNFORMATTED_VALUE",
      dateTimeRenderOption: "SERIAL_NUMBER",
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const values = (res.data.values ?? []) as any[][];

    // Log first few rows for debugging structure
    console.log(`[sync] Financial Summary tab "${summaryTab}" has ${values.length} rows`);
    for (let r = 0; r < Math.min(values.length, 5); r++) {
      console.log(`[sync]   Row ${r}:`, values[r]?.slice(0, 8));
    }

    // Build a map of label (normalised) → number value found adjacent
    const found: Record<string, number> = {};

    // Helper to extract a number from a cell value (accepts 0)
    const cellNum = (v: unknown): number | null => {
      if (typeof v === "number" && !isNaN(v)) return v;
      if (typeof v === "string" && v.trim()) {
        const n = num(v);
        // Accept 0 only if the string looks like a number
        if (n !== 0 || /^[\d€$£¥\s.,%-]+$/.test(v.trim())) return n;
      }
      return null;
    };

    for (let r = 0; r < values.length; r++) {
      const row = values[r] ?? [];
      for (let c = 0; c < row.length; c++) {
        const cell = String(row[c] ?? "").toLowerCase().trim();
        if (!cell) continue;

        // Check against known labels
        const matchLabel = (kw: string) => cell === kw || cell.includes(kw);

        // Look right for the numeric value (try up to 3 cols right)
        // Then look below (same col, up to 2 rows)
        const findValue = (): number | null => {
          // Right
          for (let dc = 1; dc <= 3; dc++) {
            const v = cellNum(row[c + dc]);
            if (v !== null) return v;
          }
          // Below
          for (let dr = 1; dr <= 2; dr++) {
            const belowRow = values[r + dr];
            if (!belowRow) continue;
            const v = cellNum(belowRow[c]);
            if (v !== null) return v;
          }
          return null;
        };

        // Match more specific labels first to avoid "expenses" grabbing "total expenses"
        let key: string | null = null;
        if (matchLabel("total expenses") || matchLabel("total expense")) key = "totalExpenses";
        else if (matchLabel("total spend") || matchLabel("total cost") || matchLabel("total purchase")) key = "totalSpend";
        else if (matchLabel("net income") || matchLabel("net profit")) key = "netIncome";
        else if (matchLabel("profit on sales") || matchLabel("profit on sale") || matchLabel("sales profit")) key = "profitOnSales";
        else if (matchLabel("unsold inventory") || matchLabel("unsold stock") || matchLabel("inventory cost")) key = "unsoldInventoryCost";
        else if (matchLabel("revenue") || matchLabel("total revenue") || matchLabel("total income")) key = "revenue";
        else if (cell === "expenses" || matchLabel("extra expenses") || matchLabel("additional expenses") || matchLabel("other expenses")) key = "extraExpenses";

        if (key && !(key in found)) {
          const v = findValue();
          if (v !== null) {
            found[key] = v;
            console.log(`[sync] Financial Summary KPI: "${cell}" (row ${r}, col ${c}) → ${key} = ${v}`);
          }
        }
      }
    }

    console.log("[sync] Financial Summary KPIs found:", found);

    // Return null if we didn't find any essential values
    if (Object.keys(found).length === 0) {
      console.log("[sync] Financial Summary: no KPI values found in tab");
      // Log all non-empty cells to help debug label matching
      for (let r = 0; r < values.length; r++) {
        const row = values[r] ?? [];
        const nonEmpty = row
          .map((v: unknown, i: number) => (v !== null && v !== undefined && String(v).trim() ? `[${i}]=${v}` : ""))
          .filter(Boolean);
        if (nonEmpty.length > 0) {
          console.log(`[sync]   Row ${r}: ${nonEmpty.join(" | ")}`);
        }
      }
      return null;
    }

    return {
      totalExpenses: found["totalExpenses"] ?? 0,
      totalSpend: found["totalSpend"] ?? 0,
      revenue: found["revenue"] ?? 0,
      netIncome: found["netIncome"] ?? 0,
      profitOnSales: found["profitOnSales"] ?? 0,
      extraExpenses: found["extraExpenses"] ?? 0,
      unsoldInventoryCost: found["unsoldInventoryCost"] ?? 0,
    };
  } catch (err) {
    console.error("[sync] Failed to fetch Financial Summary KPIs:", err);
    return null;
  }
}

// ─── Payout table parser ──────────────────────────────────────────────────────

export interface PayoutEntry {
  platform: string;
  amount: number;
}

/**
 * Reads the payout table from a sheet.
 * Searches every tab for a cell containing "payout" (or "awaiting payout").
 * Then reads rows below to extract platform + amount pairs.
 *
 * Tries multiple layouts:
 *   Layout A: header row has [Platform, Payout] → platform same col-1, amount header col
 *   Layout B: header row has [Payout] alone → platform same col, amount col+1
 *   Layout C: two-column table where col 0=platform, col 1=amount (header contains "payout")
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

    console.log(`[sync] Payout: searching tabs in sheet ${spreadsheetId}:`, tabNames);

    // Try tabs matching keywords first, then all tabs
    const priorityTabs = tabNames.filter((t) =>
      ["financial", "summary", "dashboard", "payout", "awaiting"].some((kw) =>
        t.toLowerCase().includes(kw)
      )
    );
    const tabsToSearch = [...priorityTabs, ...tabNames.filter((t) => !priorityTabs.includes(t))];

    for (const tab of tabsToSearch) {
      const res = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `'${tab}'`,
        valueRenderOption: "UNFORMATTED_VALUE",
        dateTimeRenderOption: "SERIAL_NUMBER",
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const values = (res.data.values ?? []) as any[][];
      if (values.length === 0) continue;

      // Log tab structure for debugging
      console.log(`[sync] Payout: scanning tab "${tab}" (${values.length} rows)`);
      for (let r = 0; r < Math.min(values.length, 3); r++) {
        console.log(`[sync]   Row ${r}:`, values[r]?.slice(0, 10));
      }

      // Find any cell containing "payout" (matches "Payout", "Awaiting Payout", etc.)
      let headerCol = -1;
      let headerRow = -1;
      for (let r = 0; r < values.length; r++) {
        for (let c = 0; c < (values[r]?.length ?? 0); c++) {
          const cell = String(values[r][c] ?? "").toLowerCase().trim();
          if (cell.includes("payout") || cell.includes("pay out")) {
            headerCol = c;
            headerRow = r;
            console.log(`[sync] Payout: found header "${values[r][c]}" at row ${r}, col ${c}`);
            break;
          }
        }
        if (headerCol !== -1) break;
      }

      if (headerCol === -1) continue;

      // Log a few rows below header for debugging
      for (let r = headerRow; r < Math.min(values.length, headerRow + 8); r++) {
        console.log(`[sync]   Payout data row ${r}:`, values[r]?.slice(0, 10));
      }

      // Try to read platform + amount rows below the header
      const entries: PayoutEntry[] = [];

      for (let r = headerRow + 1; r < values.length; r++) {
        const row = values[r] ?? [];

        // Stop at SUM row, TOTAL row, or empty row
        const allCellsStr = row.map((v: unknown) => String(v ?? "").toLowerCase().trim());
        if (allCellsStr.some((s: string) => s === "sum" || s === "total")) break;
        if (row.every((v: unknown) => v === null || v === undefined || String(v).trim() === "")) break;

        // Try multiple layouts to find platform + amount pair
        let platform = "";
        let amount = 0;

        // Layout A: platform is in col to the left of header, amount is in header col
        if (headerCol > 0) {
          const pA = String(row[headerCol - 1] ?? "").trim();
          const aA = row[headerCol];
          if (pA && typeof aA === "number") {
            platform = pA;
            amount = aA;
          }
        }

        // Layout B: platform is in header col, amount is in col to the right
        if (!platform) {
          const pB = String(row[headerCol] ?? "").trim();
          const aB = row[headerCol + 1];
          if (pB && typeof aB === "number") {
            platform = pB;
            amount = aB;
          }
        }

        // Layout C: first non-empty string col = platform, first number col = amount
        if (!platform) {
          let foundPlatform = "";
          let foundAmount = 0;
          for (let c = 0; c < row.length; c++) {
            const v = row[c];
            if (!foundPlatform && typeof v === "string" && v.trim() && !/^\d/.test(v.trim())) {
              foundPlatform = v.trim();
            }
            if (!foundAmount && typeof v === "number" && v > 0) {
              foundAmount = v;
            }
          }
          if (foundPlatform && foundAmount) {
            platform = foundPlatform;
            amount = foundAmount;
          }
        }

        if (platform && amount > 0) {
          entries.push({ platform, amount });
        }
      }

      if (entries.length > 0) {
        console.log(`[sync] Payout table: ${entries.length} entries from tab "${tab}"`, entries);
        return entries;
      }
    }

    console.log("[sync] Payout: no payout table found in any tab");
    return [];
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
  financialSummary: FinancialSummaryKPIs | null;
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

  return { tickets, expenses, payoutEntries: [], financialSummary: null };
}

export async function fetchSheetData(): Promise<SheetsData> {
  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });

  // Deduplicate sheet IDs — if SHEET_ID and SHEET_ID_2 are the same, only fetch once
  const ticketExpenseSheetIds = [...new Set([SHEET_ID, SHEET_ID_2].filter(Boolean))];
  // For Financial Summary KPIs: try SHEET_ID_3, then fall back to SHEET_ID
  const summarySheetId = SHEET_ID_3 || SHEET_ID;
  // For Payout table: try SHEET_ID_3 first, then also try SHEET_ID as fallback
  const payoutSheetIds = [...new Set([SHEET_ID_3, SHEET_ID].filter(Boolean))];

  console.log(`[sync] Fetching ticket/expense data from ${ticketExpenseSheetIds.length} unique sheet(s):`, ticketExpenseSheetIds);
  console.log(`[sync] Fetching Financial Summary from:`, summarySheetId);
  console.log(`[sync] Fetching Payout table from (in order):`, payoutSheetIds);

  // Try payout table from each sheet until we find one
  const tryPayoutFromSheets = async (): Promise<PayoutEntry[]> => {
    for (const id of payoutSheetIds) {
      const entries = await fetchPayoutTable(sheets, id);
      if (entries.length > 0) return entries;
    }
    return [];
  };

  const [results, payoutEntries, financialSummary] = await Promise.all([
    Promise.all(ticketExpenseSheetIds.map((id) => fetchFromSheet(sheets, id))),
    tryPayoutFromSheets(),
    fetchFinancialSummaryKPIs(sheets, summarySheetId),
  ]);

  const merged: SheetsData = {
    tickets: results.flatMap((r) => r.tickets),
    expenses: results.flatMap((r) => r.expenses),
    payoutEntries,
    financialSummary,
  };

  console.log(`[sync] Merged totals — tickets: ${merged.tickets.length}, expenses: ${merged.expenses.length}, payout entries: ${payoutEntries.length}`);

  return merged;
}
