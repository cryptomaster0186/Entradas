/**
 * Debug endpoint: dumps raw cell data from the Financial Summary sheet.
 * Admin only. Use this to debug label matching issues.
 */
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { google } from "googleapis";
import { SHEET_ID, SHEET_ID_3 } from "@/lib/google-sheets";

export const runtime = "nodejs";
export const maxDuration = 30;

function getAuth() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!email || !key) throw new Error("Missing Google credentials: GOOGLE_SERVICE_ACCOUNT_EMAIL or GOOGLE_PRIVATE_KEY not set");
  return new google.auth.GoogleAuth({
    credentials: { client_email: email, private_key: key },
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Not logged in — please go to /login first" }, { status: 401 });
    if ((session.user as { role?: string })?.role !== "ADMIN")
      return NextResponse.json({ error: "Forbidden — admin only" }, { status: 403 });

    const sheetId = SHEET_ID_3 || SHEET_ID;

    if (!sheetId) {
      return NextResponse.json({ error: "No sheet ID configured. Set GOOGLE_SHEET_ID env var." });
    }

    const auth = getAuth();
    const sheets = google.sheets({ version: "v4", auth });

    const meta = await sheets.spreadsheets.get({ spreadsheetId: sheetId });
    const tabs = (meta.data.sheets ?? []).map((s) => s.properties?.title ?? "").filter(Boolean);

    const tabData: Record<string, { row: number; col: number; value: unknown }[]> = {};

    for (const tab of tabs) {
      try {
        const res = await sheets.spreadsheets.values.get({
          spreadsheetId: sheetId,
          range: `'${tab}'`,
          valueRenderOption: "UNFORMATTED_VALUE",
          dateTimeRenderOption: "SERIAL_NUMBER",
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const values = (res.data.values ?? []) as any[][];
        const cells: { row: number; col: number; value: unknown }[] = [];
        for (let r = 0; r < values.length; r++) {
          const row = values[r] ?? [];
          for (let c = 0; c < row.length; c++) {
            const v = row[c];
            if (v !== null && v !== undefined && String(v).trim() !== "") {
              cells.push({ row: r, col: c, value: v });
            }
          }
        }
        tabData[tab] = cells;
      } catch (tabErr) {
        tabData[tab] = [{ row: -1, col: -1, value: `ERROR: ${tabErr}` }];
      }
    }

    return NextResponse.json({ sheetId, tabs, tabData });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
