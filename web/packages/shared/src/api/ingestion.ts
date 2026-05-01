import { api } from "./client";
import type { ScanRequest, ScanResponse, IngestRequest, IngestResponse } from "../types";

type BackendScanRequest = {
  directory_path: string;
  recursive: boolean;
};

type BackendScanResponse = {
  scan_id: string;
  status: string;
  files_found: number;
};

type BackendIngestResponse = {
  track_id: string;
  status: string;
  is_duplicate: boolean;
  metadata?: {
    title: string;
    artist: string;
    album: string;
    duration_secs: number;
  };
};

export type IngestScanError = {
  file_path: string;
  error: string;
};

export type IngestScanSummary = {
  scan_id: string;
  total: number;
  imported: number;
  duplicates: number;
  failed: number;
  errors: IngestScanError[];
};

export const ingestionApi = {
  scan: async (data: ScanRequest): Promise<ScanResponse> => {
    const payload: BackendScanRequest = {
      directory_path: data.path,
      recursive: data.recursive ?? true,
    };

    const response = await api.post<BackendScanResponse>("/ingest/scan", payload);
    return {
      scan_id: response.scan_id,
      status: response.status,
      files_found: response.files_found,
    };
  },

  ingestFile: async (data: IngestRequest): Promise<IngestResponse> => {
    const response = await api.post<BackendIngestResponse>("/ingest/file", {
      file_path: data.file_path,
    });

    return {
      track_id: response.track_id,
      title: response.metadata?.title ?? "",
      artist: response.metadata?.artist ?? "",
      album: response.metadata?.album ?? "",
      duration_secs: response.metadata?.duration_secs ?? 0,
    };
  },

  /**
   * Bulk-import every file from a previous scan. The server holds the file
   * list in memory keyed by scan_id; this iterates them and reports counts.
   */
  ingestScan: async (
    scanId: string,
    options?: { force_reimport?: boolean },
  ): Promise<IngestScanSummary> => {
    return api.post<IngestScanSummary>(`/ingest/scan/${scanId}`, {
      force_reimport: options?.force_reimport ?? false,
    });
  },
};
