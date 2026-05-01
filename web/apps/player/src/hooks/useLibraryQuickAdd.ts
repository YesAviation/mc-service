import { useCallback, useRef, useState } from "react";
import type { Track } from "@music/shared";
import { saveTrackToLibrary } from "@/lib/library";
import { useNotificationStore } from "@/stores/notifications";

export function useLibraryQuickAdd() {
  const showNotification = useNotificationStore((state) => state.showNotification);
  const pendingTrackIdsRef = useRef<Set<string>>(new Set());
  const [pendingTrackIds, setPendingTrackIds] = useState<Set<string>>(new Set());

  const quickAddToLibrary = useCallback(async (track: Pick<Track, "id" | "title">) => {
    if (!track.id || pendingTrackIdsRef.current.has(track.id)) {
      return;
    }

    pendingTrackIdsRef.current.add(track.id);
    setPendingTrackIds(new Set(pendingTrackIdsRef.current));

    try {
      const result = await saveTrackToLibrary(track.id);

      if (result === "already-saved") {
        showNotification({
          tone: "success",
          message: `"${track.title}" is already in your Library.`,
        });
        return;
      }

      showNotification({
        tone: "success",
        message: `Added "${track.title}" to your Library.`,
      });
    } catch (error) {
      console.error("Failed to quick add track to library:", error);
      showNotification({
        tone: "error",
        message: `Couldn't add "${track.title}" to your Library.`,
      });
    } finally {
      pendingTrackIdsRef.current.delete(track.id);
      setPendingTrackIds(new Set(pendingTrackIdsRef.current));
    }
  }, [showNotification]);

  return {
    quickAddToLibrary,
    pendingTrackIds,
  };
}
