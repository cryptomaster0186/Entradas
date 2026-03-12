"use client";

import { useState, useCallback } from "react";
import { signOut } from "next-auth/react";
import type { DashboardData } from "@/lib/dashboard";
import { KPICard } from "@/components/dashboard/KPICard";
import { ImportPanel } from "@/components/dashboard/ImportPanel";
import { SyncPanel } from "@/components/dashboard/SyncPanel";
import { PlatformChart } from "@/components/dashboard/PlatformChart";
import { StatusPie } from "@/components/dashboard/StatusPie";
import { EventTable } from "@/components/dashboard/EventTable";
import { AccountTable } from "@/components/dashboard/AccountTable";

interface Batch {
  id: string;
  filename: string;
  uploadedAt: string;
  rowsTickets: number;
  rowsExpenses: number;
  status: string;
}

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

interface Props {
  initialData: DashboardData;
  initialBatches: Batch[];
  initialSyncLogs: SyncLog[];
  userEmail: string;
}

function usd(n: number) {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

type Tab = "dashboard" | "sync" | "import";

const TAB_LABELS: Record<Tab, string> = {
  dashboard: "Dashboard",
  sync: "Sync",
  import: "Manual Import",
};

export function DashboardClient({ initialData, initialBatches, initialSyncLogs, userEmail }: Props) {
  const [data, setData] = useState<DashboardData>(initialData);
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");
  const [refreshing, setRefreshing] = useState(false);

  const refreshData = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/dashboard");
      if (res.ok) setData(await res.json());
    } finally {
      setRefreshing(false);
    }
  }, []);

  const { kpis } = data;
  const lastSync = initialSyncLogs[0] ?? null;

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

          {/* Tabs */}
          <nav className="flex gap-1">
            {(["dashboard", "sync", "import"] as Tab[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === tab
                    ? "bg-indigo-600 text-white"
                    : "text-gray-400 hover:text-white hover:bg-gray-800"
                }`}
              >
                {TAB_LABELS[tab]}
              </button>
            ))}
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
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 space-y-8">

        {/* ── Sync tab ── */}
        {activeTab === "sync" && (
          <SyncPanel logs={initialSyncLogs} onSyncSuccess={refreshData} />
        )}

        {/* ── Manual import tab ── */}
        {activeTab === "import" && (
          <div className="space-y-4">
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl px-5 py-3 text-sm text-yellow-300">
              <span className="font-semibold">Note:</span> The primary data source is now Google Sheets.
              Manual uploads are kept for one-off corrections and are stored separately from synced data.
            </div>
            <ImportPanel batches={initialBatches} onImportSuccess={refreshData} />
          </div>
        )}

        {/* ── Dashboard tab ── */}
        {activeTab === "dashboard" && (
          <>
            {/* Header row */}
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-xl font-bold text-white">Financial Summary</h1>
                {lastSync?.status === "COMPLETED" && (
                  <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                    Synced from Google Sheets &middot;{" "}
                    {new Date(lastSync.startedAt).toLocaleString()}
                  </p>
                )}
                {!lastSync && (
                  <p className="text-xs text-yellow-500 mt-0.5">
                    No sync yet — go to the Sync tab to pull data from Google Sheets.
                  </p>
                )}
              </div>
              <button
                onClick={refreshData}
                disabled={refreshing}
                className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-gray-300 text-sm px-3 py-1.5 rounded-lg transition-colors"
              >
                <svg
                  className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Refresh
              </button>
            </div>

            {/* KPI Grid */}
            <section>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                <KPICard title="Total Spend"     value={usd(kpis.totalSpend)}     subtitle="Purchase costs"      color="orange" />
                <KPICard title="Revenue"          value={usd(kpis.revenue)}         subtitle="Ticket income"       color="blue" />
                <KPICard title="Profit on Sales"  value={usd(kpis.profitOnSales)}   subtitle="Revenue − spend"     color={kpis.profitOnSales >= 0 ? "green" : "red"} />
                <KPICard title="Extra Expenses"   value={usd(kpis.extraExpenses)}   subtitle="Non-ticket costs"    color="purple" />
                <KPICard title="Total Expenses"   value={usd(kpis.totalExpenses)}   subtitle="Spend + extras"      color="default" />
                <KPICard title="Net Income"       value={usd(kpis.netIncome)}       subtitle="Revenue − all exp."  color={kpis.netIncome >= 0 ? "green" : "red"} />
              </div>
            </section>

            {/* Charts row */}
            <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
                <h2 className="text-sm font-semibold text-white mb-4">Revenue by Platform</h2>
                <PlatformChart data={data.platformBreakdown} />
                {data.platformBreakdown.length > 0 && (
                  <table className="w-full text-xs mt-4">
                    <thead>
                      <tr className="border-b border-gray-800">
                        <th className="text-left py-2 text-gray-500 font-medium">Platform</th>
                        <th className="text-right py-2 text-gray-500 font-medium">Tickets</th>
                        <th className="text-right py-2 text-gray-500 font-medium">Revenue</th>
                        <th className="text-right py-2 text-gray-500 font-medium">Profit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.platformBreakdown.map((p, i) => (
                        <tr key={i} className="border-b border-gray-800/40 last:border-0">
                          <td className="py-2 text-gray-300">{p.platform}</td>
                          <td className="py-2 text-right text-gray-400">{p.count}</td>
                          <td className="py-2 text-right text-gray-300">${p.revenue.toLocaleString()}</td>
                          <td className={`py-2 text-right font-semibold ${p.profit >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                            ${p.profit.toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
                <h2 className="text-sm font-semibold text-white mb-4">Sales Status Breakdown</h2>
                <StatusPie data={data.statusSummary} />
                {data.statusSummary.length > 0 && (
                  <table className="w-full text-xs mt-4">
                    <thead>
                      <tr className="border-b border-gray-800">
                        <th className="text-left py-2 text-gray-500 font-medium">Status</th>
                        <th className="text-right py-2 text-gray-500 font-medium">Count</th>
                        <th className="text-right py-2 text-gray-500 font-medium">Revenue</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.statusSummary.map((s, i) => (
                        <tr key={i} className="border-b border-gray-800/40 last:border-0">
                          <td className="py-2 text-gray-300 capitalize">{s.status}</td>
                          <td className="py-2 text-right text-gray-400">{s.count}</td>
                          <td className="py-2 text-right text-gray-300">${s.revenue.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </section>

            {/* Best / Worst events */}
            <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <EventTable events={data.bestEvents} title="Best Events (by profit)" highlight="green" />
              <EventTable events={data.worstEvents} title="Worst Events (by profit)" highlight="red" />
            </section>

            {/* Account performance */}
            {data.accountPerformance.length > 0 && (
              <section className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-800">
                  <h2 className="font-semibold text-white text-sm">Account Performance</h2>
                </div>
                <AccountTable data={data.accountPerformance} />
              </section>
            )}

            {/* Empty state */}
            {kpis.revenue === 0 && kpis.totalSpend === 0 && (
              <div className="text-center py-20 text-gray-600">
                <svg className="mx-auto w-12 h-12 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <p className="text-sm">No data yet.</p>
                <button
                  onClick={() => setActiveTab("sync")}
                  className="mt-3 text-indigo-400 hover:text-indigo-300 text-sm underline underline-offset-2"
                >
                  Go to Sync to pull from Google Sheets →
                </button>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
