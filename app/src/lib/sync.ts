/**
 * Core sync logic: fetch from Google Sheets → wipe Google-sourced rows → insert fresh data.
 * Manual Excel imports are left untouched.
 */
import { prisma } from "@/lib/prisma";
import { fetchSheetData } from "@/lib/google-sheets";

export interface SyncResult {
  syncLogId: string;
  rowsTickets: number;
  rowsExpenses: number;
  durationMs: number;
  financialSummaryFound: boolean;
  payoutEntriesCount: number;
  financialSummary: Record<string, number> | null;
  payoutEntries: { platform: string; amount: number }[];
}

export async function runSync(triggeredBy: "manual" | "cron" = "manual"): Promise<SyncResult> {
  const start = Date.now();

  // Create a running log entry first
  const log = await prisma.syncLog.create({
    data: { status: "RUNNING", triggeredBy },
  });

  try {
    // 1. Fetch fresh data from Google Sheets
    const { tickets, expenses, payoutEntries, financialSummary } = await fetchSheetData();

    // 2. Wipe all previously synced Google-Sheets data in a transaction
    await prisma.$transaction(async (tx) => {
      await tx.ticketData.deleteMany({ where: { source: "GOOGLE_SHEETS" } });
      await tx.expense.deleteMany({ where: { source: "GOOGLE_SHEETS" } });

      // 3. Insert fresh rows tagged with the sync log id as the batch
      if (tickets.length > 0) {
        await tx.ticketData.createMany({
          data: tickets.map((t) => ({
            ...t,
            importBatch: log.id,
            source: "GOOGLE_SHEETS" as const,
          })),
        });
      }

      if (expenses.length > 0) {
        await tx.expense.createMany({
          data: expenses.map((e) => ({
            ...e,
            importBatch: log.id,
            source: "GOOGLE_SHEETS" as const,
          })),
        });
      }
    });

    // 4. Log calculated totals for debugging
    const dbAgg = await prisma.ticketData.aggregate({
      where: { source: "GOOGLE_SHEETS" },
      _sum: { totalCost: true, income: true, profit: true },
    });
    const expAgg = await prisma.expense.aggregate({
      where: { source: "GOOGLE_SHEETS" },
      _sum: { amount: true },
    });
    const totalSpend = dbAgg._sum.totalCost ?? 0;
    const revenue = dbAgg._sum.income ?? 0;
    const profitOnSales = dbAgg._sum.profit ?? 0;
    const extraExpenses = expAgg._sum.amount ?? 0;
    const totalExpenses = totalSpend + extraExpenses;
    const netIncome = revenue - totalExpenses;
    console.log("[sync] DB totals after insert:");
    console.log(`  Total Spend:     ${totalSpend.toFixed(2)}  (expected ~19099.95)`);
    console.log(`  Revenue:         ${revenue.toFixed(2)}  (expected ~16763.54)`);
    console.log(`  Profit on Sales: ${profitOnSales.toFixed(2)}  (expected ~4377.03)`);
    console.log(`  Extra Expenses:  ${extraExpenses.toFixed(2)}  (expected ~3711.71)`);
    console.log(`  Total Expenses:  ${totalExpenses.toFixed(2)}  (expected ~22811.66)`);
    console.log(`  Net Income:      ${netIncome.toFixed(2)}  (expected ~-6048.12)`);

    // 5. Mark sync complete, store payout + summary snapshots
    await prisma.syncLog.update({
      where: { id: log.id },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
        rowsTickets: tickets.length,
        rowsExpenses: expenses.length,
        payoutSnapshot: payoutEntries.length > 0 ? JSON.stringify(payoutEntries) : null,
        summarySnapshot: financialSummary ? JSON.stringify(financialSummary) : null,
      },
    });

    return {
      syncLogId: log.id,
      rowsTickets: tickets.length,
      rowsExpenses: expenses.length,
      durationMs: Date.now() - start,
      financialSummaryFound: !!financialSummary,
      payoutEntriesCount: payoutEntries.length,
      financialSummary: financialSummary as Record<string, number> | null,
      payoutEntries,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.syncLog.update({
      where: { id: log.id },
      data: { status: "FAILED", completedAt: new Date(), error: message },
    });
    throw err;
  }
}

export async function getLastSync() {
  return prisma.syncLog.findFirst({
    orderBy: { startedAt: "desc" },
  });
}

export async function getRecentSyncs(limit = 10) {
  return prisma.syncLog.findMany({
    orderBy: { startedAt: "desc" },
    take: limit,
  });
}
