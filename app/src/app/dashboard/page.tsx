import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { getDashboardData } from "@/lib/dashboard";
import { prisma } from "@/lib/prisma";
import { getRecentSyncs } from "@/lib/sync";
import { DashboardClient } from "./DashboardClient";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const [data, batches, syncLogs] = await Promise.all([
    getDashboardData(),
    prisma.importBatch.findMany({ orderBy: { uploadedAt: "desc" }, take: 20 }),
    getRecentSyncs(10),
  ]);

  return (
    <DashboardClient
      initialData={data}
      initialBatches={batches.map((b) => ({
        id: b.id,
        filename: b.filename,
        uploadedAt: b.uploadedAt.toISOString(),
        rowsTickets: b.rowsTickets,
        rowsExpenses: b.rowsExpenses,
        status: b.status,
      }))}
      initialSyncLogs={syncLogs.map((s) => ({
        id: s.id,
        startedAt: s.startedAt.toISOString(),
        completedAt: s.completedAt?.toISOString() ?? null,
        status: s.status,
        rowsTickets: s.rowsTickets,
        rowsExpenses: s.rowsExpenses,
        triggeredBy: s.triggeredBy,
        error: s.error ?? null,
      }))}
      userEmail={session.user?.email ?? ""}
      userId={session.user?.id ?? ""}
      userRole={session.user?.role ?? "VIEWER"}
    />
  );
}
