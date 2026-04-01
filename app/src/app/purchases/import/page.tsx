"use client";

import { useState, useRef } from "react";

interface PreviewRow {
  rowIndex: number;
  eventName: string;
  eventDate: string | null;
  venue: string | null;
  section: string | null;
  row: string | null;
  seatFrom: string | null;
  seatTo: string | null;
  ticketType: string | null;
  quantity: number;
  totalCost: number;
  costPerTicket: number | null;
  account: string | null;
  fingerprint: string;
  parseWarnings: string[];
}

interface DryRunResult {
  dryRun: true;
  totalRows: number;
  validRows: number;
  skippedRows: { rowIndex: number; reason: string }[];
  preview: PreviewRow[];
}

interface CommitResult {
  dryRun: false;
  importRunId: string;
  totalRows: number;
  importedRows: number;
  skippedRows: number;
  failedRows: number;
  skippedDetails: { rowIndex: number; reason: string; fingerprint?: string }[];
  failedDetails: { rowIndex: number; error: string }[];
  status: string;
}

function fmt(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtGBP(n: number) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(n);
}

type Step = "upload" | "preview" | "done";

export default function ImportPage() {
  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dryResult, setDryResult] = useState<DryRunResult | null>(null);
  const [commitResult, setCommitResult] = useState<CommitResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleDryRun() {
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("dryRun", "true");
      const res = await fetch("/api/purchases/excel-import", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Upload failed"); return; }
      setDryResult(data as DryRunResult);
      setStep("preview");
    } catch {
      setError("Network error — please try again");
    } finally {
      setLoading(false);
    }
  }

  async function handleCommit() {
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("dryRun", "false");
      const res = await fetch("/api/purchases/excel-import", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Import failed"); return; }
      setCommitResult(data as CommitResult);
      setStep("done");
    } catch {
      setError("Network error — please try again");
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setStep("upload");
    setFile(null);
    setDryResult(null);
    setCommitResult(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return (
    <div className="max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Import from Excel</h1>
        <p className="text-gray-400 text-sm mt-0.5">
          Upload a .xlsx workbook containing a <strong className="text-gray-300">Ticket Data</strong> sheet.
        </p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-6 text-sm">
        {(["upload", "preview", "done"] as Step[]).map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            {i > 0 && <span className="text-gray-700">›</span>}
            <span className={step === s ? "text-indigo-400 font-medium" : "text-gray-600"}>
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </span>
          </div>
        ))}
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-900/30 border border-red-700/50 rounded-lg text-sm text-red-300">
          {error}
        </div>
      )}

      {/* Step 1 — Upload */}
      {step === "upload" && (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
          <div
            className="border-2 border-dashed border-gray-700 rounded-lg p-10 text-center cursor-pointer hover:border-indigo-500 transition-colors"
            onClick={() => fileInputRef.current?.click()}
          >
            <svg className="w-10 h-10 text-gray-600 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            {file ? (
              <p className="text-indigo-300 font-medium">{file.name}</p>
            ) : (
              <>
                <p className="text-gray-400 font-medium">Click to select a .xlsx file</p>
                <p className="text-gray-600 text-xs mt-1">Must contain a &quot;Ticket Data&quot; sheet</p>
              </>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />

          <div className="mt-4">
            <p className="text-xs text-gray-500 mb-2">Expected columns in the Ticket Data sheet:</p>
            <p className="text-xs text-gray-600 font-mono">
              Event · Venue · Date · Purchased At · Account · Section · Row · Seat From · Seat To · Ticket Type · Qty Bought · Total Cost · Cost Per Ticket
            </p>
          </div>

          <button
            onClick={handleDryRun}
            disabled={!file || loading}
            className="mt-4 px-5 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? "Analysing…" : "Preview Import"}
          </button>
        </div>
      )}

      {/* Step 2 — Preview */}
      {step === "preview" && dryResult && (
        <div className="space-y-4">
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-2xl font-bold text-white">{dryResult.totalRows}</p>
                <p className="text-xs text-gray-500 mt-0.5">Total rows</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-green-400">{dryResult.validRows}</p>
                <p className="text-xs text-gray-500 mt-0.5">Will import</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-yellow-400">{dryResult.skippedRows.length}</p>
                <p className="text-xs text-gray-500 mt-0.5">Skipped</p>
              </div>
            </div>
          </div>

          {dryResult.skippedRows.length > 0 && (
            <div className="bg-yellow-900/20 border border-yellow-700/30 rounded-xl p-4">
              <p className="text-xs font-semibold text-yellow-400 mb-2">Skipped rows</p>
              <div className="space-y-1">
                {dryResult.skippedRows.map((r) => (
                  <p key={r.rowIndex} className="text-xs text-yellow-300">
                    Row {r.rowIndex}: {r.reason}
                  </p>
                ))}
              </div>
            </div>
          )}

          {/* Preview table */}
          {dryResult.preview.length > 0 && (
            <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-800">
                <p className="text-sm font-medium text-white">
                  Preview{dryResult.preview.length < dryResult.validRows ? ` (first ${dryResult.preview.length} of ${dryResult.validRows})` : ""}
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-800 bg-gray-800/40">
                      <th className="text-left px-3 py-2 text-gray-500 font-medium">Row</th>
                      <th className="text-left px-3 py-2 text-gray-500 font-medium">Event</th>
                      <th className="text-left px-3 py-2 text-gray-500 font-medium">Date</th>
                      <th className="text-left px-3 py-2 text-gray-500 font-medium">Venue</th>
                      <th className="text-right px-3 py-2 text-gray-500 font-medium">Qty</th>
                      <th className="text-right px-3 py-2 text-gray-500 font-medium">Total</th>
                      <th className="text-left px-3 py-2 text-gray-500 font-medium">Warnings</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dryResult.preview.map((r) => (
                      <tr key={r.rowIndex} className="border-b border-gray-800/40">
                        <td className="px-3 py-2 text-gray-600">{r.rowIndex}</td>
                        <td className="px-3 py-2 text-white font-medium max-w-[200px] truncate">{r.eventName}</td>
                        <td className="px-3 py-2 text-gray-400 whitespace-nowrap">{fmt(r.eventDate)}</td>
                        <td className="px-3 py-2 text-gray-400 max-w-[140px] truncate">{r.venue ?? "—"}</td>
                        <td className="px-3 py-2 text-right text-gray-300">{r.quantity}</td>
                        <td className="px-3 py-2 text-right text-white tabular-nums">{fmtGBP(r.totalCost)}</td>
                        <td className="px-3 py-2 text-yellow-500">
                          {r.parseWarnings.length > 0 ? r.parseWarnings.join(", ") : ""}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={handleCommit}
              disabled={loading || dryResult.validRows === 0}
              className="px-5 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? "Importing…" : `Import ${dryResult.validRows} rows`}
            </button>
            <button
              onClick={reset}
              className="px-4 py-2 text-sm font-medium text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Step 3 — Done */}
      {step === "done" && commitResult && (
        <div className="space-y-4">
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center mx-auto mb-3 ${commitResult.status === "COMPLETED" ? "bg-green-500/20" : "bg-red-500/20"}`}>
              {commitResult.status === "COMPLETED" ? (
                <svg className="w-5 h-5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              )}
            </div>
            <p className="text-center font-bold text-white text-lg">
              {commitResult.status === "COMPLETED" ? "Import complete" : "Import failed"}
            </p>
            <div className="grid grid-cols-4 gap-4 text-center mt-5">
              <div>
                <p className="text-xl font-bold text-white">{commitResult.totalRows}</p>
                <p className="text-xs text-gray-500">Total rows</p>
              </div>
              <div>
                <p className="text-xl font-bold text-green-400">{commitResult.importedRows}</p>
                <p className="text-xs text-gray-500">Imported</p>
              </div>
              <div>
                <p className="text-xl font-bold text-yellow-400">{commitResult.skippedRows}</p>
                <p className="text-xs text-gray-500">Skipped</p>
              </div>
              <div>
                <p className="text-xl font-bold text-red-400">{commitResult.failedRows}</p>
                <p className="text-xs text-gray-500">Failed</p>
              </div>
            </div>
          </div>

          {commitResult.failedDetails.length > 0 && (
            <div className="bg-red-900/20 border border-red-700/30 rounded-xl p-4">
              <p className="text-xs font-semibold text-red-400 mb-2">Failed rows</p>
              {commitResult.failedDetails.map((r) => (
                <p key={r.rowIndex} className="text-xs text-red-300">Row {r.rowIndex}: {r.error}</p>
              ))}
            </div>
          )}

          <div className="flex gap-3">
            <a href="/purchases" className="px-5 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 transition-colors">
              View Purchases
            </a>
            <button onClick={reset} className="px-4 py-2 text-sm font-medium text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors">
              Import Another
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
