// Core Bitterlich angle-count geometry and stand calculations.
//
// All of this is pure and framework-free so it can be unit-tested and reused.
// See PRD §2 (geometry) and §5.3 (calculations).

/** Borderline trees are the classic error source. PRD §5.2. */
export type BorderlinePolicy = "half" | "confirm";

/** A single tree call during a sweep. */
export type TreeCall = "in" | "borderline" | "out";

export interface TreeObservation {
  call: TreeCall;
  /** Optional measured/estimated diameter at breast height, in centimetres. */
  dbhCm?: number;
  /** Compass bearing the phone faced when the tree was tapped, degrees 0–360. */
  bearingDeg?: number;
}

/**
 * Full critical angle (edge-to-edge) subtended by a borderline trunk for a
 * given Basal Area Factor, in degrees.
 *
 * BAF = 2500 · sin²(θ/2)  ⇒  θ = 2·asin(√(BAF/2500))
 *
 * BAF 2 → ≈ 3.242°, matching the PRD reference table.
 */
export function criticalAngleDeg(baf: number): number {
  const halfAngleRad = Math.asin(Math.sqrt(baf / 2500));
  return (2 * halfAngleRad * 180) / Math.PI;
}

/**
 * Distance-to-diameter ratio k for a BAF: a tree is "in" when it is closer
 * than k × its diameter. k = 50 / √BAF. BAF 2 → ≈ 35.4.
 */
export function distanceDiameterRatio(baf: number): number {
  return 50 / Math.sqrt(baf);
}

/**
 * On-screen width (in CSS pixels) of the gauge bar for a given BAF, given the
 * camera's horizontal field of view and the rendered video width.
 *
 * w_px = θ / degreesPerPixel, where degreesPerPixel = HFOV / viewportWidthPx.
 */
export function gaugeBarWidthPx(
  baf: number,
  hfovDeg: number,
  viewportWidthPx: number,
): number {
  if (hfovDeg <= 0 || viewportWidthPx <= 0) return 0;
  const degreesPerPixel = hfovDeg / viewportWidthPx;
  return criticalAngleDeg(baf) / degreesPerPixel;
}

/**
 * Derive horizontal field of view from a guided calibration: a reference
 * object of known real width is held at a known distance and its on-screen
 * pixel width is marked. This is the PWA stand-in for native camera intrinsics
 * (PRD §5.1 calibration check).
 *
 * Object angular width α = 2·atan((W/2)/D). The object spans
 * (objectPx / viewportWidthPx) of the frame, so HFOV = α · viewportWidthPx / objectPx.
 */
export function hfovFromCalibration(params: {
  objectWidthM: number;
  distanceM: number;
  objectPx: number;
  viewportWidthPx: number;
}): number {
  const { objectWidthM, distanceM, objectPx, viewportWidthPx } = params;
  if (distanceM <= 0 || objectPx <= 0 || viewportWidthPx <= 0) {
    throw new Error("Calibration inputs must be positive.");
  }
  const angularWidthRad = 2 * Math.atan(objectWidthM / 2 / distanceM);
  const angularWidthDeg = (angularWidthRad * 180) / Math.PI;
  return (angularWidthDeg * viewportWidthPx) / objectPx;
}

/** Effective tree count, applying the borderline policy (PRD §5.3). */
export function effectiveCount(
  trees: TreeObservation[],
  _policy: BorderlinePolicy,
): number {
  const inCount = trees.filter((t) => t.call === "in").length;
  const borderlineCount = trees.filter((t) => t.call === "borderline").length;
  // Both policies count borderlines as a half-tree for the basal-area number;
  // "confirm" only differs in that the UI prompts for a distance check first.
  return inCount + borderlineCount / 2;
}

/** Basal area of a single tree from its DBH, in m². g = π/4 · d². */
export function treeBasalAreaM2(dbhCm: number): number {
  const dMeters = dbhCm / 100;
  return (Math.PI / 4) * dMeters * dMeters;
}

export interface PointMetrics {
  /** Basal area per hectare, m²/ha. Count-based — the robust figure. */
  basalAreaPerHa: number;
  effectiveCount: number;
  inCount: number;
  borderlineCount: number;
  outCount: number;
  /** Stems per hectare. null unless DBHs were entered (estimate). */
  stemsPerHa: number | null;
  /** Arithmetic mean DBH (cm). null unless DBHs were entered (estimate). */
  meanDbhCm: number | null;
  /** Quadratic mean diameter Dg (cm). null unless DBHs were entered. */
  quadraticMeanDbhCm: number | null;
  /** True when stems/ha & DBH figures are present and should be labelled "estimate". */
  hasDiameterEstimates: boolean;
}

/**
 * Compute all per-point metrics from the raw calls and BAF (PRD §5.3).
 *
 * Basal area per hectare needs only the count and is always reported.
 * Stems/ha, mean DBH and Dg require per-tree diameters; they are returned only
 * when at least one counted tree has a DBH, and the caller must label them as
 * estimates (PRD "honest accuracy note").
 */
export function computePointMetrics(
  trees: TreeObservation[],
  baf: number,
  policy: BorderlinePolicy,
): PointMetrics {
  const inCount = trees.filter((t) => t.call === "in").length;
  const borderlineCount = trees.filter((t) => t.call === "borderline").length;
  const outCount = trees.filter((t) => t.call === "out").length;
  const eff = effectiveCount(trees, policy);
  const basalAreaPerHa = baf * eff;

  const counted = trees.filter(
    (t) => (t.call === "in" || t.call === "borderline") && typeof t.dbhCm === "number" && t.dbhCm! > 0,
  );

  let stemsPerHa: number | null = null;
  let meanDbhCm: number | null = null;
  let quadraticMeanDbhCm: number | null = null;

  if (counted.length > 0) {
    // Each counted tree represents BAF / g_i stems per hectare.
    stemsPerHa = counted.reduce((sum, t) => {
      const weight = t.call === "borderline" ? 0.5 : 1;
      return sum + (weight * baf) / treeBasalAreaM2(t.dbhCm!);
    }, 0);

    const dbhs = counted.map((t) => t.dbhCm!);
    meanDbhCm = dbhs.reduce((a, b) => a + b, 0) / dbhs.length;
    quadraticMeanDbhCm = Math.sqrt(
      dbhs.reduce((a, d) => a + d * d, 0) / dbhs.length,
    );
  }

  return {
    basalAreaPerHa,
    effectiveCount: eff,
    inCount,
    borderlineCount,
    outCount,
    stemsPerHa,
    meanDbhCm,
    quadraticMeanDbhCm,
    hasDiameterEstimates: counted.length > 0,
  };
}

export interface StandAggregate {
  pointCount: number;
  /** Mean basal area per hectare across points, m²/ha. */
  meanBasalAreaPerHa: number;
  /** Sample standard deviation across points. */
  stdDev: number;
  /** Standard error of the mean. */
  standardError: number;
  /** Coefficient of variation (%), a unitless spread indicator. */
  coefficientOfVariationPct: number;
  /**
   * Suggested additional points to reach a typical CV-based target, given the
   * observed variability. 0 when the spread is already acceptable.
   */
  suggestedAdditionalPoints: number;
}

/**
 * Aggregate basal-area readings across the points of a stand (PRD §5.4).
 * Reports mean with spread (SE / CV) and a simple point-count recommendation.
 */
export function aggregateStand(basalAreasPerHa: number[]): StandAggregate {
  const n = basalAreasPerHa.length;
  if (n === 0) {
    return {
      pointCount: 0,
      meanBasalAreaPerHa: 0,
      stdDev: 0,
      standardError: 0,
      coefficientOfVariationPct: 0,
      suggestedAdditionalPoints: 0,
    };
  }
  const mean = basalAreasPerHa.reduce((a, b) => a + b, 0) / n;
  const variance =
    n > 1
      ? basalAreasPerHa.reduce((a, g) => a + (g - mean) ** 2, 0) / (n - 1)
      : 0;
  const stdDev = Math.sqrt(variance);
  const standardError = n > 0 ? stdDev / Math.sqrt(n) : 0;
  const cv = mean > 0 ? (stdDev / mean) * 100 : 0;

  // Rule of thumb: points needed ≈ (CV / targetErrorPct)². Target a 10%
  // sampling error on the mean; recommend the shortfall, capped for sanity.
  const targetErrorPct = 10;
  const neededRaw = cv > 0 ? Math.ceil((cv / targetErrorPct) ** 2) : n;
  const suggestedAdditionalPoints = Math.max(0, Math.min(neededRaw - n, 20));

  return {
    pointCount: n,
    meanBasalAreaPerHa: mean,
    stdDev,
    standardError,
    coefficientOfVariationPct: cv,
    suggestedAdditionalPoints,
  };
}
