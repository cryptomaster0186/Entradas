/**
 * Parsers for ticket-purchase confirmation emails from different platforms.
 *
 * Each parser receives the plain-text body (and optionally HTML) of an email
 * and returns a partial Purchase record, or null if the email doesn't match.
 *
 * Supported platforms:
 *  - ticketmaster.co.uk
 *  - ticketmaster.com.mx
 *  - ticketmaster.at
 *  - ticketmaster.com / generic fallback
 */

export interface ParsedPurchase {
  eventName: string;
  eventDate: Date | null;
  venue: string | null;
  section: string | null;
  row: string | null;
  seats: string | null;
  quantity: number;
  orderNumber: string | null;
  platform: string;
  pricePaid: number;
  currency: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function firstMatch(text: string, pattern: RegExp): string | null {
  return pattern.exec(text)?.[1]?.trim() ?? null;
}

function parseFloat2(s: string | null): number {
  if (!s) return 0;
  // Remove thousands separators (comma or period-as-thousands)
  const cleaned = s.replace(/[£€$]/, "").replace(/,(?=\d{3})/g, "").replace(",", ".").trim();
  return parseFloat(cleaned) || 0;
}

function parseDate(s: string | null): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

// ─── Ticketmaster UK ──────────────────────────────────────────────────────────

function parseTicketmasterUK(text: string): ParsedPurchase | null {
  // Confirm it looks like a TM UK confirmation
  if (
    !text.toLowerCase().includes("ticketmaster") ||
    (!text.toLowerCase().includes("order") && !text.toLowerCase().includes("confirmation"))
  ) {
    return null;
  }

  const orderNumber =
    firstMatch(text, /order\s+(?:number|#|no\.?)[:\s]+([A-Z0-9\-\/]+)/i) ??
    firstMatch(text, /order[:\s]+([0-9]{2}-[0-9]+\/\w+)/i);

  // Event name: usually the first prominent capitalised line after the order header
  // Try a few common patterns
  const eventName =
    firstMatch(text, /(?:event|for)[:\s]+([^\n\r]+)/i) ??
    firstMatch(text, /^([A-Z][^\n]{5,60})$/m) ??
    "Unknown Event";

  const venue =
    firstMatch(text, /(?:venue|at)[:\s]+([^\n\r]+)/i) ??
    firstMatch(text, /([A-Z][^\n]{3,50}),\s*[A-Z][^\n]{3,30}\n/);

  const eventDate = parseDate(
    firstMatch(text, /(?:date|on)[:\s]+([\w\s,]+\d{4}[^\n]*)/i)
  );

  const section = firstMatch(text, /(?:section|zone)[:\s]+([^\n\r,]+)/i);
  const row      = firstMatch(text, /row[:\s]+([A-Z0-9]+)/i);
  const seats    = firstMatch(text, /seat[s]?[:\s]+([0-9,\s\-]+)/i);

  const qtyStr = firstMatch(text, /(\d+)\s*x?\s*ticket/i) ??
                 firstMatch(text, /quantity[:\s]+(\d+)/i);
  const quantity = qtyStr ? parseInt(qtyStr, 10) : 1;

  const priceStr =
    firstMatch(text, /total[:\s]+[£€$]?([\d,]+\.?\d*)/i) ??
    firstMatch(text, /[£€$]([\d,]+\.?\d*)\s*(?:GBP|EUR|USD)?/i);
  const pricePaid = parseFloat2(priceStr);

  const currency =
    firstMatch(text, /\b(GBP|EUR|USD|MXN)\b/i)?.toUpperCase() ??
    (text.includes("£") ? "GBP" : text.includes("€") ? "EUR" : "GBP");

  return {
    eventName: eventName.trim(),
    eventDate,
    venue: venue?.trim() ?? null,
    section: section?.trim() ?? null,
    row: row?.trim() ?? null,
    seats: seats?.trim() ?? null,
    quantity,
    orderNumber: orderNumber?.trim() ?? null,
    platform: "ticketmaster.co.uk",
    pricePaid,
    currency,
  };
}

// ─── Ticketmaster Mexico ─────────────────────────────────────────────────────

function parseTicketmasterMX(text: string): ParsedPurchase | null {
  if (!text.toLowerCase().includes("ticketmaster")) return null;

  const orderNumber = firstMatch(text, /(?:pedido|orden|order)[:\s#]+([A-Z0-9\-]+)/i);

  const eventName =
    firstMatch(text, /(?:evento|event)[:\s]+([^\n\r]+)/i) ??
    firstMatch(text, /^([A-Z][^\n]{5,60})$/m) ??
    "Unknown Event";

  const venue = firstMatch(text, /(?:lugar|recinto|venue)[:\s]+([^\n\r]+)/i);

  const eventDate = parseDate(
    firstMatch(text, /(?:fecha|date)[:\s]+([\w\s,]+\d{4}[^\n]*)/i)
  );

  const section = firstMatch(text, /(?:zona|section)[:\s]+([^\n\r,]+)/i);
  const row      = firstMatch(text, /(?:fila|row)[:\s]+([A-Z0-9]+)/i);
  const seats    = firstMatch(text, /(?:asiento|seat)[s]?[:\s]+([0-9,\s\-]+)/i);

  const qtyStr = firstMatch(text, /(\d+)\s*(?:boleto|ticket)/i) ??
                 firstMatch(text, /(?:cantidad|quantity)[:\s]+(\d+)/i);
  const quantity = qtyStr ? parseInt(qtyStr, 10) : 1;

  const priceStr =
    firstMatch(text, /total[:\s]+\$?([\d,]+\.?\d*)/i) ??
    firstMatch(text, /\$([\d,]+\.?\d*)\s*(?:MXN|pesos)?/i);
  const pricePaid = parseFloat2(priceStr);

  return {
    eventName: eventName.trim(),
    eventDate,
    venue: venue?.trim() ?? null,
    section: section?.trim() ?? null,
    row: row?.trim() ?? null,
    seats: seats?.trim() ?? null,
    quantity,
    orderNumber: orderNumber?.trim() ?? null,
    platform: "ticketmaster.com.mx",
    pricePaid,
    currency: "MXN",
  };
}

// ─── Ticketmaster Austria ─────────────────────────────────────────────────────

function parseTicketmasterAT(text: string): ParsedPurchase | null {
  if (!text.toLowerCase().includes("ticketmaster")) return null;

  const orderNumber = firstMatch(
    text,
    /(?:bestellnummer|auftrag|order)[:\s#]+([A-Z0-9\-]+)/i
  );

  const eventName =
    firstMatch(text, /(?:veranstaltung|event)[:\s]+([^\n\r]+)/i) ??
    firstMatch(text, /^([A-Z][^\n]{5,60})$/m) ??
    "Unknown Event";

  const venue = firstMatch(text, /(?:ort|veranstaltungsort|venue)[:\s]+([^\n\r]+)/i);

  const eventDate = parseDate(
    firstMatch(text, /(?:datum|date)[:\s]+([\w\s,\.]+\d{4}[^\n]*)/i)
  );

  const section = firstMatch(text, /(?:block|bereich|section|zone)[:\s]+([^\n\r,]+)/i);
  const row      = firstMatch(text, /(?:reihe|row)[:\s]+([A-Z0-9]+)/i);
  const seats    = firstMatch(text, /(?:platz|sitz|seat)[s]?[:\s]+([0-9,\s\-]+)/i);

  const qtyStr = firstMatch(text, /(\d+)\s*(?:ticket|karte|eintrittskarte)/i) ??
                 firstMatch(text, /(?:anzahl|quantity)[:\s]+(\d+)/i);
  const quantity = qtyStr ? parseInt(qtyStr, 10) : 1;

  const priceStr =
    firstMatch(text, /(?:gesamt|total)[:\s]+€?([\d,.]+)/i) ??
    firstMatch(text, /€([\d,.]+)/i);
  const pricePaid = parseFloat2(priceStr);

  return {
    eventName: eventName.trim(),
    eventDate,
    venue: venue?.trim() ?? null,
    section: section?.trim() ?? null,
    row: row?.trim() ?? null,
    seats: seats?.trim() ?? null,
    quantity,
    orderNumber: orderNumber?.trim() ?? null,
    platform: "ticketmaster.at",
    pricePaid,
    currency: "EUR",
  };
}

// ─── Generic / fallback ───────────────────────────────────────────────────────

function parseGeneric(
  text: string,
  senderDomain: string
): ParsedPurchase | null {
  const orderNumber = firstMatch(
    text,
    /(?:order|booking|confirmation|reference)[:\s#]+([A-Z0-9\-\/]+)/i
  );
  if (!orderNumber && !text.toLowerCase().includes("confirmation")) return null;

  const eventName =
    firstMatch(text, /(?:event|show|concert|match)[:\s]+([^\n\r]+)/i) ??
    firstMatch(text, /^([A-Z][^\n]{5,60})$/m) ??
    "Unknown Event";

  const venue = firstMatch(text, /(?:venue|location|at)[:\s]+([^\n\r]+)/i);

  const eventDate = parseDate(
    firstMatch(text, /(?:date|on)[:\s]+([\w\s,]+\d{4}[^\n]*)/i)
  );

  const qtyStr = firstMatch(text, /(\d+)\s*x?\s*ticket/i);
  const quantity = qtyStr ? parseInt(qtyStr, 10) : 1;

  const priceStr =
    firstMatch(text, /total[:\s]+[£€$]?([\d,]+\.?\d*)/i) ??
    firstMatch(text, /[£€$]([\d,]+\.?\d*)/i);
  const pricePaid = parseFloat2(priceStr);

  const currency =
    firstMatch(text, /\b(GBP|EUR|USD|MXN)\b/i)?.toUpperCase() ??
    (text.includes("£") ? "GBP" : text.includes("€") ? "EUR" : "USD");

  return {
    eventName: eventName.trim(),
    eventDate,
    venue: venue?.trim() ?? null,
    section: null,
    row: null,
    seats: null,
    quantity,
    orderNumber: orderNumber?.trim() ?? null,
    platform: senderDomain,
    pricePaid,
    currency,
  };
}

// ─── Public entry point ───────────────────────────────────────────────────────

/**
 * Determines the right parser based on the sender's email address and tries
 * to extract a purchase record from the email body.
 *
 * Returns null if no purchase info could be extracted.
 */
export function parseConfirmationEmail(
  text: string,
  _html: string | null,
  fromAddress: string,
  subject: string
): ParsedPurchase | null {
  const from = fromAddress.toLowerCase();
  const combined = `${subject}\n${text}`;

  // Route to the most specific parser first
  if (from.includes("ticketmaster.co.uk")) return parseTicketmasterUK(combined);
  if (from.includes("ticketmaster.com.mx")) return parseTicketmasterMX(combined);
  if (from.includes("ticketmaster.at")) return parseTicketmasterAT(combined);
  if (from.includes("ticketmaster")) {
    // Generic TM — pick currency from content
    const result = parseGeneric(combined, "ticketmaster.com");
    if (result) return result;
  }

  // For any other sender that looks like a ticket confirmation
  const domainMatch = /(?:@|\.)([\w-]+\.[\w-]+)$/.exec(from);
  const senderDomain = domainMatch?.[1] ?? from;
  return parseGeneric(combined, senderDomain);
}

// ─── IMAP server auto-detection ───────────────────────────────────────────────

interface ImapServerInfo {
  host: string;
  port: number;
  tls: boolean;
}

const IMAP_SERVERS: Record<string, ImapServerInfo> = {
  "icloud.com":   { host: "imap.mail.me.com",           port: 993, tls: true },
  "me.com":       { host: "imap.mail.me.com",           port: 993, tls: true },
  "mac.com":      { host: "imap.mail.me.com",           port: 993, tls: true },
  "gmail.com":    { host: "imap.gmail.com",             port: 993, tls: true },
  "googlemail.com":{ host: "imap.gmail.com",            port: 993, tls: true },
  "outlook.com":  { host: "outlook.office365.com",      port: 993, tls: true },
  "hotmail.com":  { host: "outlook.office365.com",      port: 993, tls: true },
  "live.com":     { host: "outlook.office365.com",      port: 993, tls: true },
  "yahoo.com":    { host: "imap.mail.yahoo.com",        port: 993, tls: true },
  "yahoo.co.uk":  { host: "imap.mail.yahoo.com",        port: 993, tls: true },
  "yahoo.es":     { host: "imap.mail.yahoo.com",        port: 993, tls: true },
};

export function detectImapServer(email: string): ImapServerInfo {
  const domain = email.split("@")[1]?.toLowerCase() ?? "";
  return IMAP_SERVERS[domain] ?? { host: `imap.${domain}`, port: 993, tls: true };
}
