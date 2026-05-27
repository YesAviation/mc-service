import { create } from 'zustand';
import { kvStorage } from '@/lib/storage';

const SERVERS_KEY = 'music.servers.v1';
const ACTIVE_KEY = 'music.servers.active.v1';

export type SavedServer = {
  id: string;
  name: string;
  baseUrl: string;
  addedAt: string;
};

type ServerState = {
  servers: SavedServer[];
  activeId: string | null;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  add: (server: Omit<SavedServer, 'id' | 'addedAt'>) => Promise<SavedServer>;
  remove: (id: string) => Promise<void>;
  setActive: (id: string | null) => Promise<void>;
  active: () => SavedServer | null;
};

export const useServerStore = create<ServerState>((set, get) => ({
  servers: [],
  activeId: null,
  hydrated: false,
  hydrate: async () => {
    const [rawServers, activeId] = await Promise.all([
      kvStorage.get(SERVERS_KEY),
      kvStorage.get(ACTIVE_KEY),
    ]);
    const servers: SavedServer[] = rawServers ? JSON.parse(rawServers) : [];
    set({ servers, activeId: activeId ?? null, hydrated: true });
  },
  add: async (input) => {
    const trimmed = input.baseUrl.replace(/\/+$/, '');
    const server: SavedServer = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: input.name || trimmed,
      baseUrl: trimmed,
      addedAt: new Date().toISOString(),
    };
    const next = [...get().servers, server];
    await kvStorage.set(SERVERS_KEY, JSON.stringify(next));
    if (!get().activeId) {
      await kvStorage.set(ACTIVE_KEY, server.id);
      set({ activeId: server.id });
    }
    set({ servers: next });
    return server;
  },
  remove: async (id) => {
    const next = get().servers.filter((s) => s.id !== id);
    await kvStorage.set(SERVERS_KEY, JSON.stringify(next));
    let activeId = get().activeId;
    if (activeId === id) {
      activeId = next[0]?.id ?? null;
      if (activeId) await kvStorage.set(ACTIVE_KEY, activeId);
      else await kvStorage.remove(ACTIVE_KEY);
    }
    set({ servers: next, activeId });
  },
  setActive: async (id) => {
    if (id) await kvStorage.set(ACTIVE_KEY, id);
    else await kvStorage.remove(ACTIVE_KEY);
    set({ activeId: id });
  },
  active: () => {
    const { servers, activeId } = get();
    return servers.find((s) => s.id === activeId) ?? null;
  },
}));
