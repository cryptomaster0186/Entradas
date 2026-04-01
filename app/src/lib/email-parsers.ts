/**
 * Parsers for ticket-purchase confirmation emails.
 *
 * Each platform parser receives the combined subject+plain-text body and
 * returns a ParsedEmailPurchase (or null if not a relevant email).
 *
 * Supported:
 *  - ticketmaster.co.uk
 *  - ticketmaster.com.mx
 *  - ticketmaster.at
 *  - ticketmaster.com (generic fallback)
 */

// ─── Output type ─────────────────────────────────────────────────────────────

export interface ParsedEmailPurchase {
  // Event
  eventName: string;
  eventDate: Date | null;
  venue: string | null;

  // When ticket was purchased
  purchaseDate: Date | null;

  // Seats
  section: string | null;
  row: string | null;
  seat: string | null;
  quantity: number;

  // Financials
  pricePaid: number;
  costPerTicket: number | null;
  currency: string;

  // Order
  orderNumber: string | null;
  platform: string;

  // Parse quality
  parseStatus: "OK" | "PARTIAL";
  parseWarnings: string[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function first(text: string, patterns: RegExp[]): string | null {
  for (const re of patterns) {
    const m = re.exec(text);
    if (m?.[1]) return m[1].trim();
  }
  return null;
}

function parseNum(s: string | null): number {
  if (!s) return 0;
  return (
    parseFloat(
      s
        .replace(/[£€$]/g, "")
        .replace(/,(?=\d{3})/g, "") // 1,234.56 → 1234.56
        .replace(",", ".")          // European 1.234,56 → 1.23456 (approx)
        .trim()
    ) || 0
  );
}

function parseDate(s: string | null): Date | null {
  if (!s) return null;
  // Try ISO first, then locale-aware
  const d = new Date(s.trim());
  return isNaN(d.getTime()) ? null : d;
}

function detectCurrency(text: string): string {
  if (/\bGBP\b/i.test(text) || text.includes("£")) return "GBP";
  if (/\bEUR\b/i.test(text) || text.includes("€")) return "EUR";
  if (/\bMXN\b|pesos/i.test(text)) return "MXN";
  if (/\bUSD\b/i.test(text)) return "USD";
  return "GBP";
}

function quality(p: Partial<ParsedEmailPurchase>): "OK" | "PARTIAL" {
  const required = [p.eventName, p.pricePaid, p.eventDate];
  return required.every(Boolean) ? "OK" : "PARTIAL";
}

// ─── Ticketmaster UK ──────────────────────────────────────────────────────────

function parseTmUK(text: string): ParsedEmailPurchase | null {
  const lower = text.toLowerCase();
  if (!lower.includes("ticketmaster")) return null;
  if (!lower.includes("order") && !lower.includes("confirmation")) return null;

  const warnings: string[] = [];

  const orderNumber = first(text, [
    /order\s+(?:number|#|no\.?)[:\s]+([A-Z0-9\-\/]+)/i,
    /order[:\s]+([0-9]{2}-[0-9]+\/\w+)/i,
    /booking\s+ref(?:erence)?[:\s]+([A-Z0-9\-\/]+)/i,
  ]);

  const eventName = first(text, [
    /(?:event|for)[:\s]+([^\n\r]{3,80})/i,
    /^([A-Z][^\n]{5,70})$/m,
  ]) ?? "Unknown Event";

  const venue = first(text, [
    /(?:venue|at|location)[:\s]+([^\n\r]{3,80})/i,
  ]);

  const eventDate = parseDate(
    first(text, [
      /(?:event\s+)?date[:\s]+([\w\s,]+\d{4}[^\n\r]*)/i,
      /(?:on)[:\s]+((?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)[^\n\r]*\d{4}[^\n\r]*)/i,
    ])
  );

  const purchaseDate = parseDate(
    first(text, [
      /(?:purchase|order|bought|placed)[d\s]+(?:on|date)[:\s]+([\w\s,]+\d{4}[^\n\r]*)/i,
      /(?:confirmation\s+date|date\s+ordered)[:\s]+([\w\s,]+\d{4}[^\n\r]*)/i,
    ])
  );

  const section = first(text, [/(?:section|zone|block)[:\s]+([^\n\r,]{1,30})/i]);
  const row = first(text, [/\brow[:\s]+([A-Z0-9]{1,10})\b/i]);
  const seat = first(text, [/\bseat[s]?[:\s]+([0-9][0-9,\s\-]*)/i]);

  const qtyStr = first(text, [
    /(\d+)\s*x?\s*ticket/i,
    /quantity[:\s]+(\d+)/i,
    /(\d+)\s+ticket[s]?/i,
  ]);
  const quantity = qtyStr ? Math.max(1, parseInt(qtyStr, 10)) : 1;

  const priceStr = first(text, [
    /(?:total|order\s+total)[:\s]+[£€$]?([\d,]+\.?\d*)/i,
    /[£€$]([\d,]+\.?\d*)\s*(?:GBP|EUR|USD)?/i,
  ]);
  const pricePaid = parseNum(priceStr);

  const perTicketStr = first(text, [
    /(?:per\s+ticket|each|price\s+per)[:\s]+[£€$]?([\d,]+\.?\d*)/i,
    /[£€$]([\d,]+\.?\d*)\s*(?:per\s+ticket|each)/i,
  ]);
  const costPerTicket = perTicketStr
    ? parseNum(perTicketStr)
    : quantity > 0 && pricePaid > 0
    ? pricePaid / quantity
    : null;

  const currency = detectCurrency(text);

  if (!eventDate) warnings.push("eventDate not found");
  if (!pricePaid) warnings.push("pricePaid not found");
  if (!venue) warnings.push("venue not found");

  const result: ParsedEmailPurchase = {
    eventName: eventName.trim(),
    eventDate,
    venue: venue?.trim() ?? null,
    purchaseDate,
    section: section?.trim() ?? null,
    row: row?.trim() ?? null,
    seat: seat?.trim() ?? null,
    quantity,
    pricePaid,
    costPerTicket,
    currency,
    orderNumber: orderNumber?.trim() ?? null,
    platform: "ticketmaster.co.uk",
    parseStatus: quality({ eventName, pricePaid, eventDate }),
    parseWarnings: warnings,
  };

  return result;
}

// ─── Ticketmaster Mexico ──────────────────────────────────────────────────────

function parseTmMX(text: string): ParsedEmailPurchase | null {
  if (!text.toLowerCase().includes("ticketmaster")) return null;

  const warnings: string[] = [];

  const orderNumber = first(text, [
    /(?:pedido|orden|order)[:\s#]+([A-Z0-9\-]+)/i,
    /folio[:\s]+([A-Z0-9\-]+)/i,
  ]);

  const eventName = first(text, [
    /(?:evento|event)[:\s]+([^\n\r]{3,80})/i,
    /^([A-Z][^\n]{5,70})$/m,
  ]) ?? "Unknown Event";

  const venue = first(text, [
    /(?:lugar|recinto|venue|foro)[:\s]+([^\n\r]{3,80})/i,
  ]);

  const eventDate = parseDate(
    first(text, [/(?:fecha|date)[:\s]+([\w\s,]+\d{4}[^\n\r]*)/i])
  );

  const purchaseDate = parseDate(
    first(text, [/(?:fecha\s+de\s+(?:compra|pedido))[:\s]+([\w\s,]+\d{4}[^\n\r]*)/i])
  );

  const section = first(text, [/(?:zona|section|area)[:\s]+([^\n\r,]{1,30})/i]);
  const row = first(text, [/(?:fila|row)[:\s]+([A-Z0-9]{1,10})/i]);
  const seat = first(text, [/(?:asiento|seat)[s]?[:\s]+([0-9][0-9,\s\-]*)/i]);

  const qtyStr = first(text, [
    /(\d+)\s*(?:boleto|ticket)/i,
    /(?:cantidad|quantity)[:\s]+(\d+)/i,
  ]);
  const quantity = qtyStr ? Math.max(1, parseInt(qtyStr, 10)) : 1;

  const priceStr = first(text, [
    /total[:\s]+\$?([\d,]+\.?\d*)\s*(?:MXN|pesos)?/i,
    /\$([\d,]+\.?\d*)\s*(?:MXN|pesos)/i,
  ]);
  const pricePaid = parseNum(priceStr);

  const perTicketStr = first(text, [
    /(?:por\s+boleto|precio\s+unitario|each)[:\s]+\$?([\d,]+\.?\d*)/i,
  ]);
  const costPerTicket = perTicketStr
    ? parseNum(perTicketStr)
    : quantity > 0 && pricePaid > 0
    ? pricePaid / quantity
    : null;

  if (!eventDate) warnings.push("eventDate not found");
  if (!pricePaid) warnings.push("pricePaid not found");

  return {
    eventName: eventName.trim(),
    eventDate,
    venue: venue?.trim() ?? null,
    purchaseDate,
    section: section?.trim() ?? null,
    row: row?.trim() ?? null,
    seat: seat?.trim() ?? null,
    quantity,
    pricePaid,
    costPerTicket,
    currency: "MXN",
    orderNumber: orderNumber?.trim() ?? null,
    platform: "ticketmaster.com.mx",
    parseStatus: quality({ eventName, pricePaid, eventDate }),
    parseWarnings: warnings,
  };
}

// ─── Ticketmaster Austria ─────────────────────────────────────────────────────

function parseTmAT(text: string): ParsedEmailPurchase | null {
  if (!text.toLowerCase().includes("ticketmaster")) return null;

  const warnings: string[] = [];

  const orderNumber = first(text, [
    /(?:bestellnummer|auftrag|order)[:\s#]+([A-Z0-9\-]+)/i,
  ]);

  const eventName = first(text, [
    /(?:veranstaltung|event)[:\s]+([^\n\r]{3,80})/i,
    /^([A-Z][^\n]{5,70})$/m,
  ]) ?? "Unknown Event";

  const venue = first(text, [
    /(?:ort|veranstaltungsort|venue|location)[:\s]+([^\n\r]{3,80})/i,
  ]);

  const eventDate = parseDate(
    first(text, [/(?:datum|date)[:\s]+([\w\s,\.]+\d{4}[^\n\r]*)/i])
  );

  const purchaseDate = parseDate(
    first(text, [/(?:bestelldatum|kaufdatum|order\s+date)[:\s]+([\w\s,\.]+\d{4}[^\n\r]*)/i])
  );

  const section = first(text, [/(?:block|bereich|section|zone)[:\s]+([^\n\r,]{1,30})/i]);
  const row = first(text, [/(?:reihe|row)[:\s]+([A-Z0-9]{1,10})/i]);
  const seat = first(text, [/(?:platz|sitz|seat)[s]?[:\s]+([0-9][0-9,\s\-]*)/i]);

  const qtyStr = first(text, [
    /(\d+)\s*(?:ticket|karte|eintrittskarte)/i,
    /(?:anzahl|quantity)[:\s]+(\d+)/i,
  ]);
  const quantity = qtyStr ? Math.max(1, parseInt(qtyStr, 10)) : 1;

  const priceStr = first(text, [
    /(?:gesamt(?:betrag)?|total)[:\s]+€?([\d,.]+)/i,
    /€([\d,.]+)/i,
  ]);
  const pricePaid = parseNum(priceStr);

  const perTicketStr = first(text, [
    /(?:pro\s+ticket|je\s+ticket|each)[:\s]+€?([\d,.]+)/i,
  ]);
  const costPerTicket = perTicketStr
    ? parseNum(perTicketStr)
    : quantity > 0 && pricePaid > 0
    ? pricePaid / quantity
    : null;

  if (!eventDate) warnings.push("eventDate not found");
  if (!pricePaid) warnings.push("pricePaid not found");

  return {
    eventName: eventName.trim(),
    eventDate,
    venue: venue?.trim() ?? null,
    purchaseDate,
    section: section?.trim() ?? null,
    row: row?.trim() ?? null,
    seat: seat?.trim() ?? null,
    quantity,
    pricePaid,
    costPerTicket,
    currency: "EUR",
    orderNumber: orderNumber?.trim() ?? null,
    platform: "ticketmaster.at",
    parseStatus: quality({ eventName, pricePaid, eventDate }),
    parseWarnings: warnings,
  };
}

// ─── Generic fallback ─────────────────────────────────────────────────────────

function parseGeneric(
  text: string,
  senderDomain: string
): ParsedEmailPurchase | null {
  const lower = text.toLowerCase();
  const orderNumber = first(text, [
    /(?:order|booking|confirmation|reference)[:\s#]+([A-Z0-9\-\/]{4,30})/i,
  ]);
  // Require some signal that this is a purchase confirmation
  if (!orderNumber && !lower.includes("confirmation") && !lower.includes("booking")) {
    return null;
  }

  const eventName = first(text, [
    /(?:event|show|concert|match|for)[:\s]+([^\n\r]{3,80})/i,
    /^([A-Z][^\n]{5,70})$/m,
  ]) ?? "Unknown Event";

  const venue = first(text, [
    /(?:venue|location|at\s+the)[:\s]+([^\n\r]{3,80})/i,
  ]);

  const eventDate = parseDate(
    first(text, [/(?:date|on)[:\s]+([\w\s,]+\d{4}[^\n\r]*)/i])
  );

  const purchaseDate = parseDate(
    first(text, [/(?:purchase|order|placed)[d\s]+(?:on|date)[:\s]+([\w\s,]+\d{4}[^\n\r]*)/i])
  );

  const qtyStr = first(text, [/(\d+)\s*x?\s*ticket[s]?/i]);
  const quantity = qtyStr ? Math.max(1, parseInt(qtyStr, 10)) : 1;

  const priceStr = first(text, [
    /total[:\s]+[£€$]?([\d,]+\.?\d*)/i,
    /[£€$]([\d,]+\.?\d*)/i,
  ]);
  const pricePaid = parseNum(priceStr);

  const currency = detectCurrency(text);

  return {
    eventName: eventName.trim(),
    eventDate,
    venue: venue?.trim() ?? null,
    purchaseDate,
    section: null,
    row: null,
    seat: null,
    quantity,
    pricePaid,
    costPerTicket: quantity > 0 && pricePaid > 0 ? pricePaid / quantity : null,
    currency,
    orderNumber: orderNumber?.trim() ?? null,
    platform: senderDomain,
    parseStatus: "PARTIAL",
    parseWarnings: ["parsed via generic fallback"],
  };
}

// ─── Public entry point ───────────────────────────────────────────────────────

/**
 * Routes the email to the right platform parser.
 * Returns null if no relevant purchase could be extracted.
 */
export function parseConfirmationEmail(
  text: string,
  _html: string | null,
  fromAddress: string,
  subject: string
): ParsedEmailPurchase | null {
  const from = fromAddress.toLowerCase();
  const combined = `${subject}\n${text}`;

  if (from.includes("ticketmaster.co.uk")) return parseTmUK(combined);
  if (from.includes("ticketmaster.com.mx")) return parseTmMX(combined);
  if (from.includes("ticketmaster.at")) return parseTmAT(combined);
  if (from.includes("ticketmaster")) {
    return parseTmUK(combined) ?? parseGeneric(combined, "ticketmaster.com");
  }

  const domainMatch = /(?:@|\.)([\w-]+\.[\w-]+)$/.exec(from);
  const senderDomain = domainMatch?.[1] ?? from;
  return parseGeneric(combined, senderDomain);
}

// ─── IMAP server auto-detection ───────────────────────────────────────────────

export interface ImapServerInfo {
  host: string;
  port: number;
  tls: boolean;
}

const IMAP_SERVERS: Record<string, ImapServerInfo> = {
  "icloud.com":    { host: "imap.mail.me.com",       port: 993, tls: true },
  "me.com":        { host: "imap.mail.me.com",       port: 993, tls: true },
  "mac.com":       { host: "imap.mail.me.com",       port: 993, tls: true },
  "gmail.com":     { host: "imap.gmail.com",         port: 993, tls: true },
  "googlemail.com":{ host: "imap.gmail.com",         port: 993, tls: true },
  "outlook.com":   { host: "outlook.office365.com",  port: 993, tls: true },
  "hotmail.com":   { host: "outlook.office365.com",  port: 993, tls: true },
  "live.com":      { host: "outlook.office365.com",  port: 993, tls: true },
  "yahoo.com":     { host: "imap.mail.yahoo.com",    port: 993, tls: true },
  "yahoo.co.uk":   { host: "imap.mail.yahoo.com",    port: 993, tls: true },
  "yahoo.es":      { host: "imap.mail.yahoo.com",    port: 993, tls: true },
};

export function detectImapServer(email: string): ImapServerInfo {
  const domain = email.split("@")[1]?.toLowerCase() ?? "";
  return IMAP_SERVERS[domain] ?? { host: `imap.${domain}`, port: 993, tls: true };
}
