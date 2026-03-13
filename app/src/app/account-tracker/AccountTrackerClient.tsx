"use client";

import { useState, useMemo } from "react";
import { signOut } from "next-auth/react";
import Link from "next/link";
import type { AccountSummary } from "@/lib/stats-csv";

interface Props {
  accounts: AccountSummary[];
  eventNames: Record<string, string>;
  userRole: "ADMIN" | "VIEWER";
  userEmail: string;
}

export function AccountTrackerClient({ accounts, eventNames: initialEventNames, userRole, userEmail }: Props) {
  const [search, setSearch] = useState("");
  const [eventNames, setEventNames] = useState<Record<string, string>>(initialEventNames);
  const isAdmin = userRole === "ADMIN";

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return accounts;
    return accounts.filter((a) => a.email.toLowerCase().includes(q));
  }, [accounts, search]);

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col">
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-900/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-14">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" />
              </svg>
            </div>
            <span className="font-bold text-white text-sm">Entradas</span>
          </div>

          <nav className="flex gap-1">
            <Link
              href="/dashboard"
              className="px-3 py-1.5 rounded-lg text-sm font-medium text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
            >
              Dashboard
            </Link>
            <span className="px-3 py-1.5 rounded-lg text-sm font-medium bg-indigo-600 text-white">
              Account Tracker
            </span>
          </nav>

          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-500 hidden md:block">{userEmail}</span>
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="text-xs text-gray-500 hover:text-white transition-colors"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-white">Account Tracker</h1>
          <span className="text-sm text-gray-500">{accounts.length} accounts</span>
        </div>

        {/* Search */}
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search by email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-gray-900 border border-gray-700 rounded-xl pl-9 pr-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 transition-colors"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"
            >
              ✕
            </button>
          )}
        </div>

        {/* Accounts table */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                <th className="text-right px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Events</th>
                <th className="text-right px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Unique Events</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-5 py-10 text-center text-gray-600">
                    {search ? "No accounts match your search." : "No accounts found in stats.csv."}
                  </td>
                </tr>
              ) : (
                filtered.map((account) => (
                  <AccountRow
                    key={account.email}
                    account={account}
                    eventNames={eventNames}
                    isAdmin={isAdmin}
                    onEventNameSaved={(url, name) =>
                      setEventNames((prev) => ({ ...prev, [url]: name }))
                    }
                  />
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Event Name Manager (admin) */}
        {isAdmin && <EventNameManager eventNames={eventNames} onSaved={(url, name) =>
          setEventNames((prev) => ({ ...prev, [url]: name }))
        } />}
      </main>
    </div>
  );
}

function AccountRow({
  account,
  isAdmin,
  eventNames,
  onEventNameSaved,
}: {
  account: AccountSummary;
  isAdmin: boolean;
  eventNames: Record<string, string>;
  onEventNameSaved: (url: string, name: string) => void;
}) {
  void isAdmin;
  void eventNames;
  void onEventNameSaved;

  return (
    <tr className="border-b border-gray-800/50 last:border-0 hover:bg-gray-800/30 transition-colors">
      <td className="px-5 py-3 text-gray-200 font-mono text-xs">{account.email}</td>
      <td className="px-5 py-3 text-right text-gray-300">{account.eventCount}</td>
      <td className="px-5 py-3 text-right text-gray-300">{account.uniqueEventCount}</td>
      <td className="px-5 py-3 text-right">
        <Link
          href={`/account-tracker/${encodeURIComponent(account.email)}`}
          className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
        >
          View →
        </Link>
      </td>
    </tr>
  );
}

function EventNameManager({
  eventNames,
  onSaved,
}: {
  eventNames: Record<string, string>;
  onSaved: (url: string, name: string) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-3 text-sm font-medium text-gray-300 hover:text-white transition-colors"
      >
        <span>Event Name Mappings</span>
        <svg
          className={`w-4 h-4 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="border-t border-gray-800 px-5 py-4 space-y-3">
          <p className="text-xs text-gray-500">
            Map Ticketmaster event URLs to readable names. These names are used throughout the Account Tracker.
          </p>
          {Object.keys(eventNames).length > 0 && (
            <div className="space-y-1">
              {Object.entries(eventNames).map(([url, name]) => (
                <EventNameRow key={url} eventUrl={url} currentName={name} onSaved={onSaved} />
              ))}
            </div>
          )}
          <AddEventNameForm onSaved={onSaved} />
        </div>
      )}
    </div>
  );
}

function EventNameRow({
  eventUrl,
  currentName,
  onSaved,
}: {
  eventUrl: string;
  currentName: string;
  onSaved: (url: string, name: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(currentName);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!value.trim()) return;
    setSaving(true);
    await fetch("/api/account-tracker/event-names", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventUrl, eventName: value.trim() }),
    });
    onSaved(eventUrl, value.trim());
    setSaving(false);
    setEditing(false);
  }

  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-gray-600 font-mono truncate max-w-xs">{eventUrl}</span>
      <span className="text-gray-600">→</span>
      {editing ? (
        <>
          <input
            className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-white flex-1 focus:outline-none focus:border-indigo-500"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setEditing(false); }}
            autoFocus
          />
          <button onClick={save} disabled={saving} className="text-indigo-400 hover:text-indigo-300 disabled:opacity-50">Save</button>
          <button onClick={() => setEditing(false)} className="text-gray-500 hover:text-white">Cancel</button>
        </>
      ) : (
        <>
          <span className="text-gray-200">{currentName}</span>
          <button onClick={() => setEditing(true)} className="text-gray-600 hover:text-indigo-400">Edit</button>
        </>
      )}
    </div>
  );
}

function AddEventNameForm({ onSaved }: { onSaved: (url: string, name: string) => void }) {
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!url.trim() || !name.trim()) return;
    setSaving(true);
    await fetch("/api/account-tracker/event-names", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventUrl: url.trim(), eventName: name.trim() }),
    });
    onSaved(url.trim(), name.trim());
    setUrl("");
    setName("");
    setSaving(false);
  }

  return (
    <div className="flex items-center gap-2 pt-2 border-t border-gray-800">
      <input
        placeholder="Event URL"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white flex-1 focus:outline-none focus:border-indigo-500"
      />
      <input
        placeholder="Event Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") save(); }}
        className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white flex-1 focus:outline-none focus:border-indigo-500"
      />
      <button
        onClick={save}
        disabled={saving || !url.trim() || !name.trim()}
        className="text-xs text-indigo-400 hover:text-indigo-300 disabled:opacity-40 transition-colors"
      >
        Add
      </button>
    </div>
  );
}
