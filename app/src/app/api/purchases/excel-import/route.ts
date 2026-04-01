/**
 * POST /api/purchases/excel-import
 *
 * Accepts a multipart/form-data upload with:
 *   - file: the .xlsx workbook
 *   - dryRun: "true" | "false"  (default: "false")
 *
 * dryRun=true  → parse only, return preview rows without saving
 * dryRun=false → parse + upsert, create ExcelImportRun record
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { parseTicketExcel } from "@/lib/ticket-excel";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!file || !(file instanceof Blob)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  const dryRun = (formData.get("dryRun") ?? "false") === "true";
  const filename = file instanceof File ? file.name : "upload.xlsx";

  // Read the file into a Buffer
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // Parse
  let parseResult;
  try {
    parseResult = parseTicketExcel(buffer);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Failed to parse file: ${msg}` }, { status: 422 });
  }

  const { rows, totalRows, skippedRows: parseSkipped } = parseResult;

  if (dryRun) {
    return NextResponse.json({
      dryRun: true,
      totalRows,
      validRows: rows.length,
      skippedRows: parseSkipped,
      preview: rows.slice(0, 50).map((r) => ({
        rowIndex: r.rowIndex,
        eventName: r.eventName,
        eventDate: r.eventDate,
        venue: r.venue,
        section: r.section,
        row: r.row,
        seatFrom: r.seatFrom,
        seatTo: r.seatTo,
        ticketType: r.ticketType,
        quantity: r.quantity,
        totalCost: r.totalCost,
        costPerTicket: r.costPerTicket,
        account: r.account,
        fingerprint: r.fingerprint,
        parseWarnings: r.parseWarnings,
      })),
    });
  }

  // --- Commit mode ---
  // Create an ExcelImportRun record (status RUNNING)
  const importRun = await prisma.excelImportRun.create({
    data: {
      filename,
      sheetName: "Ticket Data",
      status: "RUNNING",
      totalRows,
    },
  });

  let importedRows = 0;
  let skippedCount = parseSkipped.length;
  let failedCount = 0;
  const skippedDetails: { rowIndex: number; reason: string; fingerprint?: string }[] = [...parseSkipped];
  const failedDetails: { rowIndex: number; error: string }[] = [];

  for (const row of rows) {
    try {
      const existing = await prisma.purchase.findUnique({
        where: { fingerprint: row.fingerprint },
      });

      if (existing) {
        skippedCount++;
        skippedDetails.push({
          rowIndex: row.rowIndex,
          reason: "Duplicate (already imported)",
          fingerprint: row.fingerprint,
        });
        continue;
      }

      await prisma.purchase.create({
        data: {
          source:        "EXCEL",
          eventName:     row.eventName,
          eventDate:     row.eventDate,
          venue:         row.venue,
          purchaseDate:  row.purchaseDate,
          account:       row.account,
          section:       row.section,
          row:           row.row,
          seatFrom:      row.seatFrom,
          seatTo:        row.seatTo,
          ticketType:    row.ticketType,
          quantity:      row.quantity,
          pricePaid:     row.totalCost,
          costPerTicket: row.costPerTicket,
          currency:      "GBP",
          status:        "CONFIRMED",
          parseStatus:   row.parseWarnings.length > 0 ? "PARTIAL" : "OK",
          parseError:    row.parseWarnings.length > 0 ? row.parseWarnings.join("; ") : null,
          fingerprint:   row.fingerprint,
          importRunId:   importRun.id,
        },
      });
      importedRows++;
    } catch (err: unknown) {
      failedCount++;
      const msg = err instanceof Error ? err.message : String(err);
      failedDetails.push({ rowIndex: row.rowIndex, error: msg });
    }
  }

  // Update the run record
  const finalStatus = failedCount > 0 && importedRows === 0 ? "FAILED" : "COMPLETED";
  await prisma.excelImportRun.update({
    where: { id: importRun.id },
    data: {
      status:        finalStatus,
      importedRows,
      skippedRows:   skippedCount,
      failedRows:    failedCount,
      skippedDetails: skippedDetails.length > 0 ? JSON.stringify(skippedDetails) : null,
      failedDetails:  failedDetails.length > 0 ? JSON.stringify(failedDetails) : null,
    },
  });

  return NextResponse.json({
    dryRun: false,
    importRunId: importRun.id,
    totalRows,
    importedRows,
    skippedRows: skippedCount,
    failedRows: failedCount,
    skippedDetails,
    failedDetails,
    status: finalStatus,
  }, { status: 201 });
}
