// Core Bitterlich angle-count geometry and stand calculations.
//
// All of this is pure and framework-free so it can be unit-tested and reused.
// See PRD §2 (geometry) and §5.3 (calculations).
//
// Accuracy note: a phone camera is a rectilinear (pinhole) projector, so the
// relationship between a centred on-screen width and the angle it subtends is a
// *tangent*, not linear. Everything here uses the exact pinhole model so the
// digital gauge matches the fixed sighting angle of a physical relascope.

const DEG = Math.PI / 180;
const toRad = (d: number) => d * DEG;
const toDeg = (r: number) => r / DEG;

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
  /** Line-of-sight elevation (terrain inclination) when sighted, degrees. */
  elevationDeg?: number;
  /** Measured horizontal distance to the tree, metres (borderline confirm). */
  distanceM?: number;
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
  return toDeg(2 * Math.asin(Math.sqrt(baf / 2500)));
}

/**
 * Distance-to-diameter ratio k for a BAF: a tree is "in" when it is closer
 * than k × its diameter. k = 50 / √BAF. BAF 2 → ≈ 35.4.
 */
export function distanceDiameterRatio(baf: number): number {
  return 50 / Math.sqrt(baf);
}

/**
 * Limiting horizontal distance (metres) within which a tree of the given DBH
 * counts as "in" for this BAF. Used to resolve borderline trees by measuring
 * distance (PRD §5.2 distance confirmation) — sharper than eyeballing.
 */
export function limitingDistanceM(baf: number, dbhCm: number): number {
  return (distanceDiameterRatio(baf) * dbhCm) / 100;
}

/**
 * Focal length in pixels for a camera with horizontal field of view `hfovDeg`
 * across a frame `frameWidthPx` wide. f = (W/2) / tan(HFOV/2).
 */
export function focalLengthPx(hfovDeg: number, frameWidthPx: number): number {
  return frameWidthPx / 2 / Math.tan(toRad(hfovDeg) / 2);
}

/**
 * Width in *frame* pixels that a centred object subtending `angleDeg` occupies,
 * under the exact pinhole model: w = 2·f·tan(angle/2).
 */
export function angleToFrameWidthPx(
  angleDeg: number,
  hfovDeg: number,
  frameWidthPx: number,
): number {
  if (hfovDeg <= 0 || frameWidthPx <= 0) return 0;
  const f = focalLengthPx(hfovDeg, frameWidthPx);
  return 2 * f * Math.tan(toRad(angleDeg) / 2);
}

/** Inverse of {@link angleToFrameWidthPx}: angle subtended by a centred width. */
export function frameWidthToAngleDeg(
  widthPx: number,
  hfovDeg: number,
  frameWidthPx: number,
): number {
  if (hfovDeg <= 0 || frameWidthPx <= 0) return 0;
  const f = focalLengthPx(hfovDeg, frameWidthPx);
  return toDeg(2 * Math.atan(widthPx / 2 / f));
}

/**
 * Slope-corrected critical angle (PRD §9 slope risk). On inclined terrain the
 * trunk is sighted along the slant distance d/cos(φ), so it appears narrower by
 * cos(φ); narrowing the gauge threshold by the same factor restores the
 * horizontal-distance criterion and prevents the classic slope under-count.
 * This mirrors an automatic slope-compensating relascope.
 */
export function slopeCorrectedCriticalAngleDeg(
  baf: number,
  elevationDeg: number,
): number {
  return criticalAngleDeg(baf) * Math.cos(toRad(elevationDeg));
}

/**
 * Exact on-screen (CSS) width of the gauge bar.
 *
 * The bar must represent the critical angle on the *displayed* video. Because
 * the preview is shown with `object-fit: cover`, the native frame is scaled by
 * `displayScale = max(containerW/frameW, containerH/frameH)` and centre-cropped.
 * We size the bar in native frame pixels (exact pinhole) then scale to CSS, so a
 * calibration done at any aspect ratio transfers correctly to the sweep view.
 */
export function gaugeBarWidthPx(params: {
  baf: number;
  hfovDeg: number;
  frameWidthPx: number;
  displayScale: number;
  /** Terrain inclination of the current sight line, degrees. Default 0. */
  elevationDeg?: number;
}): number {
  const { baf, hfovDeg, frameWidthPx, displayScale, elevationDeg = 0 } = params;
  const angle = slopeCorrectedCriticalAngleDeg(baf, elevationDeg);
  const frameWidth = angleToFrameWidthPx(angle, hfovDeg, frameWidthPx);
  return frameWidth * displayScale;
}

/**
 * `object-fit: cover` scale factor mapping native frame pixels to CSS pixels.
 * Returns 1 if dimensions are unknown so callers degrade gracefully.
 */
export function coverDisplayScale(
  frameWidthPx: number,
  frameHeightPx: number,
  containerWidthPx: number,
  containerHeightPx: number,
): number {
  if (frameWidthPx <= 0 || frameHeightPx <= 0) return 1;
  return Math.max(containerWidthPx / frameWidthPx, containerHeightPx / frameHeightPx);
}

/**
 * Recover horizontal field of view from a guided calibration: a reference
 * object of known real width is held at a known distance and its on-screen
 * pixel width (already converted to *native frame* pixels) is marked. This is
 * the PWA stand-in for native camera intrinsics (PRD §5.1).
 *
 * Object angular width α = 2·atan((W/2)/D); focal length f = (objectPx/2)/tan(α/2);
 * HFOV = 2·atan((frameW/2)/f). Using the exact pinhole model keeps calibration
 * consistent with how the gauge bar is rendered.
 */
export function hfovFromCalibration(params: {
  objectWidthM: number;
  distanceM: number;
  objectFramePx: number;
  frameWidthPx: number;
}): number {
  const { objectWidthM, distanceM, objectFramePx, frameWidthPx } = params;
  if (distanceM <= 0 || objectFramePx <= 0 || frameWidthPx <= 0 || objectWidthM <= 0) {
    throw new Error("Calibration inputs must be positive.");
  }
  const alphaRad = 2 * Math.atan(objectWidthM / 2 / distanceM);
  const f = objectFramePx / 2 / Math.tan(alphaRad / 2);
  return toDeg(2 * Math.atan(frameWidthPx / 2 / f));
}

/** Effective tree count, applying the borderline policy (PRD §5.3). */
export function effectiveCount(
  trees: TreeObservation[],
  _policy: BorderlinePolicy,
): number {
  const inCount = trees.filter((t) => t.call === "in").length;
  const borderlineCount = trees.filter((t) => t.call === "borderline").length;
  // Both policies count remaining borderlines as a half-tree for the basal-area
  // number; "confirm" simply resolves most borderlines to in/out beforehand.
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
    (t) =>
      (t.call === "in" || t.call === "borderline") &&
      typeof t.dbhCm === "number" &&
      t.dbhCm! > 0,
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
    quadraticMeanDbhCm = Math.sqrt(dbhs.reduce((a, d) => a + d * d, 0) / dbhs.length);
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
    n > 1 ? basalAreasPerHa.reduce((a, g) => a + (g - mean) ** 2, 0) / (n - 1) : 0;
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
