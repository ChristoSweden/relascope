// PRD conformance — a single, table-driven proof that the shipped domain math
// reproduces the Digital Relascope PRD's published reference values end to end.
//
// relascope.test.ts already unit-tests each helper in depth; this file is the
// at-a-glance "does the output match the PRD" sheet: §2 reference table, §5.3
// per-point metrics, §5.4 stand aggregation, plus the species-share and volume
// shortcuts. Every expected value here is derived by hand from the PRD formulas,
// independently of the implementation.
import { describe, it, expect } from "vitest";
import {
  criticalAngleDeg,
  distanceDiameterRatio,
  limitingDistanceM,
  computePointMetrics,
  aggregateStand,
  speciesBreakdown,
  treeBasalAreaM2,
  estimateVolumePerHa,
  type TreeObservation,
} from "./relascope";

const mk = (call: TreeObservation["call"], species?: TreeObservation["species"]): TreeObservation => ({
  call,
  species,
});

describe("PRD conformance — published reference values", () => {
  // PRD §2: θ = 2·asin(√(BAF/2500)) and k = 50/√BAF.
  it.each([
    [1, 2.292, 50.0],
    [2, 3.242, 35.36],
    [4, 4.585, 25.0],
  ])("§2 BAF %d → critical angle and distance:diameter ratio", (baf, angle, k) => {
    expect(criticalAngleDeg(baf)).toBeCloseTo(angle, 2);
    expect(distanceDiameterRatio(baf)).toBeCloseTo(k, 2);
  });

  it("§2 limiting horizontal distance (BAF 2, 30 cm DBH ≈ 10.61 m)", () => {
    expect(limitingDistanceM(2, 30)).toBeCloseTo(10.607, 2);
  });

  // PRD §5.3: G = BAF × effective count, with borderlines counted as ½.
  it.each([
    // [label, in, borderline, baf, expectedEff, expectedG]
    ["4 IN + 1 BORD @ BAF 2", 4, 1, 2, 4.5, 9.0],
    ["5 IN @ BAF 4", 5, 0, 4, 5, 20],
    ["5 IN @ BAF 1", 5, 0, 1, 5, 5],
  ])("§5.3 %s → G = BAF × N", (_label, inN, bordN, baf, eff, g) => {
    const trees = [
      ...Array.from({ length: inN }, () => mk("in")),
      ...Array.from({ length: bordN }, () => mk("borderline")),
      mk("out"),
    ];
    const m = computePointMetrics(trees, baf, "half");
    expect(m.effectiveCount).toBe(eff);
    expect(m.basalAreaPerHa).toBe(g);
  });

  it("§5.3 stems/ha and quadratic mean DBH from per-tree diameters", () => {
    const trees: TreeObservation[] = [
      { call: "in", dbhCm: 30 },
      { call: "in", dbhCm: 30 },
      { call: "in", dbhCm: 30 },
    ];
    const m = computePointMetrics(trees, 2, "half");
    // Each counted tree represents BAF / g_i stems/ha; g(30 cm) = π/4·0.3².
    expect(m.stemsPerHa!).toBeCloseTo((3 * 2) / treeBasalAreaM2(30), 2);
    expect(m.quadraticMeanDbhCm!).toBeCloseTo(30, 5);
  });

  // PRD §5.4: mean basal area with spread (SD, SE, CV) across sample points.
  it("§5.4 stand aggregation of readings 6, 8, 10, 12 m²/ha", () => {
    const a = aggregateStand([6, 8, 10, 12]);
    expect(a.meanBasalAreaPerHa).toBeCloseTo(9.0, 5);
    expect(a.stdDev).toBeCloseTo(2.582, 2);
    expect(a.standardError).toBeCloseTo(1.291, 2);
    expect(a.coefficientOfVariationPct).toBeCloseTo(28.69, 1);
  });

  // In an angle count every counted tree is one BAF, so species share of the
  // effective count IS the species share of basal area.
  it("species share follows the effective count (in = 1, borderline = ½)", () => {
    const b = speciesBreakdown([mk("in", "pine"), mk("in", "pine"), mk("in", "spruce"), mk("borderline", "spruce")]);
    expect(b.effectiveCounts.pine).toBe(2);
    expect(b.effectiveCounts.spruce).toBe(1.5);
  });

  // Classic relascope volume shortcut V ≈ F·G·H with F = 0.5.
  it("volume shortcut V = F·G·H (G 25, H 20 → 250 m³/ha)", () => {
    expect(estimateVolumePerHa(25, 20)!).toBeCloseTo(250, 5);
  });
});
