import { useEffect, useState } from "react";
import { catalogApi } from "@music/shared";
import type { Track, Album, PaginatedResponse } from "@music/shared";
import { Music, Disc3, ChevronLeft, ChevronRight } from "lucide-react";
import clsx from "clsx";

type Tab = "tracks" | "albums";

function formatDuration(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function LibraryPage() {
  const [tab, setTab] = useState<Tab>("tracks");
  const [tracks, setTracks] = useState<PaginatedResponse<Track> | null>(null);
  const [albums, setAlbums] = useState<PaginatedResponse<Album> | null>(null);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const pageSize = 25;

  useEffect(() => {
    if (tab === "tracks") {
      catalogApi
        .listTracks({ page, page_size: pageSize })
        .then(setTracks)
        .catch(() => setTracks(null))
        .finally(() => setIsLoading(false));
    } else {
      catalogApi
        .listAlbums({ page, page_size: pageSize })
        .then(setAlbums)
        .catch(() => setAlbums(null))
        .finally(() => setIsLoading(false));
    }
  }, [tab, page]);

  function switchTab(t: Tab) {
    setIsLoading(true);
    setTab(t);
    setPage(1);
  }

  const totalPages =
    tab === "tracks"
      ? (tracks?.total_pages ?? 1)
      : (albums?.total_pages ?? 1);

  return (
    <div className="space-y-6">
      <section className="page-header py-6 md:py-8">
        <h1 className="text-[1.85rem] md:text-[2rem] font-semibold tracking-tight text-text-primary">
          Library
        </h1>
        <p className="text-sm md:text-[0.95rem] text-text-secondary mt-1.5 max-w-2xl">
          Browse tracks and albums currently indexed by your server.
        </p>
      </section>

      <div className="list-shell inline-flex gap-1 p-1 w-fit">
        <button
          onClick={() => switchTab("tracks")}
          className={clsx(
            "flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors",
            tab === "tracks"
              ? "bg-accent text-white"
              : "text-text-secondary hover:text-text-primary",
          )}
        >
          <Music className="w-4 h-4" />
          Tracks
        </button>
        <button
          onClick={() => switchTab("albums")}
          className={clsx(
            "flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors",
            tab === "albums"
              ? "bg-accent text-white"
              : "text-text-secondary hover:text-text-primary",
          )}
        >
          <Disc3 className="w-4 h-4" />
          Albums
        </button>
      </div>

      {isLoading ? (
        <div className="text-text-secondary text-sm py-12 text-center">
          Loading...
        </div>
      ) : tab === "tracks" ? (
        <TracksTable tracks={tracks} />
      ) : (
        <AlbumsGrid albums={albums} />
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-6 text-sm text-text-secondary">
          <span>
            Page {page} of {totalPages}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => {
                setIsLoading(true);
                setPage((p) => Math.max(1, p - 1));
              }}
              disabled={page <= 1}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-bg-surface border border-border-subtle hover:bg-bg-surface-hover disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-4 h-4" />
              Prev
            </button>
            <button
              onClick={() => {
                setIsLoading(true);
                setPage((p) => Math.min(totalPages, p + 1));
              }}
              disabled={page >= totalPages}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-bg-surface border border-border-subtle hover:bg-bg-surface-hover disabled:opacity-30 disabled:cursor-not-allowed"
            >
              Next
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function TracksTable({ tracks }: { tracks: PaginatedResponse<Track> | null }) {
  if (!tracks || tracks.items.length === 0) {
    return (
      <div className="text-center py-12 text-text-secondary">
        <Music className="w-10 h-10 mx-auto mb-3 text-text-muted" />
        <p className="text-sm">No tracks in library yet.</p>
        <p className="text-xs text-text-muted mt-1">
          Use Scan & Import to add music.
        </p>
      </div>
    );
  }

  return (
    <div className="list-shell overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border-subtle text-text-muted text-xs uppercase tracking-wider">
            <th className="text-left px-4 py-3 font-medium">#</th>
            <th className="text-left px-4 py-3 font-medium">Title</th>
            <th className="text-left px-4 py-3 font-medium">Artist</th>
            <th className="text-left px-4 py-3 font-medium">Album</th>
            <th className="text-right px-4 py-3 font-medium">Duration</th>
          </tr>
        </thead>
        <tbody>
          {tracks.items.map((track, i) => (
            <tr
              key={track.id}
              className="border-b border-border-subtle last:border-b-0 hover:bg-bg-surface-hover transition-colors"
            >
              <td className="px-4 py-3 text-text-muted">{i + 1}</td>
              <td className="px-4 py-3 text-text-primary font-medium">
                {track.title}
              </td>
              <td className="px-4 py-3 text-text-secondary">
                {track.artist_name}
              </td>
              <td className="px-4 py-3 text-text-secondary">
                {track.album_title}
              </td>
              <td className="px-4 py-3 text-text-muted text-right">
                {formatDuration(track.duration_secs)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AlbumsGrid({ albums }: { albums: PaginatedResponse<Album> | null }) {
  if (!albums || albums.items.length === 0) {
    return (
      <div className="text-center py-12 text-text-secondary">
        <Disc3 className="w-10 h-10 mx-auto mb-3 text-text-muted" />
        <p className="text-sm">No albums in library yet.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
      {albums.items.map((album) => (
        <div
          key={album.id}
          className="surface-panel p-3 hover:bg-bg-surface-hover/75 transition-colors"
        >
          <div className="aspect-square bg-bg-elevated rounded-lg mb-3 flex items-center justify-center">
            {album.artwork_url ? (
              <img
                src={album.artwork_url}
                alt={album.title}
                className="w-full h-full object-cover rounded-lg"
              />
            ) : (
              <Disc3 className="w-8 h-8 text-text-muted" />
            )}
          </div>
          <p className="text-sm font-medium text-text-primary truncate">
            {album.title}
          </p>
          <p className="text-xs text-text-secondary truncate">
            {album.artist_name}
          </p>
          <p className="text-xs text-text-muted mt-0.5">
            {album.track_count} track{album.track_count !== 1 ? "s" : ""}
            {album.year ? ` - ${album.year}` : ""}
          </p>
        </div>
      ))}
    </div>
  );
}
