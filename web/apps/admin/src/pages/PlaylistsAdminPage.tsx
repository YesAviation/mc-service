import { useMemo, useState } from "react";
import { CalendarClock, GripVertical, ListMusic, Users } from "lucide-react";
import {
  PageHero,
  Panel,
  PrimaryAction,
  SecondaryAction,
  StatusPill,
} from "@/components/admin/AdminPrimitives";

type PlaylistVisibility = "public" | "private" | "unlisted";

type CuratedPlaylist = {
  id: string;
  name: string;
  owner: string;
  tracks: number;
  visibility: PlaylistVisibility;
  pinned: boolean;
  updatedAt: string;
};

const curatedPlaylists: CuratedPlaylist[] = [
  {
    id: "p_01",
    name: "Synthwave Frontline",
    owner: "Editorial",
    tracks: 42,
    visibility: "public",
    pinned: true,
    updatedAt: "2026-04-17 08:01",
  },
  {
    id: "p_02",
    name: "Late Night Focus",
    owner: "Automix",
    tracks: 58,
    visibility: "public",
    pinned: true,
    updatedAt: "2026-04-16 22:44",
  },
  {
    id: "p_03",
    name: "Fresh Upload Radar",
    owner: "ML",
    tracks: 80,
    visibility: "unlisted",
    pinned: false,
    updatedAt: "2026-04-16 20:06",
  },
  {
    id: "p_04",
    name: "Mood: Rainy",
    owner: "Editorial",
    tracks: 33,
    visibility: "private",
    pinned: false,
    updatedAt: "2026-04-15 13:20",
  },
];

const playlistTracks = [
  { id: "t_1", title: "Terminal Bloom", artist: "Aster", score: 98 },
  { id: "t_2", title: "Open Circuit", artist: "Neon Valley", score: 93 },
  { id: "t_3", title: "Northbound", artist: "Luma", score: 90 },
  { id: "t_4", title: "Falling Grid", artist: "Tape City", score: 88 },
  { id: "t_5", title: "Afterlight", artist: "Orbit Echo", score: 86 },
];

export default function PlaylistsAdminPage() {
  const [selectedPlaylistId, setSelectedPlaylistId] = useState(curatedPlaylists[0]?.id ?? "");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [dailyBudget, setDailyBudget] = useState(24);

  const selectedPlaylist = useMemo(
    () => curatedPlaylists.find((playlist) => playlist.id === selectedPlaylistId) ?? curatedPlaylists[0],
    [selectedPlaylistId],
  );

  return (
    <div className="space-y-6">
      <PageHero
        title="Playlist Control"
        badge="Editorial"
        description="Curate promoted playlists, configure refresh behavior, and tune visibility/audience rules across the platform."
      />

      <Panel
        title="Curated Playlist Registry"
        description="Master list of promoted playlists and publishing status."
        action={<PrimaryAction label="Create Playlist" />}
      >
        <div className="overflow-x-auto rounded-lg border border-border-subtle">
          <table className="min-w-full text-sm">
            <thead className="bg-white/5 text-left text-xs uppercase tracking-[0.08em] text-text-muted">
              <tr>
                <th className="px-3 py-2 font-medium">Playlist</th>
                <th className="px-3 py-2 font-medium">Owner</th>
                <th className="px-3 py-2 font-medium">Tracks</th>
                <th className="px-3 py-2 font-medium">Visibility</th>
                <th className="px-3 py-2 font-medium">Pinned</th>
                <th className="px-3 py-2 font-medium">Last update</th>
              </tr>
            </thead>
            <tbody>
              {curatedPlaylists.map((playlist) => (
                <tr key={playlist.id} className="hover:bg-white/5">
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => setSelectedPlaylistId(playlist.id)}
                      className="font-medium text-text-primary hover:text-accent"
                    >
                      {playlist.name}
                    </button>
                  </td>
                  <td className="px-3 py-2 text-text-secondary">{playlist.owner}</td>
                  <td className="px-3 py-2 text-text-secondary">{playlist.tracks}</td>
                  <td className="px-3 py-2 capitalize text-text-secondary">{playlist.visibility}</td>
                  <td className="px-3 py-2">
                    {playlist.pinned ? (
                      <StatusPill label="pinned" tone="success" />
                    ) : (
                      <StatusPill label="normal" tone="neutral" />
                    )}
                  </td>
                  <td className="px-3 py-2 text-text-secondary">{playlist.updatedAt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel
        title="Playlist Builder"
        description="Fine tune lineup and ranking signals for the selected playlist."
        action={<SecondaryAction label="Open Full Editor" />}
      >
        {selectedPlaylist ? (
          <>
            <div className="rounded-lg border border-border-subtle bg-white/5 p-3">
              <p className="text-sm text-text-secondary">Editing</p>
              <p className="mt-1 text-base font-semibold text-text-primary">{selectedPlaylist.name}</p>
            </div>

            <div className="mt-3 space-y-2">
              {playlistTracks.map((track, index) => (
                <div
                  key={track.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border-subtle bg-white/5 px-3 py-2"
                >
                  <div className="flex items-center gap-2">
                    <GripVertical className="h-4 w-4 text-text-muted" />
                    <span className="text-sm text-text-secondary">{index + 1}</span>
                    <div>
                      <p className="text-sm font-medium text-text-primary">{track.title}</p>
                      <p className="text-xs text-text-muted">{track.artist}</p>
                    </div>
                  </div>

                  <div className="inline-flex items-center gap-2 text-xs text-text-secondary">
                    <span>Score {track.score}</span>
                    <button
                      type="button"
                      className="rounded border border-border-default px-2 py-1 hover:bg-white/10"
                    >
                      Replace
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <PrimaryAction label="Save Track Order" />
              <SecondaryAction label="Generate By Rules" />
            </div>
          </>
        ) : null}
      </Panel>

      <Panel
        title="Publishing Automation"
        description="Set update cadence, audience scope, and schedule windows for curated playlists."
      >
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <label className="text-sm text-text-secondary">
            Refresh cadence
            <select className="mt-1 w-full rounded-lg border border-border-default bg-bg-primary px-3 py-2 text-sm text-text-primary">
              <option>Every 6 hours</option>
              <option>Daily</option>
              <option>Every 3 days</option>
            </select>
          </label>

          <label className="inline-flex items-center gap-2 self-end text-sm text-text-secondary">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(event) => setAutoRefresh(event.target.checked)}
              className="h-4 w-4 accent-accent"
            />
            Auto refresh from recommendation queue
          </label>

          <label className="text-sm text-text-secondary">
            Promotion budget (hours/day)
            <input
              type="number"
              value={dailyBudget}
              onChange={(event) => setDailyBudget(Number(event.target.value) || 0)}
              className="mt-1 w-full rounded-lg border border-border-default bg-bg-primary px-3 py-2 text-sm text-text-primary"
            />
          </label>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
          <button
            type="button"
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-border-default px-3 py-2 text-sm text-text-secondary hover:bg-white/10"
          >
            <CalendarClock className="h-4 w-4" />
            Schedule Publishing Window
          </button>

          <button
            type="button"
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-border-default px-3 py-2 text-sm text-text-secondary hover:bg-white/10"
          >
            <Users className="h-4 w-4" />
            Set Audience Segment
          </button>

          <button
            type="button"
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-border-default px-3 py-2 text-sm text-text-secondary hover:bg-white/10"
          >
            <ListMusic className="h-4 w-4" />
            Configure Rule Stack
          </button>
        </div>
      </Panel>
    </div>
  );
}
