import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { encrypt } from "@/lib/crypto";
import { detectImapServer } from "@/lib/email-parsers";

// GET /api/email-accounts — list all accounts (passwords are never returned)
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const accounts = await prisma.emailAccount.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      label: true,
      email: true,
      imapHost: true,
      imapPort: true,
      tls: true,
      lastFetched: true,
      createdAt: true,
      _count: { select: { purchases: true } },
    },
  });

  return NextResponse.json(accounts);
}

// POST /api/email-accounts — create a new email account
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { label, email, password, imapHost, imapPort, tls } = body as {
    label?: string;
    email?: string;
    password?: string;
    imapHost?: string;
    imapPort?: number;
    tls?: boolean;
  };

  if (!email || !password) {
    return NextResponse.json({ error: "email and password are required" }, { status: 400 });
  }

  // Auto-detect IMAP server if not provided
  const detected = detectImapServer(email);
  const host = imapHost ?? detected.host;
  const port = imapPort ?? detected.port;
  const useTls = tls ?? detected.tls;

  let encryptedPassword: string;
  try {
    encryptedPassword = encrypt(password);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: `Encryption failed — check ENCRYPTION_KEY env var. Details: ${msg}` },
      { status: 500 }
    );
  }

  const account = await prisma.emailAccount.create({
    data: {
      label: label ?? email,
      email,
      password: encryptedPassword,
      imapHost: host,
      imapPort: port,
      tls: useTls,
    },
    select: {
      id: true,
      label: true,
      email: true,
      imapHost: true,
      imapPort: true,
      tls: true,
      lastFetched: true,
      createdAt: true,
    },
  });

  return NextResponse.json(account, { status: 201 });
}

// DELETE /api/email-accounts?id=xxx — delete an account (and its purchases)
export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  await prisma.emailAccount.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
