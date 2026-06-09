import { DEFAULT_SETTINGS, type Settings, type Stand } from "./types";

// Whole-device backup/restore. All data lives in localStorage on one phone, so
// a lost or reset phone means lost measurements; a backup file (kept in email,
// a drive, anywhere) is the non-technical owner's safety net.

export interface Backup {
  app: "relascope";
  version: 1;
  exportedAt: string;
  stands: Stand[];
  settings: Settings;
}

export function backupToJson(stands: Stand[], settings: Settings): string {
  const backup: Backup = {
    app: "relascope",
    version: 1,
    exportedAt: new Date().toISOString(),
    stands,
    settings,
  };
  return JSON.stringify(backup, null, 2);
}

/**
 * Parse and validate a backup file. Throws on anything that is not a relascope
 * backup; settings are merged over defaults so a backup from an older app
 * version restores cleanly.
 */
export function parseBackup(text: string): { stands: Stand[]; settings: Settings } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("Not valid JSON.");
  }
  const b = raw as Partial<Backup>;
  if (b?.app !== "relascope" || !Array.isArray(b.stands)) {
    throw new Error("Not a relascope backup.");
  }
  for (const s of b.stands) {
    if (typeof s?.id !== "string" || typeof s?.name !== "string" || !Array.isArray(s?.points)) {
      throw new Error("Backup contains an invalid stand.");
    }
  }
  return {
    stands: b.stands,
    settings: { ...DEFAULT_SETTINGS, ...(b.settings ?? {}) },
  };
}
