import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { getDashboardData } from "@/lib/dashboard";
import prisma from "@/lib/prisma";
import { DashboardClient } from "./DashboardClient";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const [data, batches] = await Promise.all([
    getDashboardData(),
    prisma.importBatch.findMany({ orderBy: { uploadedAt: "desc" }, take: 20 }),
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
      userEmail={session.user?.email ?? ""}
    />
  );
}
