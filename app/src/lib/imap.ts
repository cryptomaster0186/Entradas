/**
 * IMAP fetching logic.
 *
 * Connects to an IMAP server using stored (encrypted) credentials, searches
 * for ticket-purchase confirmation emails, parses them, and persists any new
 * purchases to the database.
 */
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { decrypt } from "./crypto";
import prisma from "./prisma";
import { parseConfirmationEmail } from "./email-parsers";
import { fingerprintEmail } from "./fingerprint";

interface EmailAccountRecord {
  id: string;
  email: string;
  password: string; // AES-256-GCM encrypted
  imapHost: string;
  imapPort: number;
  tls: boolean;
}

export interface FetchResult {
  emailsScanned: number;
  purchasesAdded: number;
  error?: string;
}

// Keywords used to search for confirmation emails in INBOX
const SUBJECT_KEYWORDS = [
  "order confirmation",
  "order confirmed",
  "booking confirmation",
  "your tickets",
  "confirmación",          // Spanish
  "bestellbestätigung",    // German
  "bestellung bestätigt",  // German alt
];

const FROM_KEYWORDS = [
  "ticketmaster",
  "livenation",
  "eventim",
  "seetickets",
  "axs.com",
  "stubhub",
  "viagogo",
];

export async function fetchEmailsForAccount(
  account: EmailAccountRecord
): Promise<FetchResult> {
  let emailsScanned = 0;
  let purchasesAdded = 0;

  let plainPassword: string;
  try {
    plainPassword = decrypt(account.password);
  } catch {
    return { emailsScanned: 0, purchasesAdded: 0, error: "Failed to decrypt IMAP password" };
  }

  const client = new ImapFlow({
    host: account.imapHost,
    port: account.imapPort,
    secure: account.tls,
    auth: {
      user: account.email,
      pass: plainPassword,
    },
    logger: false,
    // Generous timeout for slow servers (iCloud can be slow)
    socketTimeout: 30_000,
  });

  try {
    await client.connect();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { emailsScanned: 0, purchasesAdded: 0, error: `IMAP connection failed: ${msg}` };
  }

  const lock = await client.getMailboxLock("INBOX");

  try {
    // Build search criteria — OR over multiple from/subject patterns.
    // We search separately and merge UIDs to stay compatible with servers
    // that don't support the IMAP OR operator reliably.
    const uidSets = new Set<number>();

    for (const kw of FROM_KEYWORDS) {
      try {
        const uids = await client.search({ from: kw }, { uid: true });
        if (Array.isArray(uids)) uids.forEach((u: number) => uidSets.add(u));
      } catch {
        // Some servers reject certain search forms — ignore and continue
      }
    }

    for (const kw of SUBJECT_KEYWORDS) {
      try {
        const uids = await client.search({ subject: kw }, { uid: true });
        if (Array.isArray(uids)) uids.forEach((u: number) => uidSets.add(u));
      } catch {
        // Ignore unsupported search
      }
    }

    const allUids = Array.from(uidSets);

    // Fetch each email and try to parse it
    for (const uid of allUids) {
      emailsScanned++;

      // Deduplication: skip if we already processed this UID for this account
      const rawEmailId = `${account.email}:${uid}`;
      const existing = await prisma.purchase.findUnique({
        where: { rawEmailId },
      });
      if (existing) continue;

      // Fetch raw message source
      let rawSource: Buffer | undefined;
      let imapMessageId: string | undefined;
      for await (const msg of client.fetch(
        String(uid),
        { source: true, envelope: true },
        { uid: true }
      )) {
        rawSource = msg.source as Buffer | undefined;
        imapMessageId = msg.envelope?.messageId ?? undefined;
      }

      if (rawSource === undefined) continue;

      // Parse with mailparser
      let parsed;
      try {
        parsed = await simpleParser(rawSource);
      } catch {
        continue;
      }

      const fromAddr =
        parsed.from?.value?.[0]?.address?.toLowerCase() ?? "";
      const subject = parsed.subject ?? "";
      const text = parsed.text ?? "";
      const html = parsed.html || null;
      const receivedAt = parsed.date ?? null;

      // Skip non-confirmation emails early
      const lowerSubject = subject.toLowerCase();
      const looksLikeConfirmation =
        SUBJECT_KEYWORDS.some((k) => lowerSubject.includes(k)) ||
        FROM_KEYWORDS.some((k) => fromAddr.includes(k));
      if (!looksLikeConfirmation) continue;

      const purchaseData = parseConfirmationEmail(text, html, fromAddr, subject);
      if (!purchaseData) continue;

      const fingerprint = fingerprintEmail(rawEmailId);

      // Derive provider from platform domain
      const provider = purchaseData.platform
        ? purchaseData.platform.replace(/^www\./, "").split(".")[0]
        : null;

      // Persist to DB
      try {
        await prisma.purchase.create({
          data: {
            // Source
            source:        "EMAIL",
            provider,

            // Event
            eventName:     purchaseData.eventName,
            eventDate:     purchaseData.eventDate,
            venue:         purchaseData.venue,

            // Purchase info
            purchaseDate:  purchaseData.purchaseDate,
            account:       account.email,
            ticketType:    null,

            // Seats
            quantity:      purchaseData.quantity,
            section:       purchaseData.section,
            row:           purchaseData.row,
            seat:          purchaseData.seat,

            // Financials
            pricePaid:     purchaseData.pricePaid,
            costPerTicket: purchaseData.costPerTicket,
            currency:      purchaseData.currency,

            // Status & dedup
            status:        "CONFIRMED",
            parseStatus:   purchaseData.parseStatus,
            parseError:    purchaseData.parseWarnings.length > 0
              ? purchaseData.parseWarnings.join("; ")
              : null,
            fingerprint,

            // Order reference
            orderNumber:   purchaseData.orderNumber,
            platform:      purchaseData.platform,

            // Email metadata
            rawEmailId,
            emailMessageId: imapMessageId ?? (parsed.messageId ?? null),
            emailSubject:  subject || null,
            emailSender:   fromAddr || null,
            emailReceivedAt: receivedAt,

            // Relations
            emailAccountId: account.id,
          },
        });
        purchasesAdded++;
      } catch {
        // e.g. unique constraint race condition — safe to skip
      }
    }
  } finally {
    lock.release();
    try {
      await client.logout();
    } catch {
      // ignore logout errors
    }
  }

  return { emailsScanned, purchasesAdded };
}
