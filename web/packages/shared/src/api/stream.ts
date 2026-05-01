import { api } from "./client";
import type { StreamUrl } from "../types";

export const streamApi = {
  getStreamUrl: (trackId: string) =>
    api.get<StreamUrl>(`/stream/${trackId}`),
};
