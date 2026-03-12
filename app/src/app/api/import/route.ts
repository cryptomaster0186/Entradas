import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { parseWorkbook } from "@/lib/excel";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
// Allow up to 20 MB uploads
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  // Auth guard
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

  const filename = (file as File).name ?? "upload.xlsx";
  const buffer = Buffer.from(await file.arrayBuffer());

  let parsed: Awaited<ReturnType<typeof parseWorkbook>>;
  try {
    parsed = parseWorkbook(buffer);
  } catch (err) {
    console.error("Excel parse error:", err);
    return NextResponse.json(
      { error: "Failed to parse Excel file. Ensure it contains 'Ticket Data' and 'Expenses' sheets." },
      { status: 422 }
    );
  }

  const { tickets, expenses } = parsed;

  if (tickets.length === 0 && expenses.length === 0) {
    return NextResponse.json(
      { error: "No data found in the uploaded file." },
      { status: 422 }
    );
  }

  // Create a batch record
  const batch = await prisma.importBatch.create({
    data: {
      filename,
      rowsTickets: tickets.length,
      rowsExpenses: expenses.length,
      status: "PENDING",
    },
  });

  try {
    // Persist tickets
    if (tickets.length > 0) {
      await prisma.ticketData.createMany({
        data: tickets.map((t) => ({ ...t, importBatch: batch.id })),
      });
    }

    // Persist expenses
    if (expenses.length > 0) {
      await prisma.expense.createMany({
        data: expenses.map((e) => ({ ...e, importBatch: batch.id })),
      });
    }

    // Mark batch complete
    await prisma.importBatch.update({
      where: { id: batch.id },
      data: { status: "COMPLETED" },
    });

    return NextResponse.json({
      success: true,
      batchId: batch.id,
      rowsTickets: tickets.length,
      rowsExpenses: expenses.length,
    });
  } catch (err) {
    console.error("DB insert error:", err);
    await prisma.importBatch.update({
      where: { id: batch.id },
      data: { status: "FAILED" },
    });
    return NextResponse.json({ error: "Database error during import" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const batchId = searchParams.get("batchId");

  if (batchId) {
    await prisma.ticketData.deleteMany({ where: { importBatch: batchId } });
    await prisma.expense.deleteMany({ where: { importBatch: batchId } });
    await prisma.importBatch.delete({ where: { id: batchId } });
    return NextResponse.json({ success: true });
  }

  // Delete ALL data
  await prisma.ticketData.deleteMany();
  await prisma.expense.deleteMany();
  await prisma.importBatch.deleteMany();
  return NextResponse.json({ success: true });
}
