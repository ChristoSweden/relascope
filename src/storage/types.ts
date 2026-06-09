import type { BorderlinePolicy, TreeObservation } from "../domain/relascope";

/** A single geotagged sample point and its raw sweep data (PRD §5.5). */
export interface SamplePoint {
  id: string;
  createdAt: string; // ISO timestamp
  baf: number;
  borderlinePolicy: BorderlinePolicy;
  trees: TreeObservation[];
  /** GPS captured at sweep start. */
  lat: number | null;
  lng: number | null;
  /** Reported GPS accuracy in metres, if available. */
  accuracyM: number | null;
  /** Compass heading at sweep start, degrees, if available. */
  startHeadingDeg: number | null;
  notes: string;
}

/** A stand groups several sample points for aggregation (PRD §5.4). */
export interface Stand {
  id: string;
  name: string;
  createdAt: string;
  points: SamplePoint[];
}

export type Units = "metric"; // v1 is metric-only (PRD §8).
export type Language = "en" | "sv";

/** Persisted user settings. */
export interface Settings {
  /** Calibrated horizontal field of view in degrees (PRD §5.1). */
  hfovDeg: number;
  /** Whether the HFOV came from guided calibration vs the default estimate. */
  calibrated: boolean;
  defaultBaf: number;
  borderlinePolicy: BorderlinePolicy;
  language: Language;
  units: Units;
}

export const DEFAULT_SETTINGS: Settings = {
  // Typical rear-camera HFOV; the app nudges the user to calibrate for accuracy.
  hfovDeg: 65,
  calibrated: false,
  defaultBaf: 2, // Nordic default (PRD §8).
  borderlinePolicy: "half",
  language: "en",
  units: "metric",
};

export const BAF_PRESETS = [1, 2, 4] as const;
