/**
 * Cron endpoint — called by Vercel Cron (see vercel.json).
 * Protected by CRON_SECRET so only Vercel's scheduler can trigger it.
 */
import { NextRequest, NextResponse } from "next/server";
import { runSync } from "@/lib/sync";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const result = await runSync("cron");
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
