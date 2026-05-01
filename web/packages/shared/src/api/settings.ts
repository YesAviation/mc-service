import { api } from "./client";
import type {
  MediaProcessingSettings,
  StartMediaPrewarmResponse,
  UpdateMediaProcessingSettingsRequest,
} from "../types";

export const mediaSettingsApi = {
  getMediaProcessingSettings: async (): Promise<MediaProcessingSettings> => {
    return api.get<MediaProcessingSettings>("/settings/media-processing");
  },

  updateMediaProcessingSettings: async (
    request: UpdateMediaProcessingSettingsRequest,
  ): Promise<MediaProcessingSettings> => {
    return api.put<MediaProcessingSettings>("/settings/media-processing", request);
  },

  startManualPrewarm: async (): Promise<StartMediaPrewarmResponse> => {
    return api.post<StartMediaPrewarmResponse>("/settings/media-processing/prewarm");
  },
};
