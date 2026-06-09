import { describe, it, expect } from "vitest";
import {
  criticalAngleDeg,
  distanceDiameterRatio,
  limitingDistanceM,
  focalLengthPx,
  angleToFrameWidthPx,
  frameWidthToAngleDeg,
  slopeCorrectedCriticalAngleDeg,
  gaugeBarWidthPx,
  coverDisplayScale,
  hfovFromCalibration,
  checkCalibration,
  CALIBRATION_CHECK_TOLERANCE_PCT,
  effectiveCount,
  treeBasalAreaM2,
  computePointMetrics,
  aggregateStand,
  speciesBreakdown,
  aggregateSpecies,
  estimateVolumePerHa,
  STAND_FORM_FACTOR,
  treeHeightM,
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

  it("derives the limiting horizontal distance for a tree", () => {
    // BAF 2, 30cm DBH → 35.36 × 0.30 ≈ 10.6 m.
    expect(limitingDistanceM(2, 30)).toBeCloseTo(10.61, 1);
  });
});

describe("exact pinhole projection", () => {
  it("computes focal length from HFOV", () => {
    // 65° across 1920px → f = 960 / tan(32.5°) ≈ 1507px.
    expect(focalLengthPx(65, 1920)).toBeCloseTo(1507.3, 0);
  });

  it("round-trips angle ↔ frame width", () => {
    const w = angleToFrameWidthPx(3.242, 65, 1920);
    expect(frameWidthToAngleDeg(w, 65, 1920)).toBeCloseTo(3.242, 4);
  });

  it("uses tan, not the linear approximation", () => {
    // Exact: 2·f·tan(θ/2) with f from 65°/1000px.
    const exact = angleToFrameWidthPx(criticalAngleDeg(2), 65, 1000);
    const linear = criticalAngleDeg(2) / (65 / 1000);
    expect(exact).toBeCloseTo(44.4, 1);
    // They differ — the linear form is biased.
    expect(Math.abs(exact - linear)).toBeGreaterThan(4);
  });

  it("returns 0 for invalid inputs", () => {
    expect(angleToFrameWidthPx(3, 0, 1000)).toBe(0);
    expect(angleToFrameWidthPx(3, 65, 0)).toBe(0);
  });
});

describe("slope compensation", () => {
  it("does not change the angle on flat ground", () => {
    expect(slopeCorrectedCriticalAngleDeg(2, 0)).toBeCloseTo(criticalAngleDeg(2), 6);
  });

  it("narrows the threshold on a slope (so more trees count)", () => {
    const flat = criticalAngleDeg(2);
    const onSlope = slopeCorrectedCriticalAngleDeg(2, 30); // 30° up/down
    expect(onSlope).toBeLessThan(flat);
    expect(onSlope).toBeCloseTo(flat * Math.cos((30 * Math.PI) / 180), 6);
  });

  it("is symmetric for uphill and downhill", () => {
    expect(slopeCorrectedCriticalAngleDeg(2, 20)).toBeCloseTo(
      slopeCorrectedCriticalAngleDeg(2, -20),
      6,
    );
  });
});

describe("gauge bar width and display scaling", () => {
  it("scales native frame pixels to CSS via the cover factor", () => {
    const scale = coverDisplayScale(1920, 1080, 390, 844); // phone portrait
    const w = gaugeBarWidthPx({ baf: 2, hfovDeg: 65, frameWidthPx: 1920, displayScale: scale });
    const expectedFrame = angleToFrameWidthPx(criticalAngleDeg(2), 65, 1920);
    expect(w).toBeCloseTo(expectedFrame * scale, 4);
  });

  it("cover scale fills the larger dimension and degrades to 1 when unknown", () => {
    expect(coverDisplayScale(1000, 1000, 500, 250)).toBe(0.5);
    expect(coverDisplayScale(0, 0, 500, 250)).toBe(1);
  });

  it("narrows the bar on a slope", () => {
    const flat = gaugeBarWidthPx({ baf: 2, hfovDeg: 65, frameWidthPx: 1920, displayScale: 1 });
    const slope = gaugeBarWidthPx({
      baf: 2,
      hfovDeg: 65,
      frameWidthPx: 1920,
      displayScale: 1,
      elevationDeg: 25,
    });
    expect(slope).toBeLessThan(flat);
  });
});

describe("HFOV calibration (exact, display-independent)", () => {
  it("recovers a known HFOV from a reference object", () => {
    // Render a known 65° camera: an object 1m wide at 5m subtends
    // α = 2·atan(0.5/5). Its frame pixel span at 1920px wide:
    const frameWidthPx = 1920;
    const hfovTrue = 65;
    const alpha = 2 * Math.atan(0.5 / 5);
    const f = focalLengthPx(hfovTrue, frameWidthPx);
    const objectFramePx = 2 * f * Math.tan(alpha / 2);

    const recovered = hfovFromCalibration({
      objectWidthM: 1,
      distanceM: 5,
      objectFramePx,
      frameWidthPx,
    });
    expect(recovered).toBeCloseTo(hfovTrue, 4);
  });

  it("rejects non-positive inputs", () => {
    expect(() =>
      hfovFromCalibration({ objectWidthM: 1, distanceM: 0, objectFramePx: 10, frameWidthPx: 100 }),
    ).toThrow();
  });
});

describe("calibration self-check", () => {
  // Simulate a true camera: object 1m wide at 5m, rendered through a known HFOV.
  const frameWidthPx = 1920;
  const simulateMarks = (trueHfov: number) => {
    const alpha = 2 * Math.atan(0.5 / 5);
    const f = focalLengthPx(trueHfov, frameWidthPx);
    return 2 * f * Math.tan(alpha / 2);
  };

  it("passes with ~0 bias when the saved HFOV matches reality", () => {
    const res = checkCalibration({
      objectWidthM: 1,
      distanceM: 5,
      markedFramePx: simulateMarks(65),
      frameWidthPx,
      hfovDeg: 65,
    });
    expect(res.angleErrorPct).toBeCloseTo(0, 4);
    expect(res.basalAreaBiasPct).toBeCloseTo(0, 4);
    expect(res.pass).toBe(true);
  });

  it("fails with a negative bias when the saved HFOV is too narrow", () => {
    // True camera is 75° but the app believes 65°: the gauge bar is drawn too
    // wide on screen, trees are under-counted, basal area under-reported.
    const res = checkCalibration({
      objectWidthM: 1,
      distanceM: 5,
      markedFramePx: simulateMarks(75),
      frameWidthPx,
      hfovDeg: 65,
    });
    expect(res.basalAreaBiasPct).toBeLessThan(-CALIBRATION_CHECK_TOLERANCE_PCT);
    expect(res.pass).toBe(false);
  });

  it("round-trips with hfovFromCalibration to a perfect check", () => {
    // Calibrate from marks, then verify with the same marks: bias must be 0.
    const marks = simulateMarks(70);
    const hfov = hfovFromCalibration({
      objectWidthM: 1,
      distanceM: 5,
      objectFramePx: marks,
      frameWidthPx,
    });
    const res = checkCalibration({
      objectWidthM: 1,
      distanceM: 5,
      markedFramePx: marks,
      frameWidthPx,
      hfovDeg: hfov,
    });
    expect(res.basalAreaBiasPct).toBeCloseTo(0, 3);
    expect(res.pass).toBe(true);
  });

  it("bias has the squared-ratio magnitude (BAF ∝ sin²)", () => {
    // A 2% angular error implies ≈ 4% basal-area bias at relascope angles.
    const marks = simulateMarks(65) * 1.02;
    const res = checkCalibration({
      objectWidthM: 1,
      distanceM: 5,
      markedFramePx: marks,
      frameWidthPx,
      hfovDeg: 65,
    });
    expect(res.angleErrorPct).toBeCloseTo(2, 1);
    expect(res.basalAreaBiasPct).toBeCloseTo(4, 0);
  });

  it("rejects non-positive inputs", () => {
    expect(() =>
      checkCalibration({ objectWidthM: 1, distanceM: 5, markedFramePx: 0, frameWidthPx: 1920, hfovDeg: 65 }),
    ).toThrow();
    expect(() =>
      checkCalibration({ objectWidthM: 1, distanceM: 5, markedFramePx: 100, frameWidthPx: 1920, hfovDeg: 0 }),
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
    expect(a.suggestedAdditionalPoints).toBe(5);
  });

  it("suggests no extra points when readings are tight", () => {
    const a = aggregateStand([10, 10, 10]);
    expect(a.coefficientOfVariationPct).toBe(0);
    expect(a.suggestedAdditionalPoints).toBe(0);
  });
});

describe("species mix", () => {
  const trees: TreeObservation[] = [
    { call: "in", species: "pine" },
    { call: "in", species: "pine" },
    { call: "borderline", species: "spruce" },
    { call: "in", species: "deciduous" },
    { call: "in" }, // counted but untagged
    { call: "out", species: "spruce" }, // out trees never count
  ];

  it("weights species counts like the basal-area count (in=1, borderline=½)", () => {
    const b = speciesBreakdown(trees);
    expect(b.effectiveCounts.pine).toBe(2);
    expect(b.effectiveCounts.spruce).toBe(0.5);
    expect(b.effectiveCounts.deciduous).toBe(1);
    expect(b.unspecified).toBe(1);
    expect(b.hasSpecies).toBe(true);
  });

  it("reports no species for an untagged sweep", () => {
    const b = speciesBreakdown([{ call: "in" }, { call: "borderline" }]);
    expect(b.hasSpecies).toBe(false);
    expect(b.unspecified).toBe(1.5);
  });

  it("aggregates shares of total basal area across points", () => {
    const shares = aggregateSpecies([
      { baf: 2, trees },
      { baf: 2, trees: [{ call: "in", species: "pine" }] },
    ]);
    // Point 1: pine 4, spruce 1, deciduous 2, unspecified 2 m²/ha.
    // Point 2: pine 2 m²/ha. Means: pine 3, spruce 0.5, deciduous 1, unspec 1.
    expect(shares.basalAreaPerHa.pine).toBeCloseTo(3, 10);
    expect(shares.basalAreaPerHa.spruce).toBeCloseTo(0.5, 10);
    expect(shares.basalAreaPerHa.deciduous).toBeCloseTo(1, 10);
    expect(shares.unspecifiedBasalAreaPerHa).toBeCloseTo(1, 10);
    const totalPct =
      shares.sharePct.pine +
      shares.sharePct.spruce +
      shares.sharePct.deciduous +
      shares.unspecifiedSharePct;
    expect(totalPct).toBeCloseTo(100, 10);
    expect(shares.sharePct.pine).toBeCloseTo((3 / 5.5) * 100, 10);
  });

  it("returns zero shares for no points", () => {
    const shares = aggregateSpecies([]);
    expect(shares.hasSpecies).toBe(false);
    expect(shares.sharePct.pine).toBe(0);
  });
});

describe("volume estimate (V = F·G·H)", () => {
  it("computes the classic relascope volume shortcut", () => {
    // G = 25 m²/ha, H = 20 m, F = 0.5 → 250 m³/ha.
    expect(estimateVolumePerHa(25, 20)).toBeCloseTo(250, 10);
    expect(STAND_FORM_FACTOR).toBe(0.5);
  });

  it("returns null when height is missing or invalid", () => {
    expect(estimateVolumePerHa(25, null)).toBeNull();
    expect(estimateVolumePerHa(25, undefined)).toBeNull();
    expect(estimateVolumePerHa(25, 0)).toBeNull();
    expect(estimateVolumePerHa(25, NaN)).toBeNull();
  });
});

describe("tree height by clinometer", () => {
  it("computes h = d·(tan top − tan base)", () => {
    // 20 m away, base −5° (looking slightly down), top +30°.
    const expected = 20 * (Math.tan((30 * Math.PI) / 180) - Math.tan((-5 * Math.PI) / 180));
    expect(treeHeightM(20, -5, 30)).toBeCloseTo(expected, 10);
    expect(expected).toBeCloseTo(13.3, 1);
  });

  it("works on a downhill tree (both angles below horizon)", () => {
    const h = treeHeightM(20, -25, -5);
    expect(h).not.toBeNull();
    expect(h!).toBeGreaterThan(0);
  });

  it("returns null for unusable sightings", () => {
    expect(treeHeightM(0, -5, 30)).toBeNull(); // no distance
    expect(treeHeightM(20, 30, -5)).toBeNull(); // top below base
    expect(treeHeightM(20, -5, 88)).toBeNull(); // tan blow-up guard
  });
});
