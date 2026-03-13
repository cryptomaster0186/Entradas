import * as fs from "fs";
import * as path from "path";

export interface StatsRow {
  email: string;
  eventUrl: string;
  initialQueueSpot: number;
}

export interface AccountSummary {
  email: string;
  eventCount: number;
  uniqueEventCount: number;
}

export function extractEventId(eventUrl: string): string {
  try {
    const url = new URL(eventUrl);
    const parts = url.pathname.split("/").filter(Boolean);
    return parts[parts.length - 1] ?? eventUrl;
  } catch {
    return eventUrl;
  }
}

export function parseStatsCsv(): StatsRow[] {
  const filePath = path.join(process.cwd(), "stats.csv");
  let content: string;
  try {
    content = fs.readFileSync(filePath, "utf-8");
  } catch {
    return [];
  }

  const lines = content.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];

  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const emailIdx = headers.indexOf("email");
  const urlIdx = headers.indexOf("eventurl");
  const posIdx = headers.indexOf("initialqueuespot");

  if (emailIdx === -1 || urlIdx === -1 || posIdx === -1) return [];

  const rows: StatsRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",").map((c) => c.trim());
    if (cols.length <= Math.max(emailIdx, urlIdx, posIdx)) continue;
    const email = cols[emailIdx];
    const eventUrl = cols[urlIdx];
    const initialQueueSpot = parseInt(cols[posIdx], 10);
    if (!email || !eventUrl || isNaN(initialQueueSpot)) continue;
    rows.push({ email, eventUrl, initialQueueSpot });
  }
  return rows;
}

export function getAccountSummaries(rows: StatsRow[]): AccountSummary[] {
  const map = new Map<string, { total: number; urls: Set<string> }>();
  for (const row of rows) {
    const entry = map.get(row.email) ?? { total: 0, urls: new Set() };
    entry.total += 1;
    entry.urls.add(row.eventUrl);
    map.set(row.email, entry);
  }
  return Array.from(map.entries())
    .map(([email, { total, urls }]) => ({
      email,
      eventCount: total,
      uniqueEventCount: urls.size,
    }))
    .sort((a, b) => a.email.localeCompare(b.email));
}
