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
 */
import { google } from "googleapis";
import type { RawTicketRow, RawExpenseRow } from "@/lib/excel";

// ─── Config ───────────────────────────────────────────────────────────────────

export const SHEET_ID =
  process.env.GOOGLE_SHEET_ID ?? "1UxP652ru_KktFQQ08RKcEQOcIj-ybJZA";

export const SHEET_ID_2 = process.env.GOOGLE_SHEET_ID_2 ?? "";

const TICKET_TAB_VARIANTS = ["Ticket Data", "1 Ticket Data", "ticket data", "Tickets"];
const EXPENSE_TAB_VARIANTS = ["Expenses", "expenses", "Expense"];

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

/** Convert a 2-D values array from the Sheets API into array-of-objects. */
function valuesToRows(values: string[][]): Record<string, string>[] {
  if (!values || values.length < 2) return [];
  const [rawHeaders, ...dataRows] = values;
  const headers = rawHeaders.map((h) => String(h ?? "").trim());
  return dataRows
    .filter((row) => row.some((cell) => String(cell ?? "").trim() !== ""))
    .map((row) => {
      const obj: Record<string, string> = {};
      headers.forEach((h, i) => {
        obj[h] = String(row[i] ?? "").trim();
      });
      return obj;
    });
}

function norm(s: string) {
  return s.toLowerCase().trim();
}

function pick(
  row: Record<string, string>,
  ...candidates: string[]
): string {
  const normCandidates = candidates.map(norm);
  const key = Object.keys(row).find((k) => normCandidates.includes(norm(k)));
  return key !== undefined ? row[key] : "";
}

function num(v: string): number {
  const n = parseFloat(v.replace(/[^0-9.\-]/g, ""));
  return isNaN(n) ? 0 : n;
}

function parseDate(v: string): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

function str(v: string): string | null {
  return v === "" ? null : v;
}

// ─── Sheet-specific parsers ───────────────────────────────────────────────────

function parseTicketRows(rows: Record<string, string>[]): RawTicketRow[] {
  return rows
    .map((row) => {
      const event = pick(row, "event", "event name", "show", "show name");
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
        platform: str(pick(row, "platform", "marketplace", "site", "purchased at", "sold/listed")),
        account: str(pick(row, "account", "seller account", "account name")),
        status: str(pick(row, "status", "sale status", "listing status", "paid out", "all delivered")),
      } satisfies RawTicketRow;
    })
    .filter((r): r is RawTicketRow => r !== null);
}

function parseExpenseRows(rows: Record<string, string>[]): RawExpenseRow[] {
  return rows
    .map((row) => {
      const amount = num(pick(row, "amount", "cost", "value", "expense amount"));
      const description = pick(row, "description", "expense", "note", "item");
      if (amount === 0 && !description) return null;

      return {
        date: parseDate(pick(row, "date", "expense date")),
        description: str(description),
        category: str(pick(row, "category", "type", "kind")),
        amount,
      } satisfies RawExpenseRow;
    })
    .filter((r): r is RawExpenseRow => r !== null);
}

// ─── Main fetch ───────────────────────────────────────────────────────────────

export interface SheetsData {
  tickets: RawTicketRow[];
  expenses: RawExpenseRow[];
}

async function fetchFromSheet(
  sheets: ReturnType<typeof google.sheets>,
  spreadsheetId: string
): Promise<SheetsData> {
  // Get actual tab names from the spreadsheet
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const tabNames = (meta.data.sheets ?? [])
    .map((s) => s.properties?.title ?? "")
    .filter(Boolean);

  const findTab = (keywords: string[]) =>
    tabNames.find((t) =>
      keywords.some((kw) => t.toLowerCase().includes(kw.toLowerCase()))
    );

  const ticketTab = findTab(["ticket"]);
  const expenseTab = findTab(["expense"]);

  const getTab = async (tabName: string | undefined) => {
    if (!tabName) return [] as string[][];
    try {
      const res = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `'${tabName}'`,
        valueRenderOption: "FORMATTED_VALUE",
        dateTimeRenderOption: "FORMATTED_STRING",
      });
      return (res.data.values ?? []) as string[][];
    } catch {
      return [] as string[][];
    }
  };

  const [ticketValues, expenseValues] = await Promise.all([
    getTab(ticketTab),
    getTab(expenseTab),
  ]);

  return {
    tickets: parseTicketRows(valuesToRows(ticketValues)),
    expenses: parseExpenseRows(valuesToRows(expenseValues)),
  };
}

export async function fetchSheetData(): Promise<SheetsData> {
  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });

  const sheetIds = [SHEET_ID, SHEET_ID_2].filter(Boolean);

  const results = await Promise.all(
    sheetIds.map((id) => fetchFromSheet(sheets, id))
  );

  return {
    tickets: results.flatMap((r) => r.tickets),
    expenses: results.flatMap((r) => r.expenses),
  };
}
