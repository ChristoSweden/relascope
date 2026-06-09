import { describe, it, expect } from "vitest";
import {
  criticalAngleDeg,
  distanceDiameterRatio,
  gaugeBarWidthPx,
  hfovFromCalibration,
  effectiveCount,
  treeBasalAreaM2,
  computePointMetrics,
  aggregateStand,
  type TreeObservation,
} from "./relascope";

describe("critical angle and k-ratio (PRD §2 reference table)", () => {
  it("matches the published critical angles", () => {
    expect(criticalAngleDeg(1)).toBeCloseTo(2.292, 2);
    expect(criticalAngleDeg(2)).toBeCloseTo(3.242, 2);
    expect(criticalAngleDeg(4)).toBeCloseTo(4.585, 2);
  });

  it("matches the published distance:diameter ratios", () => {
    expect(distanceDiameterRatio(1)).toBeCloseTo(50.0, 5);
    expect(distanceDiameterRatio(2)).toBeCloseTo(35.36, 2);
    expect(distanceDiameterRatio(4)).toBeCloseTo(25.0, 5);
  });
});

describe("gauge bar width", () => {
  it("scales with viewport width and inversely with HFOV", () => {
    // 65° HFOV across 1000px → 0.065 deg/px. BAF 2 angle ≈ 3.242° → ≈ 49.9px.
    const w = gaugeBarWidthPx(2, 65, 1000);
    expect(w).toBeCloseTo(criticalAngleDeg(2) / (65 / 1000), 5);
    expect(w).toBeGreaterThan(40);
    expect(w).toBeLessThan(60);
  });

  it("returns 0 for invalid inputs", () => {
    expect(gaugeBarWidthPx(2, 0, 1000)).toBe(0);
    expect(gaugeBarWidthPx(2, 65, 0)).toBe(0);
  });
});

describe("HFOV calibration", () => {
  it("recovers a known HFOV from a reference object", () => {
    // An object 1m wide at 5m subtends 2·atan(0.5/5) ≈ 11.42°.
    // If it spans 200px of a 1000px frame, HFOV ≈ 11.42 · 1000/200 ≈ 57.1°.
    const hfov = hfovFromCalibration({
      objectWidthM: 1,
      distanceM: 5,
      objectPx: 200,
      viewportWidthPx: 1000,
    });
    expect(hfov).toBeCloseTo(57.1, 0);
  });

  it("rejects non-positive inputs", () => {
    expect(() =>
      hfovFromCalibration({ objectWidthM: 1, distanceM: 0, objectPx: 10, viewportWidthPx: 100 }),
    ).toThrow();
  });
});

describe("effective count and basal area", () => {
  const trees: TreeObservation[] = [
    { call: "in" },
    { call: "in" },
    { call: "in" },
    { call: "borderline" },
    { call: "borderline" },
    { call: "out" },
  ];

  it("counts borderlines as half", () => {
    expect(effectiveCount(trees, "half")).toBe(4); // 3 + 2/2
  });

  it("computes G = BAF × N", () => {
    const m = computePointMetrics(trees, 2, "half");
    expect(m.basalAreaPerHa).toBe(8); // 2 × 4
    expect(m.inCount).toBe(3);
    expect(m.borderlineCount).toBe(2);
    expect(m.outCount).toBe(1);
  });

  it("omits diameter-derived metrics when no DBH given", () => {
    const m = computePointMetrics(trees, 2, "half");
    expect(m.stemsPerHa).toBeNull();
    expect(m.meanDbhCm).toBeNull();
    expect(m.hasDiameterEstimates).toBe(false);
  });
});

describe("tree basal area", () => {
  it("computes π/4·d² in m²", () => {
    // 30cm DBH → π/4 · 0.3² ≈ 0.0707 m².
    expect(treeBasalAreaM2(30)).toBeCloseTo(0.0707, 4);
  });
});

describe("stems/ha and DBH estimates", () => {
  it("derives stems/ha from per-tree DBH", () => {
    const trees: TreeObservation[] = [
      { call: "in", dbhCm: 30 },
      { call: "in", dbhCm: 30 },
    ];
    const m = computePointMetrics(trees, 2, "half");
    // Each 30cm tree → 2 / 0.0707 ≈ 28.3 stems/ha; two trees ≈ 56.6.
    expect(m.stemsPerHa).toBeCloseTo((2 * 2) / treeBasalAreaM2(30), 2);
    expect(m.meanDbhCm).toBe(30);
    expect(m.quadraticMeanDbhCm).toBeCloseTo(30, 5);
    expect(m.hasDiameterEstimates).toBe(true);
  });
});

describe("stand aggregation (PRD §5.4)", () => {
  it("returns zeros for an empty stand", () => {
    const a = aggregateStand([]);
    expect(a.pointCount).toBe(0);
    expect(a.meanBasalAreaPerHa).toBe(0);
  });

  it("computes mean, spread and a point recommendation", () => {
    const a = aggregateStand([8, 10, 12, 6]);
    expect(a.pointCount).toBe(4);
    expect(a.meanBasalAreaPerHa).toBe(9);
    expect(a.stdDev).toBeCloseTo(2.582, 2);
    expect(a.standardError).toBeCloseTo(1.291, 2);
    expect(a.coefficientOfVariationPct).toBeCloseTo(28.69, 1);
    // CV ≈ 28.7%, target 10% → need ≈ 9 points, have 4 → suggest 5 more.
    expect(a.suggestedAdditionalPoints).toBe(5);
  });

  it("suggests no extra points when readings are tight", () => {
    const a = aggregateStand([10, 10, 10]);
    expect(a.coefficientOfVariationPct).toBe(0);
    expect(a.suggestedAdditionalPoints).toBe(0);
  });
});
