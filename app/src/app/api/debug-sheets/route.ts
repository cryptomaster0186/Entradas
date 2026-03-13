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
  if (!email || !key) throw new Error("Missing Google credentials");
  return new google.auth.GoogleAuth({
    credentials: { client_email: email, private_key: key },
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if ((session.user as { role?: string })?.role !== "ADMIN")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });

  const sheetId = SHEET_ID_3 || SHEET_ID;

  const meta = await sheets.spreadsheets.get({ spreadsheetId: sheetId });
  const tabs = (meta.data.sheets ?? []).map((s) => s.properties?.title ?? "").filter(Boolean);

  const tabData: Record<string, { row: number; col: number; value: unknown }[]> = {};

  for (const tab of tabs) {
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
  }

  return NextResponse.json({
    sheetId,
    tabs,
    tabData,
  });
}
