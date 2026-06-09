import { DEFAULT_SETTINGS, type Settings, type Stand, type SamplePoint } from "./types";

// Local-first storage (PRD §5.5, §6): everything lives on-device in
// localStorage. Volumes are tiny (counts + coordinates), so JSON is plenty and
// it works with zero network and zero runtime dependencies.

const STANDS_KEY = "relascope.stands.v1";
const SETTINGS_KEY = "relascope.settings.v1";

export function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function loadStands(): Stand[] {
  return safeParse<Stand[]>(localStorage.getItem(STANDS_KEY), []);
}

export function saveStands(stands: Stand[]): void {
  localStorage.setItem(STANDS_KEY, JSON.stringify(stands));
}

export function loadSettings(): Settings {
  return { ...DEFAULT_SETTINGS, ...safeParse<Partial<Settings>>(localStorage.getItem(SETTINGS_KEY), {}) };
}

export function saveSettings(settings: Settings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export function getStand(stands: Stand[], id: string): Stand | undefined {
  return stands.find((s) => s.id === id);
}

export function upsertStand(stands: Stand[], stand: Stand): Stand[] {
  const idx = stands.findIndex((s) => s.id === stand.id);
  if (idx === -1) return [...stands, stand];
  const next = stands.slice();
  next[idx] = stand;
  return next;
}

export function deleteStand(stands: Stand[], id: string): Stand[] {
  return stands.filter((s) => s.id !== id);
}

export function addPoint(stand: Stand, point: SamplePoint): Stand {
  return { ...stand, points: [...stand.points, point] };
}

export function deletePoint(stand: Stand, pointId: string): Stand {
  return { ...stand, points: stand.points.filter((p) => p.id !== pointId) };
}
