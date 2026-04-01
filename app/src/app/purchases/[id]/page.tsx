import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import prisma from "@/lib/prisma";

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[180px,1fr] gap-4 py-2.5 border-b border-gray-800/50">
      <span className="text-gray-500 text-sm font-medium">{label}</span>
      <span className="text-gray-100 text-sm break-all">{value ?? <span className="text-gray-600">—</span>}</span>
    </div>
  );
}

function fmtDate(d: Date | null | undefined) {
  if (!d) return null;
  return new Date(d).toLocaleDateString("en-GB", {
    day: "2-digit", month: "long", year: "numeric",
  });
}

function fmtDateTime(d: Date | null | undefined) {
  if (!d) return null;
  return new Date(d).toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function fmtCurrency(amount: number, currency: string) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: currency || "GBP" }).format(amount);
}

const STATUS_COLORS: Record<string, string> = {
  CONFIRMED:  "bg-green-500/20 text-green-400",
  PENDING:    "bg-yellow-500/20 text-yellow-400",
  CANCELLED:  "bg-red-500/20 text-red-400",
  REFUNDED:   "bg-gray-500/20 text-gray-400",
};

const SOURCE_COLORS: Record<string, string> = {
  EMAIL:  "bg-blue-500/20 text-blue-400",
  EXCEL:  "bg-purple-500/20 text-purple-400",
  MANUAL: "bg-gray-500/20 text-gray-400",
};

const PARSE_COLORS: Record<string, string> = {
  OK:      "bg-green-500/20 text-green-400",
  PARTIAL: "bg-yellow-500/20 text-yellow-400",
  FAILED:  "bg-red-500/20 text-red-400",
};

export default async function PurchaseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const { id } = await params;

  const purchase = await prisma.purchase.findUnique({
    where: { id },
    include: {
      emailAccount: { select: { label: true, email: true } },
      importRun:    { select: { filename: true, createdAt: true } },
    },
  });

  if (!purchase) notFound();

  const seatDisplay = [purchase.seatFrom, purchase.seatTo].filter(Boolean).join(" – ")
    || purchase.seat
    || null;

  return (
    <div className="max-w-3xl">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/purchases" className="text-indigo-400 hover:text-indigo-300 text-sm">
          ← All Purchases
        </Link>
      </div>

      <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-white">{purchase.eventName}</h1>
            {purchase.venue && (
              <p className="text-gray-400 text-sm mt-1">{purchase.venue}</p>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${SOURCE_COLORS[purchase.source] ?? ""}`}>
              {purchase.source}
            </span>
            <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[purchase.status] ?? ""}`}>
              {purchase.status}
            </span>
            <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${PARSE_COLORS[purchase.parseStatus] ?? ""}`}>
              {purchase.parseStatus}
            </span>
          </div>
        </div>

        {/* Event */}
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Event</h2>
        <div className="mb-5">
          <Row label="Event Name"  value={purchase.eventName} />
          <Row label="Event Date"  value={fmtDate(purchase.eventDate)} />
          <Row label="Venue"       value={purchase.venue} />
          <Row label="Provider"    value={purchase.provider} />
          <Row label="Platform"    value={purchase.platform} />
        </div>

        {/* Seats */}
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Seats</h2>
        <div className="mb-5">
          <Row label="Quantity"    value={purchase.quantity} />
          <Row label="Section"     value={purchase.section} />
          <Row label="Row"         value={purchase.row} />
          <Row label="Seats"       value={seatDisplay} />
          <Row label="Ticket Type" value={purchase.ticketType} />
        </div>

        {/* Financials */}
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Financials</h2>
        <div className="mb-5">
          <Row label="Total Cost"        value={fmtCurrency(purchase.pricePaid, purchase.currency)} />
          <Row label="Cost Per Ticket"   value={purchase.costPerTicket != null ? fmtCurrency(purchase.costPerTicket, purchase.currency) : null} />
          <Row label="Currency"          value={purchase.currency} />
        </div>

        {/* Order */}
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Order</h2>
        <div className="mb-5">
          <Row label="Order Number"  value={purchase.orderNumber} />
          <Row label="Account"       value={purchase.account} />
          <Row label="Purchase Date" value={fmtDate(purchase.purchaseDate)} />
        </div>

        {/* Email metadata (only if from email) */}
        {purchase.source === "EMAIL" && (
          <>
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Email</h2>
            <div className="mb-5">
              <Row label="Email Account"  value={purchase.emailAccount ? `${purchase.emailAccount.label} (${purchase.emailAccount.email})` : purchase.account} />
              <Row label="From"           value={purchase.emailSender} />
              <Row label="Subject"        value={purchase.emailSubject} />
              <Row label="Received At"    value={fmtDateTime(purchase.emailReceivedAt)} />
              <Row label="Message ID"     value={purchase.emailMessageId} />
              <Row label="Raw Email ID"   value={purchase.rawEmailId} />
            </div>
          </>
        )}

        {/* Excel import metadata */}
        {purchase.source === "EXCEL" && purchase.importRun && (
          <>
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Import</h2>
            <div className="mb-5">
              <Row label="Import File"   value={purchase.importRun.filename} />
              <Row label="Imported At"   value={fmtDateTime(purchase.importRun.createdAt)} />
            </div>
          </>
        )}

        {/* Parse warnings */}
        {purchase.parseError && (
          <div className="mt-4 p-3 bg-yellow-900/20 border border-yellow-700/40 rounded-lg">
            <p className="text-xs font-semibold text-yellow-400 mb-1">Parse Warnings</p>
            <p className="text-xs text-yellow-300">{purchase.parseError}</p>
          </div>
        )}

        {/* System fields */}
        <div className="mt-6 pt-4 border-t border-gray-800">
          <div className="grid grid-cols-2 gap-2 text-xs text-gray-600">
            <span>ID: {purchase.id}</span>
            <span>Created: {fmtDateTime(purchase.createdAt)}</span>
            <span>Updated: {fmtDateTime(purchase.updatedAt)}</span>
            <span>Fingerprint: {purchase.fingerprint?.slice(0, 12)}…</span>
          </div>
        </div>
      </div>
    </div>
  );
}
