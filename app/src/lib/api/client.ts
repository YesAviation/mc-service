import { useServerStore } from '@/lib/servers/store';
import { useAuthStore } from '@/lib/auth/store';
import type { AuthResponse } from './types';

export class ApiError extends Error {
  status: number;
  code: number;
  constructor(status: number, code: number, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

type RequestOptions = RequestInit & {
  json?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  skipAuth?: boolean;
  baseUrlOverride?: string;
};

function buildUrl(base: string, path: string, query?: RequestOptions['query']): string {
  const url = new URL(path.startsWith('/') ? path : `/${path}`, base.endsWith('/') ? base : `${base}/`);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || v === null) continue;
      url.searchParams.set(k, String(v));
    }
  }
  return url.toString();
}

let refreshInFlight: Promise<string | null> | null = null;

async function refreshTokens(): Promise<string | null> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    const refresh = useAuthStore.getState().refreshToken;
    const server = useServerStore.getState().active();
    if (!refresh || !server) return null;
    try {
      const res = await fetch(buildUrl(server.baseUrl, '/api/auth/refresh'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refresh }),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as AuthResponse;
      await useAuthStore.getState().updateTokens({
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
      });
      return data.access_token;
    } catch {
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

export async function apiRequest<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const server = useServerStore.getState().active();
  const baseUrl = opts.baseUrlOverride ?? server?.baseUrl;
  if (!baseUrl) throw new ApiError(0, 0, 'No active server');

  const url = buildUrl(baseUrl, path, opts.query);
  const headers = new Headers(opts.headers);
  if (opts.json !== undefined) headers.set('Content-Type', 'application/json');
  headers.set('Accept', 'application/json');

  if (!opts.skipAuth) {
    const access = useAuthStore.getState().accessToken;
    if (access) headers.set('Authorization', `Bearer ${access}`);
  }

  const init: RequestInit = {
    ...opts,
    headers,
    body: opts.json !== undefined ? JSON.stringify(opts.json) : opts.body,
  };

  let res = await fetch(url, init);

  if (res.status === 401 && !opts.skipAuth) {
    const newToken = await refreshTokens();
    if (newToken) {
      headers.set('Authorization', `Bearer ${newToken}`);
      res = await fetch(url, { ...init, headers });
    } else {
      await useAuthStore.getState().clear();
    }
  }

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;

  if (!res.ok) {
    const code = data?.error?.code ?? res.status;
    const message = data?.error?.message ?? res.statusText ?? 'Request failed';
    throw new ApiError(res.status, code, message);
  }

  return data as T;
}

export async function pingServer(baseUrl: string): Promise<boolean> {
  try {
    const res = await fetch(buildUrl(baseUrl, '/api/health'), { method: 'GET' });
    return res.ok;
  } catch {
    return false;
  }
}
