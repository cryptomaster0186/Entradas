"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

interface Purchase {
  id: string;
  eventName: string;
  eventDate: string | null;
  venue: string | null;
  section: string | null;
  row: string | null;
  seat: string | null;
  seatFrom: string | null;
  seatTo: string | null;
  quantity: number;
  pricePaid: number;
  costPerTicket: number | null;
  currency: string;
  status: string;
  source: string;
  parseStatus: string;
  platform: string | null;
  account: string | null;
  ticketType: string | null;
  purchaseDate: string | null;
  orderNumber: string | null;
  createdAt: string;
}

interface ApiResponse {
  purchases: Purchase[];
  total: number;
  page: number;
  limit: number;
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
  OK:      "text-green-500",
  PARTIAL: "text-yellow-500",
  FAILED:  "text-red-500",
};

function fmt(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtCurrency(amount: number, currency: string) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: currency || "GBP" }).format(amount);
}

export default function PurchasesPage() {
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const LIMIT = 50;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
      if (search)       params.set("search", search);
      if (statusFilter) params.set("status", statusFilter);
      if (sourceFilter) params.set("source", sourceFilter);

      const res = await fetch(`/api/purchases?${params}`);
      if (!res.ok) return;
      const data: ApiResponse = await res.json();
      setPurchases(data.purchases);
      setTotal(data.total);
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter, sourceFilter]);

  useEffect(() => { load(); }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Purchases</h1>
          <p className="text-gray-400 text-sm mt-0.5">{total} total records, sorted by event date</p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/purchases/import"
            className="px-3 py-1.5 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 transition-colors"
          >
            Import Excel
          </Link>
          <Link
            href="/purchases/email-sync"
            className="px-3 py-1.5 text-sm font-medium bg-gray-700 text-gray-200 rounded-lg hover:bg-gray-600 transition-colors"
          >
            Email Sync
          </Link>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <input
          type="text"
          placeholder="Search event, venue, order..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="flex-1 min-w-[200px] px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
        >
          <option value="">All statuses</option>
          <option value="CONFIRMED">Confirmed</option>
          <option value="PENDING">Pending</option>
          <option value="CANCELLED">Cancelled</option>
          <option value="REFUNDED">Refunded</option>
        </select>
        <select
          value={sourceFilter}
          onChange={(e) => { setSourceFilter(e.target.value); setPage(1); }}
          className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
        >
          <option value="">All sources</option>
          <option value="EMAIL">Email</option>
          <option value="EXCEL">Excel</option>
          <option value="MANUAL">Manual</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-40 text-gray-500 text-sm">Loading...</div>
        ) : purchases.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-gray-500">
            <p className="text-sm">No purchases found</p>
            <p className="text-xs mt-1">Try importing an Excel file or setting up email sync</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800 bg-gray-800/50">
                  <th className="text-left px-4 py-3 text-gray-400 font-medium">Event</th>
                  <th className="text-left px-4 py-3 text-gray-400 font-medium">Event Date</th>
                  <th className="text-left px-4 py-3 text-gray-400 font-medium">Venue</th>
                  <th className="text-right px-4 py-3 text-gray-400 font-medium">Qty</th>
                  <th className="text-right px-4 py-3 text-gray-400 font-medium">Total Cost</th>
                  <th className="text-left px-4 py-3 text-gray-400 font-medium">Source</th>
                  <th className="text-left px-4 py-3 text-gray-400 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {purchases.map((p) => (
                  <tr
                    key={p.id}
                    className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/purchases/${p.id}`}
                        className="text-indigo-400 hover:text-indigo-300 font-medium line-clamp-1"
                      >
                        {p.eventName}
                      </Link>
                      {p.parseStatus !== "OK" && (
                        <span className={`text-xs ml-2 ${PARSE_COLORS[p.parseStatus]}`}>
                          {p.parseStatus === "PARTIAL" ? "partial" : "failed"}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-300 whitespace-nowrap">{fmt(p.eventDate)}</td>
                    <td className="px-4 py-3 text-gray-400 text-xs line-clamp-1 max-w-[160px]">{p.venue ?? "—"}</td>
                    <td className="px-4 py-3 text-right text-gray-300">{p.quantity}</td>
                    <td className="px-4 py-3 text-right text-white font-medium tabular-nums">
                      {fmtCurrency(p.pricePaid, p.currency)}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${SOURCE_COLORS[p.source] ?? ""}`}>
                        {p.source}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[p.status] ?? ""}`}>
                        {p.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-sm text-gray-400">
            Page {page} of {totalPages} ({total} records)
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="px-3 py-1.5 text-sm rounded-lg bg-gray-800 text-gray-300 hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="px-3 py-1.5 text-sm rounded-lg bg-gray-800 text-gray-300 hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
