"use client";

import { useState, useRef, DragEvent } from "react";

interface Batch {
  id: string;
  filename: string;
  uploadedAt: string;
  rowsTickets: number;
  rowsExpenses: number;
  status: string;
}

interface ImportPanelProps {
  batches: Batch[];
  onImportSuccess: () => void;
}

export function ImportPanel({ batches: initialBatches, onImportSuccess }: ImportPanelProps) {
  const [batches, setBatches] = useState<Batch[]>(initialBatches);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function uploadFile(file: File) {
    if (!file.name.match(/\.(xlsx|xls)$/i)) {
      setMessage({ type: "error", text: "Please upload an .xlsx or .xls file." });
      return;
    }

    setUploading(true);
    setMessage(null);

    const form = new FormData();
    form.append("file", file);

    try {
      const res = await fetch("/api/import", { method: "POST", body: form });
      const json = await res.json();

      if (!res.ok) {
        setMessage({ type: "error", text: json.error ?? "Upload failed." });
        return;
      }

      setMessage({
        type: "success",
        text: `Imported ${json.rowsTickets} ticket rows and ${json.rowsExpenses} expense rows.`,
      });

      // Refresh batch list
      const bRes = await fetch("/api/import/batches");
      if (bRes.ok) setBatches(await bRes.json());

      onImportSuccess();
    } catch {
      setMessage({ type: "error", text: "Network error during upload." });
    } finally {
      setUploading(false);
    }
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
    e.target.value = "";
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) uploadFile(file);
  }

  async function deleteBatch(batchId: string) {
    if (!confirm("Delete this import batch and all its data?")) return;
    await fetch(`/api/import?batchId=${batchId}`, { method: "DELETE" });
    setBatches((prev) => prev.filter((b) => b.id !== batchId));
    onImportSuccess();
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-6">
      <h2 className="text-lg font-semibold text-white">Import Excel Workbook</h2>

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileRef.current?.click()}
        className={`
          border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors
          ${dragging
            ? "border-indigo-500 bg-indigo-500/10"
            : "border-gray-700 hover:border-indigo-600 hover:bg-gray-800/50"
          }
        `}
      >
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={handleFileInput}
        />
        <svg
          className="mx-auto h-10 w-10 text-gray-500 mb-3"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
          />
        </svg>
        <p className="text-sm text-gray-400">
          {uploading ? "Uploading…" : "Drop your .xlsx file here, or click to browse"}
        </p>
        <p className="text-xs text-gray-600 mt-1">
          Requires "Ticket Data" and "Expenses" sheets
        </p>
      </div>

      {/* Status message */}
      {message && (
        <div
          className={`rounded-lg px-4 py-3 text-sm ${
            message.type === "success"
              ? "bg-emerald-500/10 border border-emerald-500/30 text-emerald-400"
              : "bg-red-500/10 border border-red-500/30 text-red-400"
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Past imports */}
      {batches.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-gray-400 mb-3">Import History</h3>
          <div className="space-y-2">
            {batches.map((b) => (
              <div
                key={b.id}
                className="flex items-center justify-between bg-gray-800/60 rounded-lg px-4 py-3"
              >
                <div>
                  <p className="text-sm text-white font-medium">{b.filename}</p>
                  <p className="text-xs text-gray-500">
                    {new Date(b.uploadedAt).toLocaleString()} &middot;{" "}
                    {b.rowsTickets} tickets, {b.rowsExpenses} expenses &middot;{" "}
                    <span
                      className={
                        b.status === "COMPLETED"
                          ? "text-emerald-500"
                          : b.status === "FAILED"
                          ? "text-red-500"
                          : "text-yellow-500"
                      }
                    >
                      {b.status}
                    </span>
                  </p>
                </div>
                <button
                  onClick={() => deleteBatch(b.id)}
                  className="text-gray-600 hover:text-red-400 transition-colors ml-4"
                  title="Delete batch"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
