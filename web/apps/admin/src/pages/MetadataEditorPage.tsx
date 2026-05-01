import { useEffect, useMemo, useState } from "react";
import { ApiError, catalogApi } from "@music/shared";
import type { Album, Artist, Track } from "@music/shared";
import { CheckCircle2, Loader2, RefreshCw, Search, X } from "lucide-react";
import { PageHero, Panel, StatusPill } from "@/components/admin/AdminPrimitives";

type EditorTab = "tracks" | "albums" | "artists";

type Feedback = { tone: "success" | "error"; message: string };

type EditingRecord =
  | { kind: "track"; record: Track }
  | { kind: "album"; record: Album }
  | { kind: "artist"; record: Artist };

function apiErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof ApiError)) return fallback;
  const body = error.body as { error?: { message?: string } } | null;
  return body?.error?.message ?? fallback;
}

export default function MetadataEditorPage() {
  const [tab, setTab] = useState<EditorTab>("tracks");
  const [tracks, setTracks] = useState<Track[]>([]);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [artists, setArtists] = useState<Artist[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<EditingRecord | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  async function load(active: EditorTab) {
    setLoading(true);
    try {
      if (active === "tracks") {
        const res = await catalogApi.listTracks({ page: 1, page_size: 200 });
        setTracks(res.items);
      } else if (active === "albums") {
        const res = await catalogApi.listAlbums({ page: 1, page_size: 200 });
        setAlbums(res.items);
      } else {
        const res = await catalogApi.listArtists({ page: 1, page_size: 200 });
        setArtists(res.items);
      }
    } catch (err) {
      setFeedback({
        tone: "error",
        message: apiErrorMessage(err, "Could not load catalog records."),
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load(tab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  useEffect(() => {
    if (!feedback) return;
    const id = setTimeout(() => setFeedback(null), 4500);
    return () => clearTimeout(id);
  }, [feedback]);

  const filteredTracks = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return tracks;
    return tracks.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.artist_name.toLowerCase().includes(q) ||
        t.album_title.toLowerCase().includes(q),
    );
  }, [tracks, query]);

  const filteredAlbums = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return albums;
    return albums.filter(
      (a) =>
        a.title.toLowerCase().includes(q) ||
        a.artist_name.toLowerCase().includes(q),
    );
  }, [albums, query]);

  const filteredArtists = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return artists;
    return artists.filter((a) => a.name.toLowerCase().includes(q));
  }, [artists, query]);

  function refreshAfterSave() {
    void load(tab);
  }

  return (
    <div className="space-y-6">
      <PageHero
        badge="Catalog"
        title="Metadata Editor"
        description="Override iTunes-imported metadata. Saved edits freeze the record from being overwritten by future automated enrichment runs."
      />

      <Panel title="Catalog records" description="Click any record to edit its metadata.">
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex rounded-lg bg-white/5 p-1">
              {(["tracks", "albums", "artists"] as EditorTab[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => {
                    setTab(t);
                    setQuery("");
                  }}
                  className={`px-3 py-1.5 text-sm font-medium rounded-md capitalize transition-colors ${
                    tab === t
                      ? "bg-accent text-white"
                      : "text-text-secondary hover:text-text-primary"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>

            <div className="relative w-full sm:w-72">
              <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
              />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`Search ${tab}…`}
                className="w-full pl-9 pr-3 py-2 rounded-lg bg-bg-primary border border-border-default text-text-primary text-sm placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent/40"
              />
            </div>
          </div>

          {feedback && (
            <div
              className={`rounded-lg px-3 py-2 text-sm ${
                feedback.tone === "success"
                  ? "bg-success/15 text-success"
                  : "bg-danger/15 text-danger"
              }`}
            >
              {feedback.message}
            </div>
          )}

          {loading ? (
            <div className="py-12 flex items-center justify-center text-text-muted">
              <Loader2 size={20} className="animate-spin" />
            </div>
          ) : tab === "tracks" ? (
            <RowList
              empty="No tracks match."
              rows={filteredTracks.map((t) => ({
                id: t.id,
                primary: t.title,
                secondary: `${t.artist_name} · ${t.album_title}${t.year ? ` · ${t.year}` : ""}`,
                edited: !!t.manually_edited,
                onClick: () => setEditing({ kind: "track", record: t }),
              }))}
            />
          ) : tab === "albums" ? (
            <RowList
              empty="No albums match."
              rows={filteredAlbums.map((a) => ({
                id: a.id,
                primary: a.title,
                secondary: `${a.artist_name}${a.year ? ` · ${a.year}` : ""}${a.genre ? ` · ${a.genre}` : ""}`,
                edited: !!a.manually_edited,
                onClick: () => setEditing({ kind: "album", record: a }),
              }))}
            />
          ) : (
            <RowList
              empty="No artists match."
              rows={filteredArtists.map((a) => ({
                id: a.id,
                primary: a.name,
                secondary: a.origin_country
                  ? `From ${a.origin_country}`
                  : a.bio?.slice(0, 80) || "—",
                edited: !!a.manually_edited,
                onClick: () => setEditing({ kind: "artist", record: a }),
              }))}
            />
          )}
        </div>
      </Panel>

      {editing && (
        <EditDrawer
          editing={editing}
          onClose={() => setEditing(null)}
          onSaved={(message) => {
            setFeedback({ tone: "success", message });
            setEditing(null);
            refreshAfterSave();
          }}
          onError={(message) => setFeedback({ tone: "error", message })}
        />
      )}
    </div>
  );
}

function RowList({
  rows,
  empty,
}: {
  rows: { id: string; primary: string; secondary: string; edited: boolean; onClick: () => void }[];
  empty: string;
}) {
  if (rows.length === 0) {
    return <div className="py-10 text-center text-sm text-text-muted">{empty}</div>;
  }
  return (
    <div className="rounded-lg border border-border-subtle overflow-hidden divide-y divide-border-subtle">
      {rows.map((row) => (
        <button
          key={row.id}
          type="button"
          onClick={row.onClick}
          className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/5 transition-colors"
        >
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-text-primary truncate">{row.primary}</p>
            <p className="text-xs text-text-muted truncate">{row.secondary}</p>
          </div>
          {row.edited && <StatusPill label="Edited" tone="info" />}
        </button>
      ))}
    </div>
  );
}

function EditDrawer({
  editing,
  onClose,
  onSaved,
  onError,
}: {
  editing: EditingRecord;
  onClose: () => void;
  onSaved: (message: string) => void;
  onError: (message: string) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [refetching, setRefetching] = useState(false);

  // Track form
  const [trackForm, setTrackForm] = useState(() =>
    editing.kind === "track"
      ? {
          title: editing.record.title,
          genre: editing.record.genre,
          year: editing.record.year,
          track_number: editing.record.track_number,
          disc_number: editing.record.disc_number,
        }
      : null,
  );

  // Album form
  const [albumForm, setAlbumForm] = useState(() =>
    editing.kind === "album"
      ? {
          title: editing.record.title,
          year: editing.record.year,
          genre: editing.record.genre,
          artwork_url: editing.record.artwork_url,
        }
      : null,
  );

  // Artist form
  const [artistForm, setArtistForm] = useState(() =>
    editing.kind === "artist"
      ? {
          name: editing.record.name,
          bio: editing.record.bio,
          image_url: editing.record.image_url,
          formed_date: editing.record.formed_date ?? "",
          origin_country: editing.record.origin_country ?? "",
        }
      : null,
  );

  const recordIsEdited =
    editing.kind === "track"
      ? !!editing.record.manually_edited
      : editing.kind === "album"
        ? !!editing.record.manually_edited
        : !!editing.record.manually_edited;

  async function handleSave() {
    setSaving(true);
    try {
      if (editing.kind === "track" && trackForm) {
        await catalogApi.updateTrack(editing.record.id, trackForm);
        onSaved(`Saved “${trackForm.title}”.`);
      } else if (editing.kind === "album" && albumForm) {
        await catalogApi.updateAlbum(editing.record.id, albumForm);
        onSaved(`Saved “${albumForm.title}”.`);
      } else if (editing.kind === "artist" && artistForm) {
        await catalogApi.updateArtist(editing.record.id, artistForm);
        onSaved(`Saved “${artistForm.name}”.`);
      }
    } catch (err) {
      onError(apiErrorMessage(err, "Save failed."));
    } finally {
      setSaving(false);
    }
  }

  async function handleRefetch() {
    setRefetching(true);
    try {
      // Unfreezes the record so the next iTunes ingestion run can refresh it.
      // Once Phase 3 wires the explicit "rerun ingestion now" RPC, also kick
      // that off here.
      if (editing.kind === "track") {
        await catalogApi.updateTrack(editing.record.id, { manually_edited: false });
      } else if (editing.kind === "album") {
        await catalogApi.updateAlbum(editing.record.id, { manually_edited: false });
      } else {
        await catalogApi.updateArtist(editing.record.id, { manually_edited: false });
      }
      onSaved("Cleared manual override. iTunes ingestion will refresh this record on its next run.");
    } catch (err) {
      onError(apiErrorMessage(err, "Could not reset to iTunes metadata."));
    } finally {
      setRefetching(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex">
      <button
        type="button"
        aria-label="Close editor"
        onClick={onClose}
        className="flex-1 bg-black/50"
      />
      <aside className="w-full max-w-md h-full bg-bg-primary border-l border-border-default overflow-y-auto">
        <div className="px-5 py-4 flex items-center justify-between border-b border-border-subtle">
          <div>
            <p className="text-xs uppercase tracking-[0.12em] text-text-muted">
              Edit {editing.kind}
            </p>
            <h2 className="text-lg font-semibold text-text-primary mt-0.5">
              {editing.kind === "track"
                ? editing.record.title
                : editing.kind === "album"
                  ? editing.record.title
                  : editing.record.name}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-md text-text-secondary hover:bg-white/5"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {recordIsEdited && (
          <div className="mx-5 mt-4 px-3 py-2 rounded-md bg-info/10 text-info text-xs flex items-center gap-2">
            <CheckCircle2 size={14} />
            <span>Manually edited — frozen from automated overwrites.</span>
          </div>
        )}

        <div className="p-5 space-y-4">
          {editing.kind === "track" && trackForm && (
            <>
              <Field label="Title">
                <input
                  type="text"
                  value={trackForm.title}
                  onChange={(e) => setTrackForm({ ...trackForm, title: e.target.value })}
                  className={fieldClasses}
                />
              </Field>
              <Field label="Genre">
                <input
                  type="text"
                  value={trackForm.genre}
                  onChange={(e) => setTrackForm({ ...trackForm, genre: e.target.value })}
                  className={fieldClasses}
                />
              </Field>
              <div className="grid grid-cols-3 gap-3">
                <Field label="Year">
                  <input
                    type="number"
                    value={trackForm.year}
                    onChange={(e) =>
                      setTrackForm({ ...trackForm, year: Number(e.target.value) || 0 })
                    }
                    className={fieldClasses}
                  />
                </Field>
                <Field label="Track #">
                  <input
                    type="number"
                    value={trackForm.track_number}
                    onChange={(e) =>
                      setTrackForm({ ...trackForm, track_number: Number(e.target.value) || 0 })
                    }
                    className={fieldClasses}
                  />
                </Field>
                <Field label="Disc #">
                  <input
                    type="number"
                    value={trackForm.disc_number}
                    onChange={(e) =>
                      setTrackForm({ ...trackForm, disc_number: Number(e.target.value) || 0 })
                    }
                    className={fieldClasses}
                  />
                </Field>
              </div>
            </>
          )}

          {editing.kind === "album" && albumForm && (
            <>
              <Field label="Title">
                <input
                  type="text"
                  value={albumForm.title}
                  onChange={(e) => setAlbumForm({ ...albumForm, title: e.target.value })}
                  className={fieldClasses}
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Year">
                  <input
                    type="number"
                    value={albumForm.year}
                    onChange={(e) =>
                      setAlbumForm({ ...albumForm, year: Number(e.target.value) || 0 })
                    }
                    className={fieldClasses}
                  />
                </Field>
                <Field label="Genre">
                  <input
                    type="text"
                    value={albumForm.genre}
                    onChange={(e) => setAlbumForm({ ...albumForm, genre: e.target.value })}
                    className={fieldClasses}
                  />
                </Field>
              </div>
              <Field label="Artwork URL">
                <input
                  type="text"
                  value={albumForm.artwork_url}
                  onChange={(e) =>
                    setAlbumForm({ ...albumForm, artwork_url: e.target.value })
                  }
                  className={fieldClasses}
                  placeholder="https://… or relative server path"
                />
              </Field>
            </>
          )}

          {editing.kind === "artist" && artistForm && (
            <>
              <Field label="Name">
                <input
                  type="text"
                  value={artistForm.name}
                  onChange={(e) => setArtistForm({ ...artistForm, name: e.target.value })}
                  className={fieldClasses}
                />
              </Field>
              <Field label="Bio">
                <textarea
                  value={artistForm.bio}
                  onChange={(e) => setArtistForm({ ...artistForm, bio: e.target.value })}
                  rows={6}
                  className={`${fieldClasses} resize-none`}
                />
              </Field>
              <Field label="Image URL">
                <input
                  type="text"
                  value={artistForm.image_url}
                  onChange={(e) =>
                    setArtistForm({ ...artistForm, image_url: e.target.value })
                  }
                  className={fieldClasses}
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Formed (YYYY-MM-DD)">
                  <input
                    type="text"
                    value={artistForm.formed_date}
                    onChange={(e) =>
                      setArtistForm({ ...artistForm, formed_date: e.target.value })
                    }
                    placeholder="2022-03-28"
                    className={fieldClasses}
                  />
                </Field>
                <Field label="Origin">
                  <input
                    type="text"
                    value={artistForm.origin_country}
                    onChange={(e) =>
                      setArtistForm({ ...artistForm, origin_country: e.target.value })
                    }
                    placeholder="South Korea"
                    className={fieldClasses}
                  />
                </Field>
              </div>
            </>
          )}
        </div>

        <div className="px-5 pb-5 pt-2 border-t border-border-subtle bg-bg-primary sticky bottom-0 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={handleRefetch}
            disabled={refetching || saving || !recordIsEdited}
            className="inline-flex items-center gap-2 text-xs text-text-secondary hover:text-text-primary disabled:opacity-40"
            title={
              recordIsEdited
                ? "Clear manual override; iTunes ingestion will refresh on its next run."
                : "Already auto-managed."
            }
          >
            {refetching ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <RefreshCw size={12} />
            )}
            Refetch from iTunes
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-md text-sm text-text-secondary hover:text-text-primary"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="px-3 py-1.5 rounded-md bg-accent hover:bg-accent-hover text-white text-sm font-medium inline-flex items-center gap-2 disabled:opacity-50"
            >
              {saving && <Loader2 size={12} className="animate-spin" />}
              Save changes
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-text-secondary mb-1.5">{label}</span>
      {children}
    </label>
  );
}

const fieldClasses =
  "w-full px-3 py-2 rounded-lg bg-bg-elevated/40 border border-border-default text-text-primary text-sm placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent/40";
