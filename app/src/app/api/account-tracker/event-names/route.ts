import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const names = await prisma.statsEventName.findMany();
  return NextResponse.json(names);
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { eventUrl, eventName } = body as { eventUrl?: string; eventName?: string };
  if (!eventUrl || !eventName?.trim()) {
    return NextResponse.json({ error: "Missing eventUrl or eventName" }, { status: 400 });
  }

  const result = await prisma.statsEventName.upsert({
    where: { eventUrl },
    create: { eventUrl, eventName: eventName.trim() },
    update: { eventName: eventName.trim() },
  });
  return NextResponse.json(result);
}
