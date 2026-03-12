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
}

export async function runSync(triggeredBy: "manual" | "cron" = "manual"): Promise<SyncResult> {
  const start = Date.now();

  // Create a running log entry first
  const log = await prisma.syncLog.create({
    data: { status: "RUNNING", triggeredBy },
  });

  try {
    // 1. Fetch fresh data from Google Sheets
    const { tickets, expenses } = await fetchSheetData();

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

    // 4. Mark sync complete
    await prisma.syncLog.update({
      where: { id: log.id },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
        rowsTickets: tickets.length,
        rowsExpenses: expenses.length,
      },
    });

    return {
      syncLogId: log.id,
      rowsTickets: tickets.length,
      rowsExpenses: expenses.length,
      durationMs: Date.now() - start,
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
