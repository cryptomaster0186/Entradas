// Client-safe: types and pure utility functions only (no fs/path imports)

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
