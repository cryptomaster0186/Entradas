/**
 * Deterministic fingerprints for purchase deduplication.
 *
 * A fingerprint is a SHA-256 hex digest of a normalised key that uniquely
 * identifies a purchase.  Inserting the same row twice produces the same
 * fingerprint, so the @unique constraint on Purchase.fingerprint prevents
 * duplicates silently.
 *
 * Strategy by source:
 *  - EMAIL  → hash of the raw IMAP message ID ("<account>:<uid>")
 *  - EXCEL  → hash of (eventName + eventDate + account + seatFrom + seatTo + qty)
 *  - MANUAL → hash of the above fields too, so re-submitting the same form is safe
 */

import crypto from "crypto";

function sha256(input: string): string {
  return crypto.createHash("sha256").update(input, "utf8").digest("hex");
}

function norm(s: string | null | undefined): string {
  return (s ?? "").toString().trim().toLowerCase();
}

function normDate(d: Date | string | null | undefined): string {
  if (!d) return "";
  try {
    return new Date(d).toISOString().split("T")[0]; // "YYYY-MM-DD"
  } catch {
    return String(d);
  }
}

/**
 * Returns a stable fingerprint for an email-sourced purchase.
 * rawEmailId is "<accountEmail>:<imapUid>".
 */
export function fingerprintEmail(rawEmailId: string): string {
  return sha256(`email|${rawEmailId}`);
}

/**
 * Returns a stable fingerprint for an Excel or manual purchase.
 */
export function fingerprintExcel(fields: {
  eventName: string;
  eventDate?: Date | string | null;
  account?: string | null;
  seatFrom?: string | null;
  seatTo?: string | null;
  seat?: string | null;
  quantity?: number | null;
  orderNumber?: string | null;
}): string {
  const key = [
    "excel",
    norm(fields.eventName),
    normDate(fields.eventDate),
    norm(fields.account),
    norm(fields.seatFrom ?? fields.seat),
    norm(fields.seatTo),
    String(fields.quantity ?? 1),
    norm(fields.orderNumber),
  ].join("|");
  return sha256(key);
}

/**
 * Returns a fingerprint suitable for a manually entered purchase.
 * Same algorithm as Excel so that importing a row you already manually
 * entered will deduplicate correctly.
 */
export function fingerprintManual(fields: {
  eventName: string;
  eventDate?: Date | string | null;
  account?: string | null;
  seat?: string | null;
  seatFrom?: string | null;
  seatTo?: string | null;
  quantity?: number | null;
  orderNumber?: string | null;
}): string {
  return fingerprintExcel(fields);
}
