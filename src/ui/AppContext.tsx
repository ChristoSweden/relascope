import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  loadSettings,
  loadStands,
  saveSettings,
  saveStands,
  upsertStand as upsertStandFn,
  deleteStand as deleteStandFn,
} from "../storage/store";
import { DEFAULT_SETTINGS, type Settings, type Stand } from "../storage/types";
import { detectLanguage, translate } from "../i18n/strings";

interface AppState {
  stands: Stand[];
  settings: Settings;
  upsertStand: (stand: Stand) => void;
  deleteStand: (id: string) => void;
  updateSettings: (patch: Partial<Settings>) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

const AppContext = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [stands, setStands] = useState<Stand[]>(() => loadStands());
  const [settings, setSettings] = useState<Settings>(() => {
    const loaded = loadSettings();
    // First run: pick up the device language unless the user has set one.
    if (loaded === DEFAULT_SETTINGS || !localStorage.getItem("relascope.settings.v1")) {
      return { ...loaded, language: detectLanguage() };
    }
    return loaded;
  });

  useEffect(() => saveStands(stands), [stands]);
  useEffect(() => saveSettings(settings), [settings]);

  const upsertStand = useCallback((stand: Stand) => {
    setStands((prev) => upsertStandFn(prev, stand));
  }, []);

  const deleteStand = useCallback((id: string) => {
    setStands((prev) => deleteStandFn(prev, id));
  }, []);

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
  }, []);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => translate(settings.language, key, vars),
    [settings.language],
  );

  const value = useMemo<AppState>(
    () => ({ stands, settings, upsertStand, deleteStand, updateSettings, t }),
    [stands, settings, upsertStand, deleteStand, updateSettings, t],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppState {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
