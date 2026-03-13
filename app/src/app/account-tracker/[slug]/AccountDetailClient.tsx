"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";
import Link from "next/link";
import { extractEventId } from "@/lib/stats-csv";
import type { StatsRow } from "@/lib/stats-csv";

interface Props {
  email: string;
  rows: StatsRow[];
  eventNames: Record<string, string>;
  userRole: "ADMIN" | "VIEWER";
  userEmail: string;
}

export function AccountDetailClient({ email, rows, eventNames: initialEventNames, userRole, userEmail }: Props) {
  const [eventNames, setEventNames] = useState<Record<string, string>>(initialEventNames);
  const isAdmin = userRole === "ADMIN";

  const uniqueUrls = Array.from(new Set(rows.map((r) => r.eventUrl)));

  function resolveEventName(url: string): string {
    return eventNames[url] ?? extractEventId(url);
  }

  async function saveEventName(eventUrl: string, eventName: string) {
    await fetch("/api/account-tracker/event-names", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventUrl, eventName }),
    });
    setEventNames((prev) => ({ ...prev, [eventUrl]: eventName }));
  }

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
            <Link href="/dashboard" className="px-3 py-1.5 rounded-lg text-sm font-medium text-gray-400 hover:text-white hover:bg-gray-800 transition-colors">
              Dashboard
            </Link>
            <Link href="/account-tracker" className="px-3 py-1.5 rounded-lg text-sm font-medium text-gray-400 hover:text-white hover:bg-gray-800 transition-colors">
              Account Tracker
            </Link>
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
        {/* Back */}
        <Link href="/account-tracker" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-white transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back to accounts
        </Link>

        {/* Account header */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl px-6 py-5">
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Account</p>
          <p className="text-xl font-bold text-white font-mono break-all">{email}</p>
          <div className="flex gap-4 mt-3">
            <div className="text-center">
              <p className="text-2xl font-bold text-indigo-400">{rows.length}</p>
              <p className="text-xs text-gray-500">Total entries</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-indigo-400">{uniqueUrls.length}</p>
              <p className="text-xs text-gray-500">Unique events</p>
            </div>
          </div>
        </div>

        {/* Events table */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-800">
            <h2 className="text-sm font-semibold text-white">Event History</h2>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">#</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Event Name</th>
                <th className="text-right px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Initial Queue Position</th>
                {isAdmin && <th className="px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider text-right">Rename</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <EventRow
                  key={i}
                  index={i + 1}
                  row={row}
                  eventName={resolveEventName(row.eventUrl)}
                  isAdmin={isAdmin}
                  hasCustomName={!!eventNames[row.eventUrl]}
                  onSave={saveEventName}
                />
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}

function EventRow({
  index,
  row,
  eventName,
  isAdmin,
  hasCustomName,
  onSave,
}: {
  index: number;
  row: StatsRow;
  eventName: string;
  isAdmin: boolean;
  hasCustomName: boolean;
  onSave: (url: string, name: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(eventName);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!value.trim()) return;
    setSaving(true);
    await onSave(row.eventUrl, value.trim());
    setSaving(false);
    setEditing(false);
  }

  return (
    <tr className="border-b border-gray-800/50 last:border-0 hover:bg-gray-800/20 transition-colors">
      <td className="px-5 py-3 text-gray-600 text-xs">{index}</td>
      <td className="px-5 py-3">
        {editing ? (
          <div className="flex items-center gap-2">
            <input
              autoFocus
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setEditing(false); }}
              className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-indigo-500 w-64"
            />
            <button onClick={save} disabled={saving} className="text-xs text-indigo-400 hover:text-indigo-300 disabled:opacity-50">Save</button>
            <button onClick={() => setEditing(false)} className="text-xs text-gray-500 hover:text-white">Cancel</button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className={`font-medium ${hasCustomName ? "text-white" : "text-gray-400"}`}>
              {eventName}
            </span>
            {!hasCustomName && (
              <span className="text-xs text-gray-600 font-mono">(ID)</span>
            )}
          </div>
        )}
      </td>
      <td className="px-5 py-3 text-right font-mono text-indigo-300 font-semibold">
        {row.initialQueueSpot.toLocaleString()}
      </td>
      {isAdmin && (
        <td className="px-5 py-3 text-right">
          {!editing && (
            <button
              onClick={() => setEditing(true)}
              className="text-xs text-gray-600 hover:text-indigo-400 transition-colors"
            >
              {hasCustomName ? "Rename" : "Set name"}
            </button>
          )}
        </td>
      )}
    </tr>
  );
}
