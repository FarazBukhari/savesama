import type { ItemType, Job, Mode, ServerInfo } from '@/lib/api';
import type { Platform } from '@/lib/links';
import type { Transfer } from '@/lib/jobState';
import type { PairInfo } from '@/lib/pairing';
import type { Quality } from '@/lib/quality';

import { createStore } from './createStore';
import { loadJson, persistStore } from './persist';

// ---------- settings ----------

export type ThemePref = 'system' | 'light' | 'dark';

export interface Settings {
  theme: ThemePref;
  defaultMode: Mode;
  quality: Record<Platform, Quality>;
  keepOnServer: boolean;
  warnDuplicate: boolean;
  haptics: boolean;
  onboarded: boolean;
  dismissedClipboard: string[];
  lastResolved: string | null;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  defaultMode: 'media',
  quality: { youtube: 'max', instagram: 'max', tiktok: 'max', facebook: 'max', threads: 'max' },
  keepOnServer: false,
  warnDuplicate: true,
  haptics: true,
  onboarded: false,
  dismissedClipboard: [],
  lastResolved: null,
};

export const settingsStore = createStore<Settings>(DEFAULT_SETTINGS);

// ---------- servers ----------

export interface SavedServer {
  id: string;
  name: string;
  host: string;
  port: number;
  addedAt: number;
  lastSeen: number | null;
}

export type ServerStatus = 'checking' | 'online' | 'offline' | 'unauthorized' | 'updating';

export interface ServersState {
  servers: SavedServer[];
  activeId: string | null;
  tokens: Record<string, string>;
  status: Record<string, ServerStatus>;
  info: Record<string, ServerInfo>;
  /** A SaveSama server answering on 127.0.0.1:8765 that isn't saved yet. */
  discovered: ServerInfo | null;
}

export const serversStore = createStore<ServersState>({
  servers: [],
  activeId: null,
  tokens: {},
  status: {},
  info: {},
  discovered: null,
});

export function activeServer(s: ServersState = serversStore.get()): SavedServer | null {
  return s.servers.find((x) => x.id === s.activeId) ?? null;
}

// ---------- history ----------

export interface LinkRecord {
  key: string;
  url: string;
  platform: Platform;
  title: string | null;
  author?: string | null;
  savedAt: number;
}

export interface SavedFile {
  jobId: string;
  assetId: string | null;
  /** Local uri for the web build or when the gallery isn't available. */
  uri: string | null;
  url: string;
  platform: Platform;
  title: string | null;
  author: string | null;
  thumbnail: string | null;
  type: ItemType;
  mime: string;
  name: string;
  size: number;
  mode: Mode;
  quality: Quality;
  savedAt: number;
}

export interface HistoryState {
  links: LinkRecord[];
  saves: SavedFile[];
}

export const historyStore = createStore<HistoryState>({ links: [], saves: [] });

// ---------- jobs ----------

export interface JobsState {
  jobs: Job[];
  transfers: Record<string, Transfer>;
  /** Job ids the user cleared or that were deleted on the server; hidden from lists. */
  hidden: string[];
  lastSync: number | null;
  syncError: string | null;
  /** Saves older than this are hidden from Activity → Done (Clear finished). */
  clearedBefore: number;
}

export const jobsStore = createStore<JobsState>({ jobs: [], transfers: {}, hidden: [], lastSync: null, syncError: null, clearedBefore: 0 });

// ---------- ui overlays ----------

export interface BatchEdit {
  items: number[] | null;
  mode: Mode;
  quality: Quality;
}

export type Sheet =
  | { kind: 'preview'; url: string; batch?: boolean }
  | { kind: 'batch'; urls: string[] }
  | { kind: 'pair' }
  | { kind: 'pairConfirm'; info: PairInfo }
  | { kind: 'restart' }
  | { kind: 'quality'; platform: Platform }
  | { kind: 'info'; key: string }
  | { kind: 'rename'; id: string }
  | { kind: 'serverMenu'; id: string };

export interface Dialog {
  title: string;
  body: string;
  confirm: string;
  destructive?: boolean;
  onConfirm: () => void;
}

export interface Snack {
  id: number;
  text: string;
  action?: { label: string; onPress: () => void };
}

export interface UiState {
  sheets: Sheet[];
  dialog: Dialog | null;
  snack: Snack | null;
  batchEdits: Record<string, BatchEdit>;
  /** Text handed to the Grab field (share intent with no supported link, recent row). */
  fieldText: string | null;
}

export const uiStore = createStore<UiState>({ sheets: [], dialog: null, snack: null, batchEdits: {}, fieldText: null });

// ---------- hydration ----------

const KEYS = {
  settings: 'savesama.settings.v1',
  servers: 'savesama.servers.v1',
  history: 'savesama.history.v1',
  jobs: 'savesama.jobs.v1',
};

/** Hidden job ids double as delete tombstones, so keep enough to outlive a server's job list. */
const HIDDEN_CAP = 5000;

export async function hydrate(getToken: (id: string) => Promise<string | null>): Promise<void> {
  const [settings, servers, history, jobs] = await Promise.all([
    loadJson<Partial<Settings>>(KEYS.settings),
    loadJson<{ servers: SavedServer[]; activeId: string | null }>(KEYS.servers),
    loadJson<HistoryState>(KEYS.history),
    loadJson<{ hidden: string[]; clearedBefore?: number }>(KEYS.jobs),
  ]);
  if (settings) {
    settingsStore.set({ ...DEFAULT_SETTINGS, ...settings, quality: { ...DEFAULT_SETTINGS.quality, ...settings.quality } });
  }
  if (servers?.servers) {
    const tokens: Record<string, string> = {};
    await Promise.all(
      servers.servers.map(async (s) => {
        const t = await getToken(s.id);
        if (t) tokens[s.id] = t;
      }),
    );
    serversStore.set({ servers: servers.servers, activeId: servers.activeId, tokens });
  }
  if (history) historyStore.set({ links: history.links ?? [], saves: history.saves ?? [] });
  if (jobs?.hidden) jobsStore.set({ hidden: jobs.hidden.slice(-HIDDEN_CAP), clearedBefore: jobs.clearedBefore ?? 0 });

  persistStore(settingsStore, KEYS.settings, (s) => s);
  persistStore(serversStore, KEYS.servers, (s) => ({ servers: s.servers, activeId: s.activeId }));
  persistStore(historyStore, KEYS.history, (s) => ({ links: s.links.slice(0, 2000), saves: s.saves.slice(0, 5000) }));
  persistStore(jobsStore, KEYS.jobs, (s) => ({ hidden: s.hidden.slice(-HIDDEN_CAP), clearedBefore: s.clearedBefore }));
}
