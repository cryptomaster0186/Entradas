import { getServerSession } from "next-auth";
import { redirect, notFound } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseStatsCsv } from "@/lib/stats-csv.server";
import { AccountDetailClient } from "./AccountDetailClient";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function AccountDetailPage({ params }: Props) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const { slug } = await params;
  const email = decodeURIComponent(slug);

  const allRows = parseStatsCsv();
  const rows = allRows.filter((r) => r.email === email);
  if (rows.length === 0) notFound();

  const eventNameRecords = await prisma.statsEventName.findMany();
  const eventNames: Record<string, string> = {};
  for (const r of eventNameRecords) {
    eventNames[r.eventUrl] = r.eventName;
  }

  const userRole = ((session.user as { role?: string })?.role ?? "VIEWER") as "ADMIN" | "VIEWER";

  return (
    <AccountDetailClient
      email={email}
      rows={rows}
      eventNames={eventNames}
      userRole={userRole}
      userEmail={session.user?.email ?? ""}
    />
  );
}
