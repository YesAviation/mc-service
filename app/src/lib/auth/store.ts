import { create } from 'zustand';
import { secureStorage, kvStorage } from '@/lib/storage';
import type { AuthUser } from '@/lib/api/types';

const TOKEN_KEY = 'music.auth.access.v1';
const REFRESH_KEY = 'music.auth.refresh.v1';
const USER_KEY = 'music.auth.user.v1';

type AuthState = {
  accessToken: string | null;
  refreshToken: string | null;
  user: AuthUser | null;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  setSession: (s: { accessToken: string; refreshToken: string; user: AuthUser | null }) => Promise<void>;
  updateTokens: (s: { accessToken: string; refreshToken: string }) => Promise<void>;
  clear: () => Promise<void>;
};

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  refreshToken: null,
  user: null,
  hydrated: false,
  hydrate: async () => {
    const [accessToken, refreshToken, userRaw] = await Promise.all([
      secureStorage.get(TOKEN_KEY),
      secureStorage.get(REFRESH_KEY),
      kvStorage.get(USER_KEY),
    ]);
    set({
      accessToken,
      refreshToken,
      user: userRaw ? JSON.parse(userRaw) : null,
      hydrated: true,
    });
  },
  setSession: async ({ accessToken, refreshToken, user }) => {
    await Promise.all([
      secureStorage.set(TOKEN_KEY, accessToken),
      secureStorage.set(REFRESH_KEY, refreshToken),
      user ? kvStorage.set(USER_KEY, JSON.stringify(user)) : kvStorage.remove(USER_KEY),
    ]);
    set({ accessToken, refreshToken, user });
  },
  updateTokens: async ({ accessToken, refreshToken }) => {
    await Promise.all([
      secureStorage.set(TOKEN_KEY, accessToken),
      secureStorage.set(REFRESH_KEY, refreshToken),
    ]);
    set({ accessToken, refreshToken });
  },
  clear: async () => {
    await Promise.all([
      secureStorage.remove(TOKEN_KEY),
      secureStorage.remove(REFRESH_KEY),
      kvStorage.remove(USER_KEY),
    ]);
    set({ accessToken: null, refreshToken: null, user: null });
  },
}));
