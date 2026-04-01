"use client";

import { useState, useEffect, useCallback } from "react";

interface ExcelRun {
  id: string;
  createdAt: string;
  filename: string;
  sheetName: string;
  status: string;
  totalRows: number;
  importedRows: number;
  skippedRows: number;
  failedRows: number;
  error: string | null;
}

interface EmailLog {
  id: string;
  startedAt: string;
  completedAt: string | null;
  status: string;
  emailsScanned: number;
  purchasesAdded: number;
  error: string | null;
  emailAccount: { label: string; email: string } | null;
}

interface ApiResponse {
  excelRuns: ExcelRun[];
  emailLogs: EmailLog[];
  excelTotal: number;
  emailTotal: number;
}

const STATUS_COLORS: Record<string, string> = {
  COMPLETED: "bg-green-500/20 text-green-400",
  RUNNING:   "bg-blue-500/20 text-blue-400",
  FAILED:    "bg-red-500/20 text-red-400",
};

function fmtDateTime(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

type TabType = "all" | "excel" | "email";

export default function LogsPage() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabType>("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/purchases/import-runs?type=${tab}&limit=50`);
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Import Logs</h1>
          <p className="text-gray-400 text-sm mt-0.5">History of Excel imports and email sync runs</p>
        </div>
        <button
          onClick={load}
          className="px-3 py-1.5 text-sm text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
        >
          Refresh
        </button>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 mb-5 bg-gray-900 rounded-lg p-1 w-fit border border-gray-800">
        {(["all", "excel", "email"] as TabType[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
              tab === t ? "bg-indigo-600 text-white" : "text-gray-400 hover:text-white"
            }`}
          >
            {t === "all" ? "All" : t === "excel" ? "Excel" : "Email"}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-500 text-sm">Loading…</div>
      ) : !data ? (
        <div className="text-center py-12 text-gray-600 text-sm">Failed to load logs</div>
      ) : (
        <div className="space-y-6">
          {/* Excel import runs */}
          {tab !== "email" && (
            <section>
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                Excel Imports ({data.excelTotal})
              </h2>
              {data.excelRuns.length === 0 ? (
                <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 text-center text-gray-600 text-sm">
                  No Excel imports yet
                </div>
              ) : (
                <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-800 bg-gray-800/40">
                        <th className="text-left px-4 py-3 text-gray-500 font-medium">File</th>
                        <th className="text-left px-4 py-3 text-gray-500 font-medium">Date</th>
                        <th className="text-center px-3 py-3 text-gray-500 font-medium">Total</th>
                        <th className="text-center px-3 py-3 text-gray-500 font-medium">Imported</th>
                        <th className="text-center px-3 py-3 text-gray-500 font-medium">Skipped</th>
                        <th className="text-center px-3 py-3 text-gray-500 font-medium">Failed</th>
                        <th className="text-left px-4 py-3 text-gray-500 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.excelRuns.map((run) => (
                        <tr key={run.id} className="border-b border-gray-800/50">
                          <td className="px-4 py-3">
                            <p className="text-white font-medium truncate max-w-[200px]">{run.filename}</p>
                            <p className="text-gray-600 text-xs">{run.sheetName}</p>
                          </td>
                          <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">
                            {fmtDateTime(run.createdAt)}
                          </td>
                          <td className="px-3 py-3 text-center text-gray-300">{run.totalRows}</td>
                          <td className="px-3 py-3 text-center text-green-400 font-medium">{run.importedRows}</td>
                          <td className="px-3 py-3 text-center text-yellow-400">{run.skippedRows}</td>
                          <td className="px-3 py-3 text-center text-red-400">{run.failedRows}</td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[run.status] ?? ""}`}>
                              {run.status}
                            </span>
                            {run.error && (
                              <p className="text-xs text-red-400 mt-1 max-w-[200px] truncate">{run.error}</p>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}

          {/* Email fetch logs */}
          {tab !== "excel" && (
            <section>
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                Email Sync Runs ({data.emailTotal})
              </h2>
              {data.emailLogs.length === 0 ? (
                <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 text-center text-gray-600 text-sm">
                  No email sync runs yet
                </div>
              ) : (
                <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-800 bg-gray-800/40">
                        <th className="text-left px-4 py-3 text-gray-500 font-medium">Account</th>
                        <th className="text-left px-4 py-3 text-gray-500 font-medium">Started</th>
                        <th className="text-center px-3 py-3 text-gray-500 font-medium">Scanned</th>
                        <th className="text-center px-3 py-3 text-gray-500 font-medium">Added</th>
                        <th className="text-left px-4 py-3 text-gray-500 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.emailLogs.map((log) => (
                        <tr key={log.id} className="border-b border-gray-800/50">
                          <td className="px-4 py-3">
                            <p className="text-white font-medium text-xs">{log.emailAccount?.label ?? "—"}</p>
                            <p className="text-gray-600 text-xs">{log.emailAccount?.email ?? ""}</p>
                          </td>
                          <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">
                            {fmtDateTime(log.startedAt)}
                          </td>
                          <td className="px-3 py-3 text-center text-gray-300">{log.emailsScanned}</td>
                          <td className="px-3 py-3 text-center text-green-400 font-medium">{log.purchasesAdded}</td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[log.status] ?? ""}`}>
                              {log.status}
                            </span>
                            {log.error && (
                              <p className="text-xs text-red-400 mt-1 max-w-[220px] truncate" title={log.error}>{log.error}</p>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}
        </div>
      )}
    </div>
  );
}
