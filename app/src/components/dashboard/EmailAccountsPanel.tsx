"use client";

import { useState, useEffect, useCallback } from "react";

interface EmailAccount {
  id: string;
  label: string;
  email: string;
  imapHost: string;
  imapPort: number;
  tls: boolean;
  lastFetched: string | null;
  createdAt: string;
  _count: { purchases: number };
}

interface FetchState {
  [id: string]: "idle" | "loading" | "ok" | "error";
}

export function EmailAccountsPanel() {
  const [accounts, setAccounts] = useState<EmailAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchState, setFetchState] = useState<FetchState>({});
  const [fetchMsg, setFetchMsg] = useState<Record<string, string>>({});
  const [showAdd, setShowAdd] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [form, setForm] = useState({
    label: "",
    email: "",
    password: "",
    imapHost: "",
    imapPort: "993",
    tls: true,
  });

  const loadAccounts = useCallback(async () => {
    const res = await fetch("/api/email-accounts");
    if (res.ok) setAccounts(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => { loadAccounts(); }, [loadAccounts]);

  async function handleFetch(id: string) {
    setFetchState((s) => ({ ...s, [id]: "loading" }));
    setFetchMsg((m) => ({ ...m, [id]: "" }));
    const res = await fetch(`/api/email-accounts/${id}/fetch`, { method: "POST" });
    const data = await res.json();
    if (res.ok) {
      setFetchState((s) => ({ ...s, [id]: "ok" }));
      setFetchMsg((m) => ({
        ...m,
        [id]: `Scanned ${data.emailsScanned} emails — ${data.purchasesAdded} new purchase${data.purchasesAdded !== 1 ? "s" : ""} added`,
      }));
      loadAccounts();
    } else {
      setFetchState((s) => ({ ...s, [id]: "error" }));
      setFetchMsg((m) => ({ ...m, [id]: data.error ?? "Fetch failed" }));
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this email account and ALL its associated purchases?")) return;
    await fetch(`/api/email-accounts?id=${id}`, { method: "DELETE" });
    setAccounts((a) => a.filter((acc) => acc.id !== id));
  }

  async function handleAddSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);
    const res = await fetch("/api/email-accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        label:    form.label || form.email,
        email:    form.email,
        password: form.password,
        imapHost: form.imapHost || undefined,
        imapPort: parseInt(form.imapPort, 10) || 993,
        tls:      form.tls,
      }),
    });
    const data = await res.json();
    setSubmitting(false);
    if (!res.ok) {
      setFormError(data.error ?? "Failed to add account");
      return;
    }
    setShowAdd(false);
    setForm({ label: "", email: "", password: "", imapHost: "", imapPort: "993", tls: true });
    loadAccounts();
  }

  function fmt(d: string | null) {
    if (!d) return "Never";
    return new Date(d).toLocaleString("en-GB", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">Email Accounts</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Add your IMAP credentials — the app will scan for ticket confirmation emails automatically.
          </p>
        </div>
        <button
          onClick={() => setShowAdd((v) => !v)}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm px-3 py-1.5 rounded-lg transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Add Account
        </button>
      </div>

      {/* Add account form */}
      {showAdd && (
        <form
          onSubmit={handleAddSubmit}
          className="bg-gray-900 border border-gray-700 rounded-xl p-5 space-y-4"
        >
          <h3 className="text-sm font-semibold text-white">New Email Account</h3>

          {formError && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-2 text-sm text-red-400">
              {formError}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Label (optional)</label>
              <input
                type="text"
                placeholder="e.g. Main iCloud"
                value={form.label}
                onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs text-gray-400 mb-1">Email address *</label>
              <input
                type="email"
                required
                placeholder="you@icloud.com"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs text-gray-400 mb-1">Password / App password *</label>
              <input
                type="password"
                required
                placeholder="iCloud app-specific password"
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs text-gray-400 mb-1">
                IMAP host{" "}
                <span className="text-gray-600">(auto-detected if left blank)</span>
              </label>
              <input
                type="text"
                placeholder="imap.mail.me.com"
                value={form.imapHost}
                onChange={(e) => setForm((f) => ({ ...f, imapHost: e.target.value }))}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs text-gray-400 mb-1">Port</label>
              <input
                type="number"
                value={form.imapPort}
                onChange={(e) => setForm((f) => ({ ...f, imapPort: e.target.value }))}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="flex items-center gap-3 pt-5">
              <input
                id="tls"
                type="checkbox"
                checked={form.tls}
                onChange={(e) => setForm((f) => ({ ...f, tls: e.target.checked }))}
                className="w-4 h-4 accent-indigo-600"
              />
              <label htmlFor="tls" className="text-sm text-gray-300">Use TLS (recommended)</label>
            </div>
          </div>

          <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg px-4 py-2 text-xs text-amber-300">
            <strong>iCloud tip:</strong> Use an{" "}
            <a
              href="https://support.apple.com/en-us/102654"
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              app-specific password
            </a>{" "}
            if you have 2FA enabled. Passwords are stored encrypted with AES-256-GCM.
          </div>

          <div className="flex gap-3 pt-1">
            <button
              type="submit"
              disabled={submitting}
              className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm px-4 py-2 rounded-lg transition-colors"
            >
              {submitting ? "Saving…" : "Save Account"}
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

      {/* Accounts list */}
      {loading ? (
        <p className="text-sm text-gray-600">Loading…</p>
      ) : accounts.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center">
          <p className="text-sm text-gray-600">No email accounts added yet.</p>
          <p className="text-xs text-gray-700 mt-1">
            Click &ldquo;Add Account&rdquo; to connect your first IMAP mailbox.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {accounts.map((acc) => (
            <div
              key={acc.id}
              className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-4"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-white">{acc.label}</span>
                  <span className="text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded-full">
                    {acc._count.purchases} purchase{acc._count.purchases !== 1 ? "s" : ""}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-0.5">{acc.email}</p>
                <p className="text-xs text-gray-600 mt-0.5">
                  {acc.imapHost}:{acc.imapPort} {acc.tls ? "· TLS" : ""}
                </p>
                <p className="text-xs text-gray-600 mt-0.5">
                  Last fetched: {fmt(acc.lastFetched)}
                </p>
                {fetchMsg[acc.id] && (
                  <p
                    className={`text-xs mt-1 ${
                      fetchState[acc.id] === "error"
                        ? "text-red-400"
                        : "text-green-400"
                    }`}
                  >
                    {fetchMsg[acc.id]}
                  </p>
                )}
              </div>

              <div className="flex gap-2 shrink-0">
                <button
                  onClick={() => handleFetch(acc.id)}
                  disabled={fetchState[acc.id] === "loading"}
                  className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs px-3 py-1.5 rounded-lg transition-colors"
                >
                  {fetchState[acc.id] === "loading" ? (
                    <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  ) : (
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  )}
                  {fetchState[acc.id] === "loading" ? "Fetching…" : "Fetch Emails"}
                </button>

                <button
                  onClick={() => handleDelete(acc.id)}
                  className="bg-gray-800 hover:bg-red-900/40 text-gray-400 hover:text-red-400 text-xs px-3 py-1.5 rounded-lg transition-colors"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
