import { useMemo, useState } from "react";
import { GripVertical, Sparkles, Star } from "lucide-react";
import {
  PageHero,
  Panel,
  PrimaryAction,
  SecondaryAction,
  StatusPill,
} from "@/components/admin/AdminPrimitives";

type FeaturedItem = {
  id: string;
  title: string;
  type: "track" | "album" | "playlist";
  source: string;
  score: number;
  approved: boolean;
};

const featuredDefaults: FeaturedItem[] = [
  { id: "f_1", title: "Night Drive", type: "playlist", source: "editorial", score: 97, approved: true },
  { id: "f_2", title: "Static Dreams", type: "album", source: "catalog trend", score: 91, approved: true },
  { id: "f_3", title: "Digital Heart", type: "track", source: "manual pick", score: 89, approved: false },
  { id: "f_4", title: "Warm Bloom", type: "track", source: "ml candidate", score: 85, approved: true },
  { id: "f_5", title: "Aerial Coast", type: "album", source: "ml candidate", score: 82, approved: false },
];

const homeShelves = [
  { id: "s_1", name: "Admin Favorites", placement: "Top", state: "enabled" },
  { id: "s_2", name: "New This Week", placement: "After favorites", state: "enabled" },
  { id: "s_3", name: "Because You Listened", placement: "Mid-page", state: "enabled" },
  { id: "s_4", name: "Deep Cuts", placement: "Lower page", state: "paused" },
];

export default function CurationPage() {
  const [items] = useState<FeaturedItem[]>(featuredDefaults);
  const [query, setQuery] = useState("");
  const [heroSlots, setHeroSlots] = useState(5);
  const [includeExplicit, setIncludeExplicit] = useState(false);
  const [discoveryBlend, setDiscoveryBlend] = useState(35);

  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return items;
    }

    return items.filter((item) => {
      return (
        item.title.toLowerCase().includes(normalizedQuery) ||
        item.type.toLowerCase().includes(normalizedQuery) ||
        item.source.toLowerCase().includes(normalizedQuery)
      );
    });
  }, [items, query]);

  const approvedCount = items.filter((item) => item.approved).length;

  return (
    <div className="space-y-6">
      <PageHero
        title="Curation"
        badge="Discovery"
        description="Pick global favorites, control homepage shelves, and define editorial promotion logic that every listener sees."
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="surface-panel p-4">
          <p className="text-sm text-text-secondary">Hero slots</p>
          <p className="mt-1 text-2xl font-semibold text-text-primary">{heroSlots}</p>
        </div>
        <div className="surface-panel p-4">
          <p className="text-sm text-text-secondary">Approved highlights</p>
          <p className="mt-1 text-2xl font-semibold text-success">{approvedCount}</p>
        </div>
        <div className="surface-panel p-4">
          <p className="text-sm text-text-secondary">Discovery blend</p>
          <p className="mt-1 text-2xl font-semibold text-accent">{discoveryBlend}% ML</p>
        </div>
      </div>

      <Panel
        title="Favorites To Feature"
        description="Choose which tracks, albums, and playlists appear as featured content in Home and Discovery."
        action={<PrimaryAction label="Publish Featured Set" />}
      >
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search favorites"
            className="w-full rounded-lg border border-border-default bg-bg-primary px-3 py-2 text-sm text-text-primary md:max-w-sm"
          />
          <label className="inline-flex items-center gap-2 text-sm text-text-secondary">
            <input
              type="checkbox"
              checked={includeExplicit}
              onChange={(event) => setIncludeExplicit(event.target.checked)}
              className="h-4 w-4 accent-accent"
            />
            Allow explicit content in featured rails
          </label>
        </div>

        <div className="mt-4 overflow-x-auto rounded-lg border border-border-subtle">
          <table className="min-w-full text-sm">
            <thead className="bg-white/5 text-left text-xs uppercase tracking-[0.08em] text-text-muted">
              <tr>
                <th className="px-3 py-2 font-medium">Order</th>
                <th className="px-3 py-2 font-medium">Title</th>
                <th className="px-3 py-2 font-medium">Type</th>
                <th className="px-3 py-2 font-medium">Source</th>
                <th className="px-3 py-2 font-medium">Score</th>
                <th className="px-3 py-2 font-medium">State</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((item, index) => (
                <tr key={item.id} className="hover:bg-white/5">
                  <td className="px-3 py-2 text-text-secondary">
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 rounded-md border border-border-subtle px-2 py-1 text-xs"
                    >
                      <GripVertical className="h-3.5 w-3.5" />
                      {index + 1}
                    </button>
                  </td>
                  <td className="px-3 py-2 font-medium text-text-primary">{item.title}</td>
                  <td className="px-3 py-2 capitalize text-text-secondary">{item.type}</td>
                  <td className="px-3 py-2 text-text-secondary">{item.source}</td>
                  <td className="px-3 py-2 text-text-secondary">{item.score}</td>
                  <td className="px-3 py-2">
                    {item.approved ? (
                      <StatusPill label="approved" tone="success" />
                    ) : (
                      <StatusPill label="needs review" tone="warning" />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel
        title="Homepage Shelf Strategy"
        description="Control ordering and activation of each content section visible to end users."
      >
        <div className="space-y-2">
          {homeShelves.map((shelf) => (
            <div
              key={shelf.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border-subtle bg-white/5 px-3 py-2"
            >
              <div className="flex items-center gap-2">
                <Star className="h-4 w-4 text-accent" />
                <div>
                  <p className="text-sm font-medium text-text-primary">{shelf.name}</p>
                  <p className="text-xs text-text-muted">Placement: {shelf.placement}</p>
                </div>
              </div>
              <StatusPill
                label={shelf.state}
                tone={shelf.state === "enabled" ? "success" : "warning"}
              />
            </div>
          ))}
        </div>

        <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
          <label className="text-sm text-text-secondary">
            Number of hero slots
            <input
              type="number"
              min={1}
              max={20}
              value={heroSlots}
              onChange={(event) => setHeroSlots(Number(event.target.value) || 1)}
              className="mt-1 w-full rounded-lg border border-border-default bg-bg-primary px-3 py-2 text-sm text-text-primary"
            />
          </label>

          <label className="text-sm text-text-secondary">
            Discovery blend (manual vs ML)
            <input
              type="range"
              min={0}
              max={100}
              value={discoveryBlend}
              onChange={(event) => setDiscoveryBlend(Number(event.target.value))}
              className="mt-3 w-full"
            />
          </label>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <PrimaryAction label="Save Curation Rules" />
          <SecondaryAction label="Preview As Listener" />
        </div>
      </Panel>

      <Panel
        title="Editorial Campaign Windows"
        description="Schedule time-bound pushes for genre campaigns, seasonal content, and launches."
      >
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <label className="text-sm text-text-secondary">
            Campaign name
            <input
              type="text"
              placeholder="Summer night drives"
              className="mt-1 w-full rounded-lg border border-border-default bg-bg-primary px-3 py-2 text-sm text-text-primary"
            />
          </label>

          <label className="text-sm text-text-secondary">
            Start date
            <input
              type="datetime-local"
              className="mt-1 w-full rounded-lg border border-border-default bg-bg-primary px-3 py-2 text-sm text-text-primary"
            />
          </label>

          <label className="text-sm text-text-secondary">
            End date
            <input
              type="datetime-local"
              className="mt-1 w-full rounded-lg border border-border-default bg-bg-primary px-3 py-2 text-sm text-text-primary"
            />
          </label>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-lg bg-accent px-3.5 py-2 text-sm font-medium text-white hover:bg-accent-hover"
          >
            <Sparkles className="h-4 w-4" />
            Schedule Campaign
          </button>
          <SecondaryAction label="Open Calendar" />
        </div>
      </Panel>
    </div>
  );
}
