/**
 * Dashboard KPI calculations.
 * All numbers are derived from the raw TicketData and Expense tables —
 * never from a "Financial Summary" sheet.
 */
import { prisma } from "@/lib/prisma";

export interface KPISummary {
  totalSpend: number;       // sum of totalCost  (Ticket Data)
  revenue: number;          // sum of income     (Ticket Data)
  profitOnSales: number;    // sum of profit     (Ticket Data)
  extraExpenses: number;    // sum of amount     (Expenses)
  totalExpenses: number;    // totalSpend + extraExpenses
  netIncome: number;        // revenue - totalExpenses
}

export interface PlatformBreakdown {
  platform: string;
  count: number;
  revenue: number;
  profit: number;
}

export interface AwaitingPayout {
  platform: string;
  count: number;
  amount: number;
}

export interface StatusSummary {
  status: string;
  count: number;
  revenue: number;
  profit: number;
}

export interface EventPerformance {
  event: string;
  totalCost: number;
  revenue: number;
  profit: number;
  count: number;
}

export interface AccountPerformance {
  account: string;
  count: number;
  revenue: number;
  profit: number;
}

export interface DashboardData {
  kpis: KPISummary;
  awaitingPayoutByPlatform: AwaitingPayout[];
  totalAwaitingPayout: number;
  platformBreakdown: PlatformBreakdown[];
  statusSummary: StatusSummary[];
  bestEvents: EventPerformance[];
  worstEvents: EventPerformance[];
  accountPerformance: AccountPerformance[];
  lastImport: { filename: string; uploadedAt: string } | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

// ─── Main query ───────────────────────────────────────────────────────────────

export async function getDashboardData(): Promise<DashboardData> {
  // Run all aggregations in parallel
  const [
    ticketAgg,
    expenseAgg,
    latestSync,
    platformRows,
    statusRows,
    eventRows,
    accountRows,
    lastImport,
  ] = await Promise.all([
    // KPI aggregations from Ticket Data
    prisma.ticketData.aggregate({
      _sum: { totalCost: true, income: true, profit: true },
    }),

    // Extra expenses aggregation
    prisma.expense.aggregate({
      _sum: { amount: true },
    }),

    // Latest completed sync log (to read payout snapshot)
    prisma.syncLog.findFirst({
      where: { status: "COMPLETED" },
      orderBy: { startedAt: "desc" },
      select: { payoutSnapshot: true },
    }),

    // Platform breakdown (only rows with a platform)
    prisma.ticketData.groupBy({
      by: ["platform"],
      _count: { id: true },
      _sum: { income: true, profit: true },
      orderBy: { _sum: { income: "desc" } },
    }),

    // Sales status summary
    prisma.ticketData.groupBy({
      by: ["status"],
      _count: { id: true },
      _sum: { income: true, profit: true },
      orderBy: { _count: { id: "desc" } },
    }),

    // Per-event aggregation (for best/worst)
    prisma.ticketData.groupBy({
      by: ["event"],
      _count: { id: true },
      _sum: { totalCost: true, income: true, profit: true },
      orderBy: { _sum: { profit: "desc" } },
    }),

    // Per-account aggregation
    prisma.ticketData.groupBy({
      by: ["account"],
      _count: { id: true },
      _sum: { income: true, profit: true },
      orderBy: { _sum: { profit: "desc" } },
    }),

    // Most recent import
    prisma.importBatch.findFirst({
      orderBy: { uploadedAt: "desc" },
    }),
  ]);

  const totalSpend = round2(ticketAgg._sum.totalCost ?? 0);
  const revenue = round2(ticketAgg._sum.income ?? 0);
  const profitOnSales = round2(ticketAgg._sum.profit ?? 0);
  const extraExpenses = round2(expenseAgg._sum.amount ?? 0);
  const totalExpenses = round2(totalSpend + extraExpenses);
  const netIncome = round2(revenue - totalExpenses);

  // Parse payout snapshot from latest sync (read directly from Financial Summary sheet)
  let awaitingPayoutByPlatform: AwaitingPayout[] = [];
  try {
    const snapshot = latestSync?.payoutSnapshot;
    if (snapshot) {
      const parsed = JSON.parse(snapshot) as { platform: string; amount: number }[];
      awaitingPayoutByPlatform = parsed.map((e) => ({
        platform: e.platform,
        count: 0,
        amount: round2(e.amount),
      }));
    }
  } catch {
    awaitingPayoutByPlatform = [];
  }
  const totalAwaitingPayout = round2(awaitingPayoutByPlatform.reduce((s, r) => s + r.amount, 0));

  const platformBreakdown: PlatformBreakdown[] = platformRows.map((r) => ({
    platform: r.platform ?? "Unknown",
    count: r._count.id,
    revenue: round2(r._sum.income ?? 0),
    profit: round2(r._sum.profit ?? 0),
  }));

  const statusSummary: StatusSummary[] = statusRows.map((r) => ({
    status: r.status ?? "Unknown",
    count: r._count.id,
    revenue: round2(r._sum.income ?? 0),
    profit: round2(r._sum.profit ?? 0),
  }));

  const allEvents: EventPerformance[] = eventRows.map((r) => ({
    event: r.event,
    count: r._count.id,
    totalCost: round2(r._sum.totalCost ?? 0),
    revenue: round2(r._sum.income ?? 0),
    profit: round2(r._sum.profit ?? 0),
  }));

  const bestEvents = allEvents.slice(0, 5);
  const worstEvents = [...allEvents].sort((a, b) => a.profit - b.profit).slice(0, 5);

  const accountPerformance: AccountPerformance[] = accountRows
    .filter((r) => r.account)
    .map((r) => ({
      account: r.account!,
      count: r._count.id,
      revenue: round2(r._sum.income ?? 0),
      profit: round2(r._sum.profit ?? 0),
    }));

  return {
    kpis: { totalSpend, revenue, profitOnSales, extraExpenses, totalExpenses, netIncome },
    awaitingPayoutByPlatform,
    totalAwaitingPayout,
    platformBreakdown,
    statusSummary,
    bestEvents,
    worstEvents,
    accountPerformance,
    lastImport: lastImport
      ? { filename: lastImport.filename, uploadedAt: lastImport.uploadedAt.toISOString() }
      : null,
  };
}
