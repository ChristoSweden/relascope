import { describe, it, expect } from "vitest";
import { backupToJson, parseBackup } from "./backup";
import { DEFAULT_SETTINGS, type Stand } from "./types";

const stand: Stand = {
  id: "s1",
  name: "North block",
  createdAt: "2026-06-09T10:00:00.000Z",
  points: [
    {
      id: "p1",
      createdAt: "2026-06-09T10:05:00.000Z",
      baf: 2,
      borderlinePolicy: "half",
      trees: [{ call: "in" }, { call: "borderline" }],
      lat: 59.1,
      lng: 17.2,
      accuracyM: 5,
      startHeadingDeg: 120,
      notes: "by the rock",
    },
  ],
};

describe("backup round trip", () => {
  it("restores stands and settings exactly", () => {
    const json = backupToJson([stand], { ...DEFAULT_SETTINGS, hfovDeg: 71.3, calibrated: true });
    const restored = parseBackup(json);
    expect(restored.stands).toEqual([stand]);
    expect(restored.settings.hfovDeg).toBe(71.3);
    expect(restored.settings.calibrated).toBe(true);
  });

  it("merges missing settings keys over defaults (older backups)", () => {
    const json = JSON.stringify({
      app: "relascope",
      version: 1,
      exportedAt: "x",
      stands: [],
      settings: { hfovDeg: 70 },
    });
    const restored = parseBackup(json);
    expect(restored.settings.hfovDeg).toBe(70);
    expect(restored.settings.defaultBaf).toBe(DEFAULT_SETTINGS.defaultBaf);
    expect(restored.settings.sunlightMode).toBe(false);
  });

  it("rejects non-JSON, foreign JSON and malformed stands", () => {
    expect(() => parseBackup("not json")).toThrow();
    expect(() => parseBackup('{"hello":"world"}')).toThrow();
    expect(() =>
      parseBackup(JSON.stringify({ app: "relascope", stands: [{ id: 1 }] })),
    ).toThrow();
  });
});
