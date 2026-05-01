import { useEffect, useState } from "react";
import { api, mediaSettingsApi } from "@music/shared";
import type { HealthResponse, MediaProcessingSettings } from "@music/shared";
import {
  AlertCircle,
  Database,
  HardDrive,
  Info,
  Loader2,
  Play,
  Save,
  Server,
  Settings,
  Sparkles,
} from "lucide-react";

interface SettingRow {
  label: string;
  value: string;
  icon: typeof Settings;
}

export default function SettingsPage() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [loadingMediaSettings, setLoadingMediaSettings] = useState(true);
  const [savingMediaSettings, setSavingMediaSettings] = useState(false);
  const [runningPrewarm, setRunningPrewarm] = useState(false);

  const [autoPrewarmOnScanComplete, setAutoPrewarmOnScanComplete] = useState(true);
  const [pretranscodeEnabled, setPretranscodeEnabled] = useState(true);
  const [prehlsEnabled, setPrehlsEnabled] = useState(true);
  const [bitratesInput, setBitratesInput] = useState("128,256,320");
  const [segmentDurationInput, setSegmentDurationInput] = useState(10);
  const [updatedAt, setUpdatedAt] = useState("");
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; message: string } | null>(null);

  useEffect(() => {
    api
      .get<HealthResponse>("/health")
      .then(setHealth)
      .catch(() => {});
  }, []);

  useEffect(() => {
    const loadMediaSettings = async () => {
      setLoadingMediaSettings(true);
      setFeedback(null);

      try {
        const settings = await mediaSettingsApi.getMediaProcessingSettings();
        hydrateForm(settings);
      } catch {
        setFeedback({
          tone: "error",
          message: "Failed to load media processing settings.",
        });
      } finally {
        setLoadingMediaSettings(false);
      }
    };

    void loadMediaSettings();
  }, []);

  const hydrateForm = (settings: MediaProcessingSettings) => {
    setAutoPrewarmOnScanComplete(settings.auto_prewarm_on_scan_complete);
    setPretranscodeEnabled(settings.pretranscode_enabled);
    setPrehlsEnabled(settings.prehls_enabled);
    setBitratesInput(settings.prewarm_bitrates.join(","));
    setSegmentDurationInput(settings.hls_segment_duration_secs);
    setUpdatedAt(settings.updated_at);
  };

  const parseBitratesInput = (): number[] => {
    const parsed = bitratesInput
      .split(",")
      .map((value) => Number.parseInt(value.trim(), 10))
      .filter((value) => Number.isFinite(value) && value > 0);

    return [...new Set(parsed)].sort((a, b) => a - b);
  };

  const handleSaveSettings = async () => {
    const prewarmBitrates = parseBitratesInput();
    if (prewarmBitrates.length === 0) {
      setFeedback({
        tone: "error",
        message: "Enter at least one valid bitrate (for example 128,256,320).",
      });
      return;
    }

    setSavingMediaSettings(true);
    setFeedback(null);

    try {
      const settings = await mediaSettingsApi.updateMediaProcessingSettings({
        auto_prewarm_on_scan_complete: autoPrewarmOnScanComplete,
        pretranscode_enabled: pretranscodeEnabled,
        prehls_enabled: prehlsEnabled,
        prewarm_bitrates: prewarmBitrates,
        hls_segment_duration_secs: Math.max(1, segmentDurationInput),
      });

      hydrateForm(settings);
      setFeedback({
        tone: "success",
        message: "Media processing settings saved.",
      });
    } catch {
      setFeedback({
        tone: "error",
        message: "Saving media processing settings failed.",
      });
    } finally {
      setSavingMediaSettings(false);
    }
  };

  const handleRunPrewarm = async () => {
    setRunningPrewarm(true);
    setFeedback(null);

    try {
      const response = await mediaSettingsApi.startManualPrewarm();
      setFeedback({
        tone: "success",
        message: response.message,
      });
    } catch {
      setFeedback({
        tone: "error",
        message: "Failed to start media prewarm job.",
      });
    } finally {
      setRunningPrewarm(false);
    }
  };

  const rows: SettingRow[] = [
    {
      label: "Service",
      value: health?.service ?? "--",
      icon: Server,
    },
    {
      label: "Server Version",
      value: health?.version ? `v${health.version}` : "--",
      icon: Info,
    },
    {
      label: "Server Status",
      value: health?.status ?? "--",
      icon: Database,
    },
    {
      label: "Storage Backend",
      value: "Local filesystem",
      icon: HardDrive,
    },
  ];

  return (
    <div className="space-y-6">
      <section className="page-header py-6 md:py-8">
        <h1 className="text-[1.85rem] md:text-[2rem] font-semibold tracking-tight text-text-primary">
          Settings
        </h1>
        <p className="text-sm md:text-[0.95rem] text-text-secondary mt-1.5 max-w-2xl">
          Configure transcoding and HLS prewarm behavior for faster playback or lower disk usage.
        </p>
      </section>

      <div className="surface-panel divide-y divide-border-subtle">
        {rows.map((row) => (
          <div
            key={row.label}
            className="flex items-center gap-4 px-5 py-4"
          >
            <div className="w-9 h-9 rounded-lg bg-bg-surface-hover flex items-center justify-center shrink-0">
              <row.icon className="w-4 h-4 text-text-secondary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-text-primary">
                {row.label}
              </p>
            </div>
            <p className="text-sm text-text-secondary font-mono">
              {row.value}
            </p>
          </div>
        ))}
      </div>

      <div className="surface-panel p-5">
        <div className="flex items-start justify-between gap-3 mb-5">
          <div>
            <h2 className="text-lg font-semibold text-text-primary flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-accent" />
              Media Processing
            </h2>
            <p className="text-sm text-text-secondary mt-1">
              Default behavior prewarms transcoding and HLS after scan completes.
            </p>
          </div>

          <button
            type="button"
            onClick={handleRunPrewarm}
            disabled={runningPrewarm || loadingMediaSettings}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border-default text-sm text-text-secondary hover:text-text-primary hover:bg-bg-surface-hover disabled:opacity-50"
          >
            {runningPrewarm ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            Run Prewarm Now
          </button>
        </div>

        {loadingMediaSettings ? (
          <div className="flex items-center gap-2 text-sm text-text-secondary py-3">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading settings...
          </div>
        ) : (
          <div className="space-y-4">
            <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer">
              <input
                type="checkbox"
                checked={autoPrewarmOnScanComplete}
                onChange={(event) => setAutoPrewarmOnScanComplete(event.target.checked)}
                className="w-4 h-4 rounded border-border-default accent-accent"
              />
              Automatically start prewarm when scan completes
            </label>

            <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer">
              <input
                type="checkbox"
                checked={pretranscodeEnabled}
                onChange={(event) => setPretranscodeEnabled(event.target.checked)}
                className="w-4 h-4 rounded border-border-default accent-accent"
              />
              Pre-transcode files in background
            </label>

            <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer">
              <input
                type="checkbox"
                checked={prehlsEnabled}
                onChange={(event) => setPrehlsEnabled(event.target.checked)}
                className="w-4 h-4 rounded border-border-default accent-accent"
              />
              Pre-generate HLS manifests and segments
            </label>

            <div>
              <label className="block text-sm text-text-secondary mb-1">
                Prewarm bitrates (kbps, comma-separated)
              </label>
              <input
                value={bitratesInput}
                onChange={(event) => setBitratesInput(event.target.value)}
                placeholder="128,256,320"
                className="w-full px-3 py-2 bg-bg-primary border border-border-default rounded-lg text-text-primary text-sm placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm text-text-secondary mb-1">
                HLS segment duration (seconds)
              </label>
              <input
                type="number"
                min={1}
                value={segmentDurationInput}
                onChange={(event) => {
                  const parsed = Number.parseInt(event.target.value, 10);
                  setSegmentDurationInput(Number.isFinite(parsed) ? parsed : 1);
                }}
                className="w-40 px-3 py-2 bg-bg-primary border border-border-default rounded-lg text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
              />
            </div>

            {updatedAt && (
              <p className="text-xs text-text-muted">
                Last updated: {new Date(updatedAt).toLocaleString()}
              </p>
            )}

            {feedback && (
              <div
                className={
                  feedback.tone === "success"
                    ? "flex items-center gap-2 text-sm text-success bg-success/10 border border-success/20 rounded-lg px-3 py-2"
                    : "flex items-center gap-2 text-sm text-danger bg-danger/10 border border-danger/20 rounded-lg px-3 py-2"
                }
              >
                <AlertCircle className="w-4 h-4 shrink-0" />
                {feedback.message}
              </div>
            )}

            <button
              type="button"
              onClick={handleSaveSettings}
              disabled={savingMediaSettings}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-accent hover:bg-accent-hover disabled:opacity-50 text-white text-sm font-medium"
            >
              {savingMediaSettings ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save Settings
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
