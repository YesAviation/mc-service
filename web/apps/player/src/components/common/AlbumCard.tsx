import { useNavigate } from "react-router-dom";
import { Disc3, Play } from "lucide-react";
import type { Album } from "@music/shared";
import { gradientFromSeed } from "@/lib/artwork";

interface AlbumCardProps {
  album: Album;
}

export default function AlbumCard({ album }: AlbumCardProps) {
  const navigate = useNavigate();

  return (
    <button
      onClick={() => navigate(`/album/${album.id}`)}
      className="group text-left p-2.5 rounded-xl bg-white/3 hover:bg-white/8 transition-all w-full"
    >
      {/* Artwork */}
      <div className="relative aspect-square rounded-lg overflow-hidden bg-bg-elevated mb-2.5 shadow-[0_18px_45px_-34px_rgba(0,0,0,0.95)]">
        {album.artwork_url ? (
          <img
            src={album.artwork_url}
            alt={album.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <div
            className="w-full h-full flex items-center justify-center"
            style={{ backgroundImage: gradientFromSeed(`${album.title}-${album.artist_name}`) }}
          >
            <div className="absolute inset-0 bg-black/25" />
            <Disc3
              size={48}
              className="relative z-10 text-white/65"
            />
          </div>
        )}

        {/* Play overlay */}
        <div className="absolute inset-0 bg-black/45 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <div className="w-12 h-12 rounded-full bg-accent flex items-center justify-center shadow-lg translate-y-2 group-hover:translate-y-0 transition-transform">
            <Play size={22} fill="white" className="text-white ml-0.5" />
          </div>
        </div>
      </div>

      {/* Info */}
      <p className="text-sm font-semibold text-text-primary truncate">
        {album.title}
      </p>
      <p className="text-xs text-text-secondary truncate mt-0.5">
        {album.artist_name}
        {album.year ? ` \u00B7 ${album.year}` : ""}
      </p>
    </button>
  );
}
