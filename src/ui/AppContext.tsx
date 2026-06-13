import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  loadSettings,
  loadStands,
  saveSettings,
  saveStands,
  upsertStand as upsertStandFn,
  deleteStand as deleteStandFn,
  loadMeasurements,
  saveMeasurements,
  prependMeasurement,
  deleteMeasurementById,
} from "../storage/store";
import { DEFAULT_SETTINGS, type Settings, type Stand, type TreeMeasurement } from "../storage/types";
import { detectLanguage, translate } from "../i18n/strings";

interface AppState {
  stands: Stand[];
  measurements: TreeMeasurement[];
  settings: Settings;
  upsertStand: (stand: Stand) => void;
  deleteStand: (id: string) => void;
  updateSettings: (patch: Partial<Settings>) => void;
  saveMeasurement: (m: TreeMeasurement) => void;
  deleteMeasurement: (id: string) => void;
  /** Replace all on-device data at once (backup restore). */
  restoreAll: (stands: Stand[], settings: Settings) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

const AppContext = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [stands, setStands] = useState<Stand[]>(() => loadStands());
  const [measurements, setMeasurements] = useState<TreeMeasurement[]>(() => loadMeasurements());
  const [settings, setSettings] = useState<Settings>(() => {
    const loaded = loadSettings();
    if (loaded === DEFAULT_SETTINGS || !localStorage.getItem("relascope.settings.v1")) {
      return { ...loaded, language: detectLanguage() };
    }
    return loaded;
  });

  useEffect(() => saveStands(stands), [stands]);
  useEffect(() => saveSettings(settings), [settings]);
  useEffect(() => saveMeasurements(measurements), [measurements]);
  useEffect(() => {
    document.body.classList.toggle("sunlight", settings.sunlightMode);
  }, [settings.sunlightMode]);

  const upsertStand = useCallback((stand: Stand) => {
    setStands((prev) => upsertStandFn(prev, stand));
  }, []);

  const deleteStand = useCallback((id: string) => {
    setStands((prev) => deleteStandFn(prev, id));
  }, []);

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
  }, []);

  const saveMeasurement = useCallback((m: TreeMeasurement) => {
    setMeasurements((prev) => prependMeasurement(prev, m));
  }, []);

  const deleteMeasurement = useCallback((id: string) => {
    setMeasurements((prev) => deleteMeasurementById(prev, id));
  }, []);

  const restoreAll = useCallback((nextStands: Stand[], nextSettings: Settings) => {
    setStands(nextStands);
    setSettings(nextSettings);
  }, []);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => translate(settings.language, key, vars),
    [settings.language],
  );

  const value = useMemo<AppState>(
    () => ({ stands, measurements, settings, upsertStand, deleteStand, updateSettings, saveMeasurement, deleteMeasurement, restoreAll, t }),
    [stands, measurements, settings, upsertStand, deleteStand, updateSettings, saveMeasurement, deleteMeasurement, restoreAll, t],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppState {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
