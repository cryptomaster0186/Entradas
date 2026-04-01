"use client";

import { useState, useEffect, useCallback } from "react";

interface Purchase {
  id: string;
  eventName: string;
  eventDate: string | null;
  venue: string | null;
  section: string | null;
  row: string | null;
  seats: string | null;
  quantity: number;
  orderNumber: string | null;
  platform: string;
  account: string;
  pricePaid: number;
  currency: string;
  status: "CONFIRMED" | "PENDING" | "CANCELLED" | "REFUNDED";
  source: "MANUAL" | "EMAIL";
  createdAt: string;
}

interface ApiResponse {
  purchases: Purchase[];
  total: number;
  page: number;
  limit: number;
}

const STATUS_COLORS: Record<string, string> = {
  CONFIRMED: "bg-green-500/20 text-green-300",
  PENDING:   "bg-amber-500/20 text-amber-300",
  CANCELLED: "bg-red-500/20 text-red-300",
  REFUNDED:  "bg-gray-500/20 text-gray-400",
};

const SOURCE_COLORS: Record<string, string> = {
  EMAIL:  "bg-indigo-500/20 text-indigo-300",
  MANUAL: "bg-gray-700 text-gray-400",
};

const BLANK_FORM = {
  eventName: "",
  eventDate: "",
  venue: "",
  section: "",
  row: "",
  seats: "",
  quantity: "1",
  orderNumber: "",
  platform: "ticketmaster.co.uk",
  account: "",
  pricePaid: "",
  currency: "GBP",
};

export function PurchasesPanel() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterPlatform, setFilterPlatform] = useState("");

  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(BLANK_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: "50" });
    if (search)         params.set("search",   search);
    if (filterStatus)   params.set("status",   filterStatus);
    if (filterPlatform) params.set("platform", filterPlatform);
    const res = await fetch(`/api/purchases?${params}`);
    if (res.ok) setData(await res.json());
    setLoading(false);
  }, [page, search, filterStatus, filterPlatform]);

  useEffect(() => { load(); }, [load]);

  async function handleAddSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);
    const res = await fetch("/api/purchases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventName:   form.eventName,
        eventDate:   form.eventDate || null,
        venue:       form.venue || null,
        section:     form.section || null,
        row:         form.row || null,
        seats:       form.seats || null,
        quantity:    parseInt(form.quantity, 10) || 1,
        orderNumber: form.orderNumber || null,
        platform:    form.platform,
        account:     form.account,
        pricePaid:   parseFloat(form.pricePaid) || 0,
        currency:    form.currency,
      }),
    });
    const body = await res.json();
    setSubmitting(false);
    if (!res.ok) { setFormError(body.error ?? "Failed"); return; }
    setShowAdd(false);
    setForm(BLANK_FORM);
    load();
  }

  async function handleStatusChange(id: string, status: string) {
    await fetch(`/api/purchases?id=${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    load();
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this purchase?")) return;
    await fetch(`/api/purchases?id=${id}`, { method: "DELETE" });
    load();
  }

  function fmtDate(d: string | null) {
    if (!d) return "—";
    return new Date(d).toLocaleDateString("en-GB", {
      day: "2-digit", month: "short", year: "numeric",
    });
  }

  function fmtPrice(amount: number, currency: string) {
    const symbols: Record<string, string> = { GBP: "£", EUR: "€", USD: "$", MXN: "$" };
    return `${symbols[currency] ?? ""}${amount.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
  }

  const totalPages = data ? Math.ceil(data.total / 50) : 1;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white">Purchases</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Tickets you bought — imported from email or added manually.
          </p>
        </div>
        <button
          onClick={() => setShowAdd((v) => !v)}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm px-3 py-1.5 rounded-lg transition-colors shrink-0"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Add Manually
        </button>
      </div>

      {/* Add form */}
      {showAdd && (
        <form
          onSubmit={handleAddSubmit}
          className="bg-gray-900 border border-gray-700 rounded-xl p-5 space-y-4"
        >
          <h3 className="text-sm font-semibold text-white">New Purchase</h3>
          {formError && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-2 text-sm text-red-400">
              {formError}
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { label: "Event name *",   key: "eventName",   type: "text",   required: true,  placeholder: "Taylor Swift – Eras Tour" },
              { label: "Event date",     key: "eventDate",   type: "date",   required: false, placeholder: "" },
              { label: "Venue",          key: "venue",       type: "text",   required: false, placeholder: "O2 Arena, London" },
              { label: "Section/Zone",   key: "section",     type: "text",   required: false, placeholder: "Floor A" },
              { label: "Row",            key: "row",         type: "text",   required: false, placeholder: "C" },
              { label: "Seats",          key: "seats",       type: "text",   required: false, placeholder: "12, 13" },
              { label: "Quantity",       key: "quantity",    type: "number", required: false, placeholder: "1" },
              { label: "Order number",   key: "orderNumber", type: "text",   required: false, placeholder: "12-34567/UK1" },
              { label: "Platform *",     key: "platform",    type: "text",   required: true,  placeholder: "ticketmaster.co.uk" },
              { label: "Account (email)*",key: "account",   type: "email",  required: true,  placeholder: "you@icloud.com" },
              { label: "Price paid",     key: "pricePaid",   type: "number", required: false, placeholder: "0.00" },
              { label: "Currency",       key: "currency",    type: "text",   required: false, placeholder: "GBP" },
            ].map(({ label, key, type, required, placeholder }) => (
              <div key={key}>
                <label className="block text-xs text-gray-400 mb-1">{label}</label>
                <input
                  type={type}
                  required={required}
                  placeholder={placeholder}
                  value={form[key as keyof typeof form]}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                  step={type === "number" ? "any" : undefined}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500"
                />
              </div>
            ))}
          </div>
          <div className="flex gap-3 pt-1">
            <button
              type="submit"
              disabled={submitting}
              className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm px-4 py-2 rounded-lg transition-colors"
            >
              {submitting ? "Saving…" : "Save Purchase"}
            </button>
            <button
              type="button"
              onClick={() => { setShowAdd(false); setFormError(null); }}
              className="bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm px-4 py-2 rounded-lg transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <input
          type="text"
          placeholder="Search event, order, account…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="bg-gray-900 border border-gray-800 rounded-lg px-3 py-1.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500 min-w-56"
        />
        <select
          value={filterStatus}
          onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }}
          className="bg-gray-900 border border-gray-800 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-indigo-500"
        >
          <option value="">All statuses</option>
          <option value="CONFIRMED">Confirmed</option>
          <option value="PENDING">Pending</option>
          <option value="CANCELLED">Cancelled</option>
          <option value="REFUNDED">Refunded</option>
        </select>
        <select
          value={filterPlatform}
          onChange={(e) => { setFilterPlatform(e.target.value); setPage(1); }}
          className="bg-gray-900 border border-gray-800 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-indigo-500"
        >
          <option value="">All platforms</option>
          <option value="ticketmaster.co.uk">ticketmaster.co.uk</option>
          <option value="ticketmaster.com.mx">ticketmaster.com.mx</option>
          <option value="ticketmaster.at">ticketmaster.at</option>
          <option value="ticketmaster.com">ticketmaster.com</option>
          <option value="livenation.com">livenation.com</option>
        </select>
      </div>

      {/* Summary */}
      {data && (
        <p className="text-xs text-gray-600">
          {data.total} purchase{data.total !== 1 ? "s" : ""}
          {data.total > 50 && ` · page ${page} of ${totalPages}`}
        </p>
      )}

      {/* Table */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-800">
                {["Event", "Date", "Venue", "Seats", "Qty", "Order #", "Platform", "Account", "Price", "Status", "Source", ""].map(
                  (h) => (
                    <th
                      key={h}
                      className="text-left px-4 py-3 text-gray-500 font-medium whitespace-nowrap"
                    >
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={12} className="px-4 py-8 text-center text-gray-600">
                    Loading…
                  </td>
                </tr>
              ) : !data?.purchases.length ? (
                <tr>
                  <td colSpan={12} className="px-4 py-8 text-center text-gray-600">
                    No purchases yet.{" "}
                    {!search && !filterStatus && !filterPlatform && (
                      <span>
                        Add one manually or{" "}
                        <button
                          className="underline text-indigo-400 hover:text-indigo-300"
                          onClick={() => {/* parent will switch tab */}}
                        >
                          fetch from email
                        </button>.
                      </span>
                    )}
                  </td>
                </tr>
              ) : (
                data.purchases.map((p) => (
                  <tr
                    key={p.id}
                    className="border-b border-gray-800/50 last:border-0 hover:bg-gray-800/30 transition-colors"
                  >
                    <td className="px-4 py-2.5 text-gray-200 font-medium max-w-xs">
                      <div className="truncate" title={p.eventName}>{p.eventName}</div>
                    </td>
                    <td className="px-4 py-2.5 text-gray-400 whitespace-nowrap">
                      {fmtDate(p.eventDate)}
                    </td>
                    <td className="px-4 py-2.5 text-gray-400 max-w-[120px]">
                      <div className="truncate" title={p.venue ?? ""}>{p.venue ?? "—"}</div>
                    </td>
                    <td className="px-4 py-2.5 text-gray-400 whitespace-nowrap">
                      {[p.section, p.row ? `Row ${p.row}` : null, p.seats ? `Seat ${p.seats}` : null]
                        .filter(Boolean)
                        .join(" · ") || "—"}
                    </td>
                    <td className="px-4 py-2.5 text-gray-300 text-center">{p.quantity}</td>
                    <td className="px-4 py-2.5 text-gray-500 font-mono">
                      {p.orderNumber ?? "—"}
                    </td>
                    <td className="px-4 py-2.5 text-gray-400">{p.platform}</td>
                    <td className="px-4 py-2.5 text-gray-500 max-w-[120px]">
                      <div className="truncate" title={p.account}>{p.account}</div>
                    </td>
                    <td className="px-4 py-2.5 text-gray-300 whitespace-nowrap">
                      {fmtPrice(p.pricePaid, p.currency)}
                    </td>
                    <td className="px-4 py-2.5">
                      <select
                        value={p.status}
                        onChange={(e) => handleStatusChange(p.id, e.target.value)}
                        className={`text-xs px-2 py-0.5 rounded-full border-0 focus:outline-none cursor-pointer ${STATUS_COLORS[p.status] ?? ""}`}
                      >
                        <option value="CONFIRMED">Confirmed</option>
                        <option value="PENDING">Pending</option>
                        <option value="CANCELLED">Cancelled</option>
                        <option value="REFUNDED">Refunded</option>
                      </select>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${SOURCE_COLORS[p.source] ?? ""}`}>
                        {p.source.toLowerCase()}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <button
                        onClick={() => handleDelete(p.id)}
                        className="text-gray-700 hover:text-red-400 transition-colors"
                        title="Delete"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex gap-2 justify-center">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="bg-gray-800 hover:bg-gray-700 disabled:opacity-40 text-gray-300 text-xs px-3 py-1.5 rounded-lg transition-colors"
          >
            ← Prev
          </button>
          <span className="text-xs text-gray-500 self-center">
            {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="bg-gray-800 hover:bg-gray-700 disabled:opacity-40 text-gray-300 text-xs px-3 py-1.5 rounded-lg transition-colors"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
