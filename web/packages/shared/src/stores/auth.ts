import { create } from "zustand";
import { setAccessToken, setUnauthorizedHandler } from "../api/client";
import { authApi } from "../api/auth";
import type { User, LoginRequest, RegisterRequest } from "../types";

const ACCESS_TOKEN_KEY = "access_token";
const REFRESH_TOKEN_KEY = "refresh_token";
const USER_KEY = "user";

function clearStoredSession() {
  if (typeof window === "undefined") {
    return;
  }

  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

function decodeJwtPayload(token: string): { exp?: number } | null {
  const parts = token.split(".");
  if (parts.length !== 3) {
    return null;
  }

  try {
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    const decoded = atob(padded);
    return JSON.parse(decoded) as { exp?: number };
  } catch {
    return null;
  }
}

function isJwtExpired(token: string): boolean {
  const payload = decodeJwtPayload(token);
  if (!payload?.exp) {
    return true;
  }

  const now = Math.floor(Date.now() / 1000);
  return payload.exp <= now;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (data: LoginRequest) => Promise<void>;
  register: (data: RegisterRequest) => Promise<void>;
  logout: () => void;
  restoreSession: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => {
  const clearAuthState = () => {
    setAccessToken(null);
    clearStoredSession();
    set({ user: null, isAuthenticated: false, isLoading: false });
  };

  setUnauthorizedHandler(() => {
    clearAuthState();
  });

  return {
    user: null,
    isAuthenticated: false,
    isLoading: false,

    login: async (data) => {
      set({ isLoading: true });
      try {
        const res = await authApi.login(data);
        setAccessToken(res.access_token);
        localStorage.setItem(ACCESS_TOKEN_KEY, res.access_token);
        localStorage.setItem(REFRESH_TOKEN_KEY, res.refresh_token);
        localStorage.setItem(USER_KEY, JSON.stringify(res.user));
        set({ user: res.user, isAuthenticated: true, isLoading: false });
      } catch {
        set({ isLoading: false });
        throw new Error("Login failed");
      }
    },

    register: async (data) => {
      set({ isLoading: true });
      try {
        const res = await authApi.register(data);
        setAccessToken(res.access_token);
        localStorage.setItem(ACCESS_TOKEN_KEY, res.access_token);
        localStorage.setItem(REFRESH_TOKEN_KEY, res.refresh_token);
        localStorage.setItem(USER_KEY, JSON.stringify(res.user));
        set({ user: res.user, isAuthenticated: true, isLoading: false });
      } catch {
        set({ isLoading: false });
        throw new Error("Registration failed");
      }
    },

    logout: () => {
      clearAuthState();
    },

    restoreSession: async () => {
      const token = localStorage.getItem(ACCESS_TOKEN_KEY);
      const userJson = localStorage.getItem(USER_KEY);
      const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);

      if (token && userJson && !isJwtExpired(token)) {
        try {
          const user = JSON.parse(userJson) as User;
          setAccessToken(token);
          set({ user, isAuthenticated: true });
          return;
        } catch {
          // Fall through to refresh-token path.
        }
      }

      if (!refreshToken) {
        clearAuthState();
        return;
      }

      set({ isLoading: true });
      try {
        const res = await authApi.refresh({ refresh_token: refreshToken });
        setAccessToken(res.access_token);
        localStorage.setItem(ACCESS_TOKEN_KEY, res.access_token);
        localStorage.setItem(REFRESH_TOKEN_KEY, res.refresh_token);
        localStorage.setItem(USER_KEY, JSON.stringify(res.user));
        set({ user: res.user, isAuthenticated: true, isLoading: false });
      } catch {
        clearAuthState();
      }
    },
  };
});
