import { apiRequest } from './client';
import type { StreamUrl } from './types';

export const streamApi = {
  getUrl: (trackId: string) => apiRequest<StreamUrl>(`/api/stream/${trackId}`),
};
