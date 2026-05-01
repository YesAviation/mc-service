import { useState } from "react";
import { Beaker, BrainCircuit, Gauge, ShieldCheck, Workflow } from "lucide-react";
import {
  PageHero,
  Panel,
  PrimaryAction,
  SecondaryAction,
  StatusPill,
} from "@/components/admin/AdminPrimitives";

type SignalWeights = {
  completionRate: number;
  saveRate: number;
  skipPenalty: number;
  recencyBoost: number;
  similarityBoost: number;
};

const runningJobs = [
  { id: "ml_101", name: "recommendation-ranker-train", status: "running", startedAt: "2026-04-17 07:30" },
  { id: "ml_102", name: "embedding-refresh", status: "queued", startedAt: "2026-04-17 08:00" },
  { id: "ml_103", name: "cold-start-synthesis", status: "success", startedAt: "2026-04-17 05:10" },
];

const experiments = [
  { id: "exp_17", name: "Long-tail boost", traffic: "20%", metric: "+4.8% listen time", state: "active" },
  { id: "exp_18", name: "Recency preference", traffic: "10%", metric: "+2.1% saves", state: "active" },
  { id: "exp_19", name: "Low skip pressure", traffic: "5%", metric: "-1.2% retention", state: "paused" },
];

export default function MachineLearningPage() {
  const [recommendationsEnabled, setRecommendationsEnabled] = useState(true);
  const [autoRetrainEnabled, setAutoRetrainEnabled] = useState(true);
  const [explorationEnabled, setExplorationEnabled] = useState(true);
  const [weights, setWeights] = useState<SignalWeights>({
    completionRate: 70,
    saveRate: 62,
    skipPenalty: 44,
    recencyBoost: 56,
    similarityBoost: 68,
  });

  const updateWeight = (key: keyof SignalWeights, value: number) => {
    setWeights((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div className="space-y-6">
      <PageHero
        title="Machine Learning"
        badge="Recommendations"
        description="Control recommendation engines, ranking signals, experiments, retraining cadence, and quality guardrails."
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <div className="surface-panel p-4">
          <p className="text-sm text-text-secondary">Model version</p>
          <p className="mt-1 text-2xl font-semibold text-text-primary">v2.17</p>
        </div>
        <div className="surface-panel p-4">
          <p className="text-sm text-text-secondary">P95 recommendation latency</p>
          <p className="mt-1 text-2xl font-semibold text-accent">121ms</p>
        </div>
        <div className="surface-panel p-4">
          <p className="text-sm text-text-secondary">Daily retrains</p>
          <p className="mt-1 text-2xl font-semibold text-success">3</p>
        </div>
        <div className="surface-panel p-4">
          <p className="text-sm text-text-secondary">Online experiments</p>
          <p className="mt-1 text-2xl font-semibold text-text-primary">{experiments.filter((exp) => exp.state === "active").length}</p>
        </div>
      </div>

      <Panel
        title="Inference Engine Controls"
        description="Gate core recommendation systems and runtime policies."
        action={<PrimaryAction label="Deploy New Model" />}
      >
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className="inline-flex items-center gap-2 text-sm text-text-secondary">
            <input
              type="checkbox"
              checked={recommendationsEnabled}
              onChange={(event) => setRecommendationsEnabled(event.target.checked)}
              className="h-4 w-4 accent-accent"
            />
            Enable recommendations globally
          </label>

          <label className="inline-flex items-center gap-2 text-sm text-text-secondary">
            <input
              type="checkbox"
              checked={autoRetrainEnabled}
              onChange={(event) => setAutoRetrainEnabled(event.target.checked)}
              className="h-4 w-4 accent-accent"
            />
            Auto retrain on schedule
          </label>

          <label className="inline-flex items-center gap-2 text-sm text-text-secondary md:col-span-2">
            <input
              type="checkbox"
              checked={explorationEnabled}
              onChange={(event) => setExplorationEnabled(event.target.checked)}
              className="h-4 w-4 accent-accent"
            />
            Enable exploration traffic for long-tail discovery
          </label>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
          <label className="text-sm text-text-secondary">
            Candidate pool size
            <input
              type="number"
              defaultValue={800}
              className="mt-1 w-full rounded-lg border border-border-default bg-bg-primary px-3 py-2 text-sm text-text-primary"
            />
          </label>

          <label className="text-sm text-text-secondary">
            Inference timeout (ms)
            <input
              type="number"
              defaultValue={250}
              className="mt-1 w-full rounded-lg border border-border-default bg-bg-primary px-3 py-2 text-sm text-text-primary"
            />
          </label>

          <label className="text-sm text-text-secondary">
            Retrain cadence
            <select className="mt-1 w-full rounded-lg border border-border-default bg-bg-primary px-3 py-2 text-sm text-text-primary">
              <option>Every 8 hours</option>
              <option>Daily</option>
              <option>Weekly</option>
            </select>
          </label>
        </div>
      </Panel>

      <Panel
        title="Ranking Signal Weights"
        description="Tune how much each listener behavior signal contributes to final recommendation score."
      >
        <div className="space-y-4">
          {(
            [
              ["completionRate", "Completion rate"],
              ["saveRate", "Save rate"],
              ["skipPenalty", "Skip penalty"],
              ["recencyBoost", "Recency boost"],
              ["similarityBoost", "Similarity boost"],
            ] as Array<[keyof SignalWeights, string]>
          ).map(([key, label]) => (
            <label key={key} className="block text-sm text-text-secondary">
              <div className="mb-1 flex items-center justify-between">
                <span>{label}</span>
                <span className="text-xs text-text-muted">{weights[key]}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={weights[key]}
                onChange={(event) => updateWeight(key, Number(event.target.value))}
                className="w-full"
              />
            </label>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <PrimaryAction label="Save Weights" />
          <SecondaryAction label="Revert To Baseline" />
        </div>
      </Panel>

      <Panel
        title="Experiments & Safety Rails"
        description="Manage online A/B experiments and enforce quality protections."
      >
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="rounded-lg border border-border-subtle bg-white/5 p-3">
            <p className="text-sm text-text-secondary">Minimum diversity index</p>
            <p className="mt-1 text-lg font-semibold text-text-primary">0.62</p>
          </div>
          <div className="rounded-lg border border-border-subtle bg-white/5 p-3">
            <p className="text-sm text-text-secondary">Maximum artist repetition</p>
            <p className="mt-1 text-lg font-semibold text-text-primary">2 per 15 tracks</p>
          </div>
          <div className="rounded-lg border border-border-subtle bg-white/5 p-3">
            <p className="text-sm text-text-secondary">Toxicity / explicit guardrail</p>
            <p className="mt-1 text-lg font-semibold text-text-primary">Strict</p>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto rounded-lg border border-border-subtle">
          <table className="min-w-full text-sm">
            <thead className="bg-white/5 text-left text-xs uppercase tracking-[0.08em] text-text-muted">
              <tr>
                <th className="px-3 py-2 font-medium">Experiment</th>
                <th className="px-3 py-2 font-medium">Traffic</th>
                <th className="px-3 py-2 font-medium">Primary metric</th>
                <th className="px-3 py-2 font-medium">State</th>
              </tr>
            </thead>
            <tbody>
              {experiments.map((experiment) => (
                <tr key={experiment.id} className="hover:bg-white/5">
                  <td className="px-3 py-2 font-medium text-text-primary">{experiment.name}</td>
                  <td className="px-3 py-2 text-text-secondary">{experiment.traffic}</td>
                  <td className="px-3 py-2 text-text-secondary">{experiment.metric}</td>
                  <td className="px-3 py-2">
                    <StatusPill
                      label={experiment.state}
                      tone={experiment.state === "active" ? "success" : "warning"}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel
        title="Model Job Queue"
        description="Track training jobs, embeddings refreshes, and deployment promotions."
      >
        <div className="space-y-2">
          {runningJobs.map((job) => (
            <div
              key={job.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border-subtle bg-white/5 px-3 py-2"
            >
              <div className="flex items-center gap-2">
                <Workflow className="h-4 w-4 text-accent" />
                <div>
                  <p className="text-sm font-medium text-text-primary">{job.name}</p>
                  <p className="text-xs text-text-muted">{job.id} started at {job.startedAt}</p>
                </div>
              </div>

              <StatusPill
                label={job.status}
                tone={job.status === "running" ? "info" : job.status === "success" ? "success" : "warning"}
              />
            </div>
          ))}
        </div>

        <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-4">
          <button
            type="button"
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-border-default px-3 py-2 text-sm text-text-secondary hover:bg-white/10"
          >
            <BrainCircuit className="h-4 w-4" />
            Start Full Retrain
          </button>
          <button
            type="button"
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-border-default px-3 py-2 text-sm text-text-secondary hover:bg-white/10"
          >
            <Beaker className="h-4 w-4" />
            Launch Experiment
          </button>
          <button
            type="button"
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-border-default px-3 py-2 text-sm text-text-secondary hover:bg-white/10"
          >
            <Gauge className="h-4 w-4" />
            Benchmark Inference
          </button>
          <button
            type="button"
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-border-default px-3 py-2 text-sm text-text-secondary hover:bg-white/10"
          >
            <ShieldCheck className="h-4 w-4" />
            Run Quality Gate
          </button>
        </div>
      </Panel>
    </div>
  );
}
