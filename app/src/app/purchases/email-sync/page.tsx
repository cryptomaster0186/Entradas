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
  loading: boolean;
  result: { emailsScanned: number; purchasesAdded: number } | null;
  error: string | null;
}

function detectImap(email: string): { host: string; port: number; tls: boolean } {
  const domain = email.split("@")[1]?.toLowerCase() ?? "";
  if (domain === "gmail.com" || domain === "googlemail.com")
    return { host: "imap.gmail.com", port: 993, tls: true };
  if (domain === "icloud.com" || domain === "me.com" || domain === "mac.com")
    return { host: "imap.mail.me.com", port: 993, tls: true };
  if (domain === "outlook.com" || domain === "hotmail.com" || domain === "live.com")
    return { host: "outlook.office365.com", port: 993, tls: true };
  if (domain === "yahoo.com" || domain === "ymail.com")
    return { host: "imap.mail.yahoo.com", port: 993, tls: true };
  return { host: "", port: 993, tls: true };
}

function fmtDate(d: string | null) {
  if (!d) return "Never";
  return new Date(d).toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export default function EmailSyncPage() {
  const [accounts, setAccounts] = useState<EmailAccount[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [fetchStates, setFetchStates] = useState<Record<string, FetchState>>({});
  const [deleting, setDeleting] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  // Form state
  const [formEmail, setFormEmail] = useState("");
  const [formLabel, setFormLabel] = useState("");
  const [formPassword, setFormPassword] = useState("");
  const [formHost, setFormHost] = useState("");
  const [formPort, setFormPort] = useState(993);
  const [formTls, setFormTls] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);
  const [formLoading, setFormLoading] = useState(false);

  const load = useCallback(async () => {
    setLoadingAccounts(true);
    try {
      const res = await fetch("/api/email-accounts");
      if (res.ok) setAccounts(await res.json());
    } finally {
      setLoadingAccounts(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function handleEmailChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setFormEmail(val);
    if (!formLabel) setFormLabel(val);
    const detected = detectImap(val);
    if (detected.host) {
      setFormHost(detected.host);
      setFormPort(detected.port);
      setFormTls(detected.tls);
    }
  }

  async function handleAddAccount(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setFormLoading(true);
    try {
      const res = await fetch("/api/email-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: formEmail,
          password: formPassword,
          label: formLabel || formEmail,
          imapHost: formHost || undefined,
          imapPort: formPort,
          tls: formTls,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setFormError(data.error ?? "Failed to add account"); return; }
      setShowForm(false);
      setFormEmail(""); setFormLabel(""); setFormPassword("");
      setFormHost(""); setFormPort(993); setFormTls(true);
      load();
    } finally {
      setFormLoading(false);
    }
  }

  async function handleFetch(accountId: string) {
    setFetchStates((prev) => ({
      ...prev,
      [accountId]: { loading: true, result: null, error: null },
    }));
    try {
      const res = await fetch(`/api/email-accounts/${accountId}/fetch`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setFetchStates((prev) => ({
          ...prev,
          [accountId]: { loading: false, result: null, error: data.error ?? "Fetch failed" },
        }));
      } else {
        setFetchStates((prev) => ({
          ...prev,
          [accountId]: { loading: false, result: { emailsScanned: data.emailsScanned, purchasesAdded: data.purchasesAdded }, error: null },
        }));
        load(); // refresh lastFetched
      }
    } catch {
      setFetchStates((prev) => ({
        ...prev,
        [accountId]: { loading: false, result: null, error: "Network error" },
      }));
    }
  }

  async function handleDelete(accountId: string) {
    if (!confirm("Delete this account? All associated purchases will also be removed.")) return;
    setDeleting(accountId);
    try {
      await fetch(`/api/email-accounts?id=${accountId}`, { method: "DELETE" });
      load();
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Email Sync</h1>
          <p className="text-gray-400 text-sm mt-0.5">
            Connect Gmail or iCloud accounts to automatically import ticket confirmation emails.
          </p>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="px-3 py-1.5 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 transition-colors"
        >
          {showForm ? "Cancel" : "+ Add Account"}
        </button>
      </div>

      {/* Add account form */}
      {showForm && (
        <form onSubmit={handleAddAccount} className="bg-gray-900 rounded-xl border border-gray-800 p-5 mb-6 space-y-4">
          <h2 className="text-sm font-semibold text-white">New Email Account</h2>

          {formError && (
            <div className="p-3 bg-red-900/30 border border-red-700/50 rounded-lg text-sm text-red-300">
              {formError}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Email address *</label>
              <input
                type="email"
                required
                value={formEmail}
                onChange={handleEmailChange}
                placeholder="you@gmail.com"
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Label</label>
              <input
                type="text"
                value={formLabel}
                onChange={(e) => setFormLabel(e.target.value)}
                placeholder="My Gmail"
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">App Password *</label>
            <input
              type="password"
              required
              value={formPassword}
              onChange={(e) => setFormPassword(e.target.value)}
              placeholder="App-specific password (not your main password)"
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            <p className="text-xs text-gray-600 mt-1">
              Gmail: Google Account → Security → App Passwords.
              iCloud: appleid.apple.com → Sign-In &amp; Security → App-Specific Passwords.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2">
              <label className="block text-xs text-gray-400 mb-1">IMAP Host</label>
              <input
                type="text"
                value={formHost}
                onChange={(e) => setFormHost(e.target.value)}
                placeholder="Auto-detected"
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Port</label>
              <input
                type="number"
                value={formPort}
                onChange={(e) => setFormPort(parseInt(e.target.value, 10))}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="tls"
              checked={formTls}
              onChange={(e) => setFormTls(e.target.checked)}
              className="rounded"
            />
            <label htmlFor="tls" className="text-xs text-gray-400">Use TLS/SSL</label>
          </div>

          <button
            type="submit"
            disabled={formLoading}
            className="px-5 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 disabled:opacity-40 transition-colors"
          >
            {formLoading ? "Adding…" : "Add Account"}
          </button>
        </form>
      )}

      {/* Account list */}
      {loadingAccounts ? (
        <div className="text-center py-10 text-gray-500 text-sm">Loading…</div>
      ) : accounts.length === 0 ? (
        <div className="text-center py-10 text-gray-600">
          <p className="text-sm">No email accounts connected yet.</p>
          <p className="text-xs mt-1">Add a Gmail or iCloud account to start importing confirmations.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {accounts.map((account) => {
            const fs = fetchStates[account.id];
            return (
              <div key={account.id} className="bg-gray-900 rounded-xl border border-gray-800 p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium text-white text-sm">{account.label}</p>
                    <p className="text-gray-400 text-xs mt-0.5">{account.email}</p>
                    <p className="text-gray-600 text-xs mt-1">
                      {account.imapHost}:{account.imapPort} {account.tls ? "· TLS" : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 tabular-nums">
                      {account._count.purchases} purchase{account._count.purchases !== 1 ? "s" : ""}
                    </span>
                    <button
                      onClick={() => handleFetch(account.id)}
                      disabled={fs?.loading}
                      className="px-3 py-1.5 text-xs font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 disabled:opacity-40 transition-colors"
                    >
                      {fs?.loading ? "Syncing…" : "Sync Now"}
                    </button>
                    <button
                      onClick={() => handleDelete(account.id)}
                      disabled={deleting === account.id}
                      className="px-3 py-1.5 text-xs font-medium text-red-400 hover:text-red-300 hover:bg-red-900/20 rounded-lg transition-colors disabled:opacity-40"
                    >
                      Remove
                    </button>
                  </div>
                </div>

                <div className="mt-2 text-xs text-gray-600">
                  Last sync: {fmtDate(account.lastFetched)}
                </div>

                {fs?.result && (
                  <div className="mt-2 p-2 bg-green-900/20 border border-green-700/30 rounded-lg text-xs text-green-300">
                    Scanned {fs.result.emailsScanned} emails · Added {fs.result.purchasesAdded} new purchase{fs.result.purchasesAdded !== 1 ? "s" : ""}
                  </div>
                )}
                {fs?.error && (
                  <div className="mt-2 p-2 bg-red-900/20 border border-red-700/30 rounded-lg text-xs text-red-300">
                    {fs.error}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
