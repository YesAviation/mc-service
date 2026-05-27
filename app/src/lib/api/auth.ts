import { apiRequest } from './client';
import type { AuthResponse } from './types';

export const authApi = {
  login: (body: { username: string; password: string; remember_me?: boolean }) =>
    apiRequest<AuthResponse>('/api/auth/login', { method: 'POST', json: body, skipAuth: true }),
  register: (body: { username: string; email: string; password: string }) =>
    apiRequest<AuthResponse>('/api/auth/register', { method: 'POST', json: body, skipAuth: true }),
  refresh: (refresh_token: string) =>
    apiRequest<AuthResponse>('/api/auth/refresh', {
      method: 'POST',
      json: { refresh_token },
      skipAuth: true,
    }),
};
