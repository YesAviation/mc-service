import { useState } from "react";
import type { FormEvent } from "react";
import { ingestionApi } from "@music/shared";
import type { IngestScanSummary } from "@music/shared";
import {
  AlertCircle,
  CheckCircle2,
  FolderSearch,
  Loader2,
  Play,
  XCircle,
} from "lucide-react";

export default function ScanPage() {
  const [scanPath, setScanPath] = useState("/library");
  const [recursive, setRecursive] = useState(true);
  const [forceReimport, setForceReimport] = useState(false);

  const [isScanning, setIsScanning] = useState(false);
  const [scanError, setScanError] = useState("");
  const [scanId, setScanId] = useState<string | null>(null);
  const [filesFound, setFilesFound] = useState<number>(0);

  const [isIngesting, setIsIngesting] = useState(false);
  const [ingestError, setIngestError] = useState("");
  const [summary, setSummary] = useState<IngestScanSummary | null>(null);

  async function handleScan(e: FormEvent) {
    e.preventDefault();
    if (!scanPath.trim()) return;

    setIsScanning(true);
    setScanError("");
    setScanId(null);
    setFilesFound(0);
    setSummary(null);
    setIngestError("");

    try {
      const result = await ingestionApi.scan({
        path: scanPath.trim(),
        recursive,
      });
      setScanId(result.scan_id);
      setFilesFound(result.files_found);
    } catch {
      setScanError(
        "Scan failed. Use a server path like /library (Docker), then try again.",
      );
    } finally {
      setIsScanning(false);
    }
  }

  async function handleIngestAll() {
    if (!scanId) return;
    setIsIngesting(true);
    setIngestError("");
    setSummary(null);
    try {
      const result = await ingestionApi.ingestScan(scanId, {
        force_reimport: forceReimport,
      });
      setSummary(result);
      // Scan ID is consumed server-side after a successful bulk ingest;
      // reflect that so the user must re-scan to ingest again.
      setScanId(null);
    } catch {
      setIngestError(
        "Bulk ingest failed. The scan may have expired (server restarted) — re-scan and try again.",
      );
    } finally {
      setIsIngesting(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="page-header py-6 md:py-8">
        <h1 className="text-[1.85rem] md:text-[2rem] font-semibold tracking-tight text-text-primary">
          Scan & Import
        </h1>
        <p className="text-sm md:text-[0.95rem] text-text-secondary mt-1.5 max-w-2xl">
          Scan a directory on the server for audio files, then bulk-import them
          into the catalog.
        </p>
      </section>

      <form onSubmit={handleScan} className="surface-panel p-5">
        <div className="mb-4">
          <label
            htmlFor="scan-path"
            className="block text-sm font-medium text-text-secondary mb-1.5"
          >
            Directory Path (server filesystem)
          </label>
          <input
            id="scan-path"
            type="text"
            value={scanPath}
            onChange={(e) => setScanPath(e.target.value)}
            placeholder="/library or /library/<subfolder>"
            required
            className="w-full px-3 py-2 bg-bg-primary border border-border-default rounded-lg text-text-primary text-sm placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent font-mono"
          />
          <p className="mt-1.5 text-xs text-text-muted">
            Docker setup: use <span className="font-mono">/library</span>. Host
            paths like <span className="font-mono">C:\Users\…</span> are not
            directly accessible inside the container.
          </p>
        </div>

        <div className="flex items-center justify-between flex-wrap gap-3">
          <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer">
            <input
              type="checkbox"
              checked={recursive}
              onChange={(e) => setRecursive(e.target.checked)}
              className="w-4 h-4 rounded border-border-default accent-accent"
            />
            Scan subdirectories recursively
          </label>

          <button
            type="submit"
            disabled={isScanning || !scanPath.trim()}
            className="flex items-center gap-2 px-5 py-2 bg-accent hover:bg-accent-hover disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {isScanning ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <FolderSearch className="w-4 h-4" />
            )}
            {isScanning ? "Scanning..." : "Scan Directory"}
          </button>
        </div>

        {scanError && (
          <div className="flex items-center gap-2 mt-4 text-sm text-danger bg-danger/10 border border-danger/20 rounded-lg px-3 py-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {scanError}
          </div>
        )}
      </form>

      {scanId && (
        <div className="surface-panel p-5">
          <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
            <div>
              <h2 className="text-lg font-semibold text-text-primary">
                Scan complete
              </h2>
              <p className="text-sm text-text-secondary mt-0.5">
                Found {filesFound} file{filesFound !== 1 ? "s" : ""} &middot;
                Scan ID:{" "}
                <span className="font-mono text-xs">{scanId}</span>
              </p>
            </div>

            <button
              onClick={handleIngestAll}
              disabled={isIngesting || filesFound === 0}
              className="flex items-center gap-2 px-5 py-2 bg-success hover:bg-success/90 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
            >
              {isIngesting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Play className="w-4 h-4" />
              )}
              {isIngesting ? "Ingesting…" : `Ingest All (${filesFound})`}
            </button>
          </div>

          <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer">
            <input
              type="checkbox"
              checked={forceReimport}
              onChange={(e) => setForceReimport(e.target.checked)}
              className="w-4 h-4 rounded border-border-default accent-accent"
            />
            Force re-import (bypass duplicate detection — only use after
            wiping the catalog)
          </label>

          {isIngesting && (
            <p className="text-xs text-text-muted mt-3">
              Bulk ingest is a single server-side job. Large libraries can take
              several minutes — keep this tab open until it returns.
            </p>
          )}
        </div>
      )}

      {ingestError && (
        <div className="surface-panel p-4 flex items-center gap-2 text-sm text-danger">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {ingestError}
        </div>
      )}

      {summary && (
        <div className="surface-panel p-5 space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">
              Bulk ingest finished
            </h2>
            <p className="text-xs text-text-muted mt-0.5 font-mono">
              Scan ID: {summary.scan_id}
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <SummaryCard
              label="Total files"
              value={summary.total}
              tone="neutral"
            />
            <SummaryCard
              label="Imported"
              value={summary.imported}
              tone="success"
            />
            <SummaryCard
              label="Duplicates"
              value={summary.duplicates}
              tone="info"
            />
            <SummaryCard
              label="Failed"
              value={summary.failed}
              tone={summary.failed > 0 ? "danger" : "neutral"}
            />
          </div>

          {summary.failed > 0 && summary.errors.length > 0 && (
            <div>
              <p className="text-sm font-medium text-text-primary mb-2 flex items-center gap-2">
                <XCircle size={14} className="text-danger" />
                First {summary.errors.length} of {summary.failed} failures
              </p>
              <div className="border border-border-subtle rounded-lg overflow-hidden max-h-64 overflow-y-auto">
                {summary.errors.map((err, i) => (
                  <div
                    key={`${err.file_path}-${i}`}
                    className="px-4 py-2 text-xs border-b border-border-subtle last:border-b-0"
                  >
                    <p className="text-text-primary font-mono truncate">
                      {err.file_path}
                    </p>
                    <p className="text-danger mt-0.5">{err.error}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {summary.failed === 0 && (
            <div className="flex items-center gap-2 text-sm text-success">
              <CheckCircle2 size={14} />
              Every file in the scan was processed without errors.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "neutral" | "success" | "info" | "danger";
}) {
  const toneClasses: Record<typeof tone, string> = {
    neutral: "bg-white/5 text-text-primary",
    success: "bg-success/10 text-success",
    info: "bg-accent-muted text-accent-soft",
    danger: "bg-danger/10 text-danger",
  };
  return (
    <div className={`rounded-lg px-4 py-3 ${toneClasses[tone]}`}>
      <p className="text-[11px] uppercase tracking-[0.12em] opacity-80">
        {label}
      </p>
      <p className="text-2xl font-semibold mt-1">{value}</p>
    </div>
  );
}
