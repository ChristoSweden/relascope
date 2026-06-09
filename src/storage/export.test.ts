import { describe, it, expect } from "vitest";
import { standToCsv } from "./export";
import type { Stand } from "./types";

const stand: Stand = {
  id: "s1",
  name: "Export Test",
  createdAt: "2026-06-01T08:00:00.000Z",
  meanHeightM: 20,
  points: [
    {
      id: "p1",
      createdAt: "2026-06-01T08:10:00.000Z",
      baf: 2,
      borderlinePolicy: "half",
      trees: [
        { call: "in", species: "pine" },
        { call: "in", species: "spruce" },
        { call: "borderline", species: "pine" },
        { call: "in" },
      ],
      lat: null,
      lng: null,
      accuracyM: null,
      startHeadingDeg: null,
      notes: "",
    },
  ],
};

describe("CSV export", () => {
  it("includes species effective counts and the volume estimate", () => {
    const [header, row] = standToCsv(stand).split("\n");
    const cols = header.split(",");
    const vals = row.split(",");
    const get = (name: string) => vals[cols.indexOf(name)];

    expect(get("pine_eff_count")).toBe("1.5");
    expect(get("spruce_eff_count")).toBe("1");
    expect(get("deciduous_eff_count")).toBe("0");
    expect(get("unspecified_eff_count")).toBe("1");
    // G = 2 × 3.5 = 7 m²/ha; V = 0.5 × 7 × 20 = 70 m³/ha.
    expect(get("basal_area_per_ha_m2")).toBe("7");
    expect(get("volume_per_ha_m3_estimate")).toBe("70");
  });

  it("leaves volume empty when the stand has no mean height", () => {
    const noHeight = { ...stand, meanHeightM: null };
    const [header, row] = standToCsv(noHeight).split("\n");
    const cols = header.split(",");
    const vals = row.split(",");
    expect(vals[cols.indexOf("volume_per_ha_m3_estimate")]).toBe("");
  });
});
