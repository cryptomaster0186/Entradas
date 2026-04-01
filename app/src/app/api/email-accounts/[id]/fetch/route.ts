import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { fetchEmailsForAccount } from "@/lib/imap";

// POST /api/email-accounts/[id]/fetch
// Connects to the IMAP server, scans for confirmation emails, and saves new purchases.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  const account = await prisma.emailAccount.findUnique({ where: { id } });
  if (!account) {
    return NextResponse.json({ error: "Email account not found" }, { status: 404 });
  }

  // Create a fetch log entry
  const log = await prisma.emailFetchLog.create({
    data: { emailAccountId: id, status: "RUNNING" },
  });

  // Run the actual IMAP fetch
  const result = await fetchEmailsForAccount(account);

  // Update log + account lastFetched timestamp
  await Promise.all([
    prisma.emailFetchLog.update({
      where: { id: log.id },
      data: {
        completedAt:   new Date(),
        status:        result.error ? "FAILED" : "COMPLETED",
        emailsScanned: result.emailsScanned,
        purchasesAdded: result.purchasesAdded,
        error:         result.error ?? null,
      },
    }),
    prisma.emailAccount.update({
      where: { id },
      data: { lastFetched: new Date() },
    }),
  ]);

  if (result.error) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 422 });
  }

  return NextResponse.json({
    ok: true,
    emailsScanned: result.emailsScanned,
    purchasesAdded: result.purchasesAdded,
  });
}
