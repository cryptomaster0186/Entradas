import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

// GET /api/purchases?page=1&limit=50&platform=xx&status=xx&search=xx
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const page    = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const limit   = Math.min(200, Math.max(1, parseInt(searchParams.get("limit") ?? "50", 10)));
  const platform = searchParams.get("platform") ?? undefined;
  const status   = searchParams.get("status") ?? undefined;
  const search   = searchParams.get("search") ?? undefined;

  const where = {
    ...(platform ? { platform } : {}),
    ...(status   ? { status: status as "CONFIRMED" | "PENDING" | "CANCELLED" | "REFUNDED" } : {}),
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
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        eventName: true,
        eventDate: true,
        venue: true,
        section: true,
        row: true,
        seats: true,
        quantity: true,
        orderNumber: true,
        platform: true,
        account: true,
        pricePaid: true,
        currency: true,
        status: true,
        source: true,
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
    eventName, eventDate, venue, section, row, seats,
    quantity, orderNumber, platform, account,
    pricePaid, currency, status,
  } = body as Record<string, unknown>;

  if (!eventName || typeof eventName !== "string") {
    return NextResponse.json({ error: "eventName is required" }, { status: 400 });
  }
  if (!platform || typeof platform !== "string") {
    return NextResponse.json({ error: "platform is required" }, { status: 400 });
  }
  if (!account || typeof account !== "string") {
    return NextResponse.json({ error: "account is required" }, { status: 400 });
  }

  const purchase = await prisma.purchase.create({
    data: {
      eventName:   eventName,
      eventDate:   eventDate ? new Date(eventDate as string) : null,
      venue:       (venue as string) ?? null,
      section:     (section as string) ?? null,
      row:         (row as string) ?? null,
      seats:       (seats as string) ?? null,
      quantity:    typeof quantity === "number" ? quantity : 1,
      orderNumber: (orderNumber as string) ?? null,
      platform,
      account,
      pricePaid:   typeof pricePaid === "number" ? pricePaid : 0,
      currency:    (currency as string) ?? "GBP",
      status:      (status as "CONFIRMED" | "PENDING" | "CANCELLED" | "REFUNDED") ?? "CONFIRMED",
      source:      "MANUAL",
    },
  });

  return NextResponse.json(purchase, { status: 201 });
}

// PATCH /api/purchases?id=xxx — update status or other fields
export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const body = await req.json();
  const allowedFields = ["status", "eventName", "eventDate", "venue", "section", "row", "seats", "quantity", "orderNumber", "pricePaid", "currency", "notes"];
  const data: Record<string, unknown> = {};
  for (const key of allowedFields) {
    if (key in body) data[key] = body[key];
  }
  if (data.eventDate) data.eventDate = new Date(data.eventDate as string);

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
