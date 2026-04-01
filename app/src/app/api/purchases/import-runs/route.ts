/**
 * GET /api/purchases/import-runs
 *
 * Returns recent ExcelImportRun and EmailFetchLog records for the logs page.
 * Query params:
 *   page, limit, type ("excel" | "email" | all)
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const page  = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10)));
  const type  = searchParams.get("type") ?? "all"; // "excel" | "email" | "all"

  const skip = (page - 1) * limit;

  const [excelRuns, emailLogs, excelTotal, emailTotal] = await Promise.all([
    type !== "email"
      ? prisma.excelImportRun.findMany({
          orderBy: { createdAt: "desc" },
          skip,
          take: limit,
          select: {
            id: true,
            createdAt: true,
            filename: true,
            sheetName: true,
            status: true,
            totalRows: true,
            importedRows: true,
            skippedRows: true,
            failedRows: true,
            error: true,
          },
        })
      : Promise.resolve([]),
    type !== "excel"
      ? prisma.emailFetchLog.findMany({
          orderBy: { startedAt: "desc" },
          skip,
          take: limit,
          select: {
            id: true,
            startedAt: true,
            completedAt: true,
            status: true,
            emailsScanned: true,
            purchasesAdded: true,
            error: true,
            emailAccount: { select: { label: true, email: true } },
          },
        })
      : Promise.resolve([]),
    type !== "email" ? prisma.excelImportRun.count() : Promise.resolve(0),
    type !== "excel" ? prisma.emailFetchLog.count() : Promise.resolve(0),
  ]);

  return NextResponse.json({
    excelRuns,
    emailLogs,
    excelTotal,
    emailTotal,
    page,
    limit,
  });
}
