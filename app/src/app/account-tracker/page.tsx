import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseStatsCsv, getAccountSummaries } from "@/lib/stats-csv";
import { AccountTrackerClient } from "./AccountTrackerClient";

export const dynamic = "force-dynamic";

export default async function AccountTrackerPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const rows = parseStatsCsv();
  const accounts = getAccountSummaries(rows);
  const eventNameRecords = await prisma.statsEventName.findMany();
  const eventNames: Record<string, string> = {};
  for (const r of eventNameRecords) {
    eventNames[r.eventUrl] = r.eventName;
  }

  const userRole = ((session.user as { role?: string })?.role ?? "VIEWER") as "ADMIN" | "VIEWER";

  return (
    <AccountTrackerClient
      accounts={accounts}
      eventNames={eventNames}
      userRole={userRole}
      userEmail={session.user?.email ?? ""}
    />
  );
}
