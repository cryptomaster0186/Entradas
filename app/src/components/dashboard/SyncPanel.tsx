"use client";

import { useState } from "react";

interface SyncLog {
  id: string;
  startedAt: string;
  completedAt: string | null;
  status: string;
  rowsTickets: number;
  rowsExpenses: number;
  triggeredBy: string;
  error: string | null;
}

interface SyncPanelProps {
  logs: SyncLog[];
  onSyncSuccess: () => void;
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    COMPLETED: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    RUNNING:   "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
    FAILED:    "bg-red-500/15 text-red-400 border-red-500/30",
  };
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${styles[status] ?? styles.FAILED}`}>
      {status}
    </span>
  );
}

function duration(start: string, end: string | null) {
  if (!end) return "—";
  const ms = new Date(end).getTime() - new Date(start).getTime();
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

interface SyncDiag {
  financialSummaryFound: boolean;
  payoutEntriesCount: number;
  financialSummary: Record<string, number> | null;
  payoutEntries: { platform: string; amount: number }[];
}

export function SyncPanel({ logs: initialLogs, onSyncSuccess }: SyncPanelProps) {
  const [logs, setLogs] = useState<SyncLog[]>(initialLogs);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [diag, setDiag] = useState<SyncDiag | null>(null);

  async function triggerSync() {
    setSyncing(true);
    setMessage(null);
    setDiag(null);
    try {
      const res = await fetch("/api/sync", { method: "POST" });
      const json = await res.json();

      if (!res.ok) {
        setMessage({ type: "error", text: json.error ?? "Sync failed." });
        return;
      }

      setMessage({
        type: "success",
        text: `Synced ${json.rowsTickets} ticket rows and ${json.rowsExpenses} expense rows in ${json.durationMs}ms.`,
      });
      setDiag({
        financialSummaryFound: json.financialSummaryFound ?? false,
        payoutEntriesCount: json.payoutEntriesCount ?? 0,
        financialSummary: json.financialSummary ?? null,
        payoutEntries: json.payoutEntries ?? [],
      });
      onSyncSuccess();
    } catch {
      setMessage({ type: "error", text: "Network error. Check your connection." });
    } finally {
      // Refresh log list
      const r = await fetch("/api/sync");
      if (r.ok) setLogs(await r.json());
      setSyncing(false);
    }
  }

  const last = logs[0];

  return (
    <div className="space-y-6">
      {/* Source info */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-lg font-semibold text-white mb-1">Google Sheets Sync</h2>
            <p className="text-sm text-gray-400">
              Connected to{" "}
              <span className="font-medium text-indigo-400">TICKETS_SHEET_ENTRADAS</span>
            </p>
            <p className="text-xs text-gray-600 mt-0.5">
              Reads <span className="text-gray-500">Ticket Data</span> and{" "}
              <span className="text-gray-500">Expenses</span> tabs as source of truth
            </p>
          </div>

          <button
            onClick={triggerSync}
            disabled={syncing}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800 disabled:cursor-not-allowed text-white font-semibold text-sm px-5 py-2.5 rounded-xl transition-colors"
          >
            <svg
              className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {syncing ? "Syncing…" : "Sync Now"}
          </button>
        </div>

        {/* Last sync summary */}
        {last && (
          <div className="mt-5 pt-5 border-t border-gray-800 grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-xs text-gray-500 mb-0.5">Last sync</p>
              <p className="text-gray-300">{new Date(last.startedAt).toLocaleString()}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-0.5">Status</p>
              <StatusBadge status={last.status} />
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-0.5">Rows synced</p>
              <p className="text-gray-300">{last.rowsTickets} tickets · {last.rowsExpenses} expenses</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-0.5">Duration</p>
              <p className="text-gray-300">{duration(last.startedAt, last.completedAt)}</p>
            </div>
          </div>
        )}

        {/* Status message */}
        {message && (
          <div className={`mt-4 rounded-lg px-4 py-3 text-sm ${
            message.type === "success"
              ? "bg-emerald-500/10 border border-emerald-500/30 text-emerald-400"
              : "bg-red-500/10 border border-red-500/30 text-red-400"
          }`}>
            {message.text}
          </div>
        )}

        {/* Sync diagnostics */}
        {diag && (
          <div className="mt-4 rounded-lg border border-gray-700 bg-gray-800/50 px-4 py-3 text-xs space-y-2">
            <p className="text-gray-400 font-semibold uppercase tracking-wider text-[10px]">Sync Diagnostics</p>
            <div className="flex gap-4 flex-wrap">
              <span className={diag.financialSummaryFound ? "text-emerald-400" : "text-red-400"}>
                Financial Summary: {diag.financialSummaryFound ? "Found" : "NOT FOUND"}
              </span>
              <span className={diag.payoutEntriesCount > 0 ? "text-emerald-400" : "text-red-400"}>
                Payout entries: {diag.payoutEntriesCount}
              </span>
            </div>
            {diag.financialSummary && (
              <div className="text-gray-400">
                <p className="font-medium text-gray-300 mb-1">KPIs from Financial Summary:</p>
                {Object.entries(diag.financialSummary).map(([k, v]) => (
                  <p key={k} className="ml-2">{k}: <span className="text-white font-mono">{typeof v === "number" ? v.toFixed(2) : v}</span></p>
                ))}
              </div>
            )}
            {diag.payoutEntries.length > 0 && (
              <div className="text-gray-400">
                <p className="font-medium text-gray-300 mb-1">Payout entries:</p>
                {diag.payoutEntries.map((e, i) => (
                  <p key={i} className="ml-2">{e.platform}: <span className="text-white font-mono">{e.amount.toFixed(2)}</span></p>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Sync history */}
      {logs.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-800">
            <h3 className="text-sm font-semibold text-white">Sync History</h3>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="text-left px-5 py-2.5 text-xs text-gray-500 font-medium">Started</th>
                <th className="text-left px-5 py-2.5 text-xs text-gray-500 font-medium">Status</th>
                <th className="text-right px-5 py-2.5 text-xs text-gray-500 font-medium">Tickets</th>
                <th className="text-right px-5 py-2.5 text-xs text-gray-500 font-medium">Expenses</th>
                <th className="text-right px-5 py-2.5 text-xs text-gray-500 font-medium">Duration</th>
                <th className="text-right px-5 py-2.5 text-xs text-gray-500 font-medium">By</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} className="border-b border-gray-800/50 last:border-0 hover:bg-gray-800/30 transition-colors">
                  <td className="px-5 py-3 text-gray-300 whitespace-nowrap">
                    {new Date(log.startedAt).toLocaleString()}
                  </td>
                  <td className="px-5 py-3">
                    <StatusBadge status={log.status} />
                    {log.error && (
                      <p className="text-xs text-red-400 mt-1 max-w-xs truncate" title={log.error}>
                        {log.error}
                      </p>
                    )}
                  </td>
                  <td className="px-5 py-3 text-right text-gray-400">{log.rowsTickets}</td>
                  <td className="px-5 py-3 text-right text-gray-400">{log.rowsExpenses}</td>
                  <td className="px-5 py-3 text-right text-gray-400">
                    {duration(log.startedAt, log.completedAt)}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      log.triggeredBy === "cron"
                        ? "bg-purple-500/15 text-purple-400"
                        : "bg-blue-500/15 text-blue-400"
                    }`}>
                      {log.triggeredBy}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {logs.length === 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-10 text-center text-gray-600 text-sm">
          No syncs yet. Click <span className="text-gray-400">Sync Now</span> to pull the latest data from Google Sheets.
        </div>
      )}

      {/* Auto-sync note */}
      <div className="bg-indigo-950/30 border border-indigo-800/40 rounded-xl px-5 py-4 text-sm text-indigo-300">
        <p className="font-medium text-indigo-200 mb-1">Automatic sync</p>
        <p className="text-indigo-400 text-xs leading-relaxed">
          When deployed to Vercel, the sheet auto-syncs every 6 hours via a cron job
          (<code className="bg-indigo-900/50 px-1 rounded">GET /api/sync/schedule</code>).
          You can change the schedule in <code className="bg-indigo-900/50 px-1 rounded">vercel.json</code>.
        </p>
      </div>
    </div>
  );
}
