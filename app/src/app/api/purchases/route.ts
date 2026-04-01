import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { fingerprintManual } from "@/lib/fingerprint";

// GET /api/purchases?page=1&limit=50&platform=xx&status=xx&source=xx&search=xx
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const page     = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const limit    = Math.min(200, Math.max(1, parseInt(searchParams.get("limit") ?? "50", 10)));
  const platform = searchParams.get("platform") ?? undefined;
  const status   = searchParams.get("status") ?? undefined;
  const source   = searchParams.get("source") ?? undefined;
  const search   = searchParams.get("search") ?? undefined;

  const where = {
    ...(platform ? { platform } : {}),
    ...(status   ? { status: status as "CONFIRMED" | "PENDING" | "CANCELLED" | "REFUNDED" } : {}),
    ...(source   ? { source: source as "MANUAL" | "EMAIL" | "EXCEL" } : {}),
    ...(search   ? {
      OR: [
        { eventName: { contains: search, mode: "insensitive" as const } },
        { orderNumber: { contains: search, mode: "insensitive" as const } },
        { venue: { contains: search, mode: "insensitive" as const } },
        { account: { contains: search, mode: "insensitive" as const } },
      ],
    } : {}),
  };

  const [total, purchases] = await Promise.all([
    prisma.purchase.count({ where }),
    prisma.purchase.findMany({
      where,
      // Primary sort: eventDate ASC (nulls last), then createdAt DESC
      orderBy: [
        { eventDate: { sort: "asc", nulls: "last" } },
        { createdAt: "desc" },
      ],
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        eventName: true,
        eventDate: true,
        venue: true,
        section: true,
        row: true,
        seat: true,
        seatFrom: true,
        seatTo: true,
        quantity: true,
        orderNumber: true,
        platform: true,
        account: true,
        pricePaid: true,
        costPerTicket: true,
        currency: true,
        status: true,
        source: true,
        parseStatus: true,
        ticketType: true,
        purchaseDate: true,
        createdAt: true,
      },
    }),
  ]);

  return NextResponse.json({ purchases, total, page, limit });
}

// POST /api/purchases — manually add a purchase
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const {
    eventName, eventDate, venue, section, row, seat, seatFrom, seatTo,
    quantity, orderNumber, platform, account,
    pricePaid, costPerTicket, currency, status,
    ticketType, purchaseDate, provider,
  } = body as Record<string, unknown>;

  if (!eventName || typeof eventName !== "string") {
    return NextResponse.json({ error: "eventName is required" }, { status: 400 });
  }

  const qty = typeof quantity === "number" ? quantity : 1;
  const fingerprint = fingerprintManual({
    eventName,
    eventDate: eventDate ? new Date(eventDate as string) : null,
    account: (account as string) ?? null,
    seatFrom: (seatFrom as string) ?? (seat as string) ?? null,
    seatTo: (seatTo as string) ?? null,
    quantity: qty,
    orderNumber: (orderNumber as string) ?? null,
  });

  try {
    const purchase = await prisma.purchase.create({
      data: {
        eventName,
        eventDate:     eventDate ? new Date(eventDate as string) : null,
        venue:         (venue as string) ?? null,
        section:       (section as string) ?? null,
        row:           (row as string) ?? null,
        seat:          (seat as string) ?? null,
        seatFrom:      (seatFrom as string) ?? null,
        seatTo:        (seatTo as string) ?? null,
        quantity:      qty,
        orderNumber:   (orderNumber as string) ?? null,
        platform:      (platform as string) ?? null,
        account:       (account as string) ?? null,
        pricePaid:     typeof pricePaid === "number" ? pricePaid : 0,
        costPerTicket: typeof costPerTicket === "number" ? costPerTicket : null,
        currency:      (currency as string) ?? "GBP",
        status:        (status as "CONFIRMED" | "PENDING" | "CANCELLED" | "REFUNDED") ?? "CONFIRMED",
        ticketType:    (ticketType as string) ?? null,
        purchaseDate:  purchaseDate ? new Date(purchaseDate as string) : null,
        provider:      (provider as string) ?? null,
        source:        "MANUAL",
        fingerprint,
      },
    });
    return NextResponse.json(purchase, { status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("Unique constraint") && msg.includes("fingerprint")) {
      return NextResponse.json({ error: "Duplicate purchase (same event/date/account/seats)" }, { status: 409 });
    }
    return NextResponse.json({ error: "Failed to create purchase" }, { status: 500 });
  }
}

// PATCH /api/purchases?id=xxx — update fields
export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const body = await req.json();
  const allowedFields = [
    "status", "eventName", "eventDate", "venue", "section", "row",
    "seat", "seatFrom", "seatTo", "quantity", "orderNumber",
    "pricePaid", "costPerTicket", "currency", "ticketType",
    "purchaseDate", "platform", "account", "provider",
  ];
  const data: Record<string, unknown> = {};
  for (const key of allowedFields) {
    if (key in body) data[key] = body[key];
  }
  if (data.eventDate) data.eventDate = new Date(data.eventDate as string);
  if (data.purchaseDate) data.purchaseDate = new Date(data.purchaseDate as string);

  const purchase = await prisma.purchase.update({ where: { id }, data });
  return NextResponse.json(purchase);
}

// DELETE /api/purchases?id=xxx
export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  await prisma.purchase.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
