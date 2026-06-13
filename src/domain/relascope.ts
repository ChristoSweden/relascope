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

/**
 * Species groups used in Nordic practice (tall/gran/löv). The basal-area share
 * per species is the first thing a buyer asks about a stand, so the sweep can
 * optionally tag each counted tree with one of these.
 */
export type TreeSpecies = "pine" | "spruce" | "deciduous";

export const TREE_SPECIES: readonly TreeSpecies[] = ["pine", "spruce", "deciduous"];

export interface TreeObservation {
  call: TreeCall;
  /** Optional species group of the tree (PRD hand-off: buyer asks for mix). */
  species?: TreeSpecies;
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
 * Horizontal span between two edge markers, in *native frame* pixels.
 *
 * Markers are placed as fractions [0,1] of a cover-cropped preview; this undoes
 * the object-fit: cover scaling so the span is resolution- and aspect-ratio
 * independent. Shared by calibration (solve for HFOV) and the measure tool
 * (solve for the angle a trunk subtends) so both read the preview identically.
 */
export function markerSpanFramePx(params: {
  leftFrac: number;
  rightFrac: number;
  stageWidthPx: number;
  stageHeightPx: number;
  frameWidthPx: number;
  frameHeightPx: number;
}): number {
  const { leftFrac, rightFrac, stageWidthPx, stageHeightPx, frameWidthPx, frameHeightPx } = params;
  const scale = coverDisplayScale(frameWidthPx, frameHeightPx, stageWidthPx, stageHeightPx);
  const cssPx = Math.abs(rightFrac - leftFrac) * stageWidthPx;
  return cssPx / scale;
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

/**
 * Verification tolerance: the implied basal-area bias above which a
 * calibration check fails and the user is told to recalibrate. 5% keeps the
 * digital gauge within the agreement typically expected of a physical
 * relascope sweep.
 */
export const CALIBRATION_CHECK_TOLERANCE_PCT = 5;

export interface CalibrationCheckResult {
  /** True angle the reference object subtends, from its width and distance. */
  expectedAngleDeg: number;
  /** Angle the app derives from the marked pixel span under the saved HFOV. */
  measuredAngleDeg: number;
  /** Relative angular error of the saved calibration, %. */
  angleErrorPct: number;
  /**
   * Implied bias on reported basal area, %. Positive means the app would
   * over-report. BAF ∝ sin²(θ/2), so the bias is the squared focal-length
   * ratio: ((tan(measured/2)/tan(expected/2))² − 1) × 100.
   */
  basalAreaBiasPct: number;
  pass: boolean;
}

/**
 * Self-check of a saved calibration (the inverse of {@link hfovFromCalibration}):
 * the user marks a reference object of known width at a known distance, and we
 * compare the angle the saved HFOV assigns to that span against the true angle
 * from geometry. This lets the app *prove* its gauge is right before a sweep —
 * something a physical relascope can't do for a damaged or misread scale.
 */
export function checkCalibration(params: {
  objectWidthM: number;
  distanceM: number;
  /** Marked object span, in native frame pixels. */
  markedFramePx: number;
  frameWidthPx: number;
  /** The saved (to-be-verified) horizontal field of view, degrees. */
  hfovDeg: number;
}): CalibrationCheckResult {
  const { objectWidthM, distanceM, markedFramePx, frameWidthPx, hfovDeg } = params;
  if (
    objectWidthM <= 0 ||
    distanceM <= 0 ||
    markedFramePx <= 0 ||
    frameWidthPx <= 0 ||
    hfovDeg <= 0
  ) {
    throw new Error("Calibration check inputs must be positive.");
  }
  const expectedAngleDeg = toDeg(2 * Math.atan(objectWidthM / 2 / distanceM));
  const measuredAngleDeg = frameWidthToAngleDeg(markedFramePx, hfovDeg, frameWidthPx);
  const angleErrorPct = (measuredAngleDeg / expectedAngleDeg - 1) * 100;
  const focalRatio =
    Math.tan(toRad(measuredAngleDeg) / 2) / Math.tan(toRad(expectedAngleDeg) / 2);
  const basalAreaBiasPct = (focalRatio * focalRatio - 1) * 100;
  return {
    expectedAngleDeg,
    measuredAngleDeg,
    angleErrorPct,
    basalAreaBiasPct,
    pass: Math.abs(basalAreaBiasPct) <= CALIBRATION_CHECK_TOLERANCE_PCT,
  };
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

export interface SpeciesBreakdown {
  /** Effective count (in + ½·borderline) per species among counted trees. */
  effectiveCounts: Record<TreeSpecies, number>;
  /** Effective count of counted trees with no species recorded. */
  unspecified: number;
  /** True when at least one counted tree carries a species tag. */
  hasSpecies: boolean;
}

/**
 * Per-species effective counts for one sweep. In an angle count every counted
 * tree represents the same basal area (the BAF), so the species share of the
 * effective count IS the species share of basal area — no diameters needed.
 */
export function speciesBreakdown(trees: TreeObservation[]): SpeciesBreakdown {
  const effectiveCounts: Record<TreeSpecies, number> = { pine: 0, spruce: 0, deciduous: 0 };
  let unspecified = 0;
  for (const tree of trees) {
    const weight = tree.call === "in" ? 1 : tree.call === "borderline" ? 0.5 : 0;
    if (weight === 0) continue;
    if (tree.species) effectiveCounts[tree.species] += weight;
    else unspecified += weight;
  }
  return {
    effectiveCounts,
    unspecified,
    hasSpecies: TREE_SPECIES.some((s) => effectiveCounts[s] > 0),
  };
}

export interface SpeciesShares {
  /** Mean basal area per hectare attributable to each species, m²/ha. */
  basalAreaPerHa: Record<TreeSpecies, number>;
  /** Mean basal area per hectare from counted trees without a species, m²/ha. */
  unspecifiedBasalAreaPerHa: number;
  /** Share of total basal area per species, %. Sums to 100 with unspecified. */
  sharePct: Record<TreeSpecies, number>;
  unspecifiedSharePct: number;
  hasSpecies: boolean;
}

/**
 * Stand-level species mix: average the per-point species basal areas
 * (BAF × effective count per species) the same way `aggregateStand` averages
 * totals, then express each species as a share of the total.
 */
export function aggregateSpecies(
  points: { trees: TreeObservation[]; baf: number }[],
): SpeciesShares {
  const basalAreaPerHa: Record<TreeSpecies, number> = { pine: 0, spruce: 0, deciduous: 0 };
  let unspecifiedBasalAreaPerHa = 0;
  const n = points.length;
  for (const point of points) {
    const b = speciesBreakdown(point.trees);
    for (const s of TREE_SPECIES) basalAreaPerHa[s] += (point.baf * b.effectiveCounts[s]) / n;
    unspecifiedBasalAreaPerHa += (point.baf * b.unspecified) / n;
  }
  const total =
    TREE_SPECIES.reduce((sum, s) => sum + basalAreaPerHa[s], 0) + unspecifiedBasalAreaPerHa;
  const sharePct: Record<TreeSpecies, number> = { pine: 0, spruce: 0, deciduous: 0 };
  if (total > 0) {
    for (const s of TREE_SPECIES) sharePct[s] = (basalAreaPerHa[s] / total) * 100;
  }
  return {
    basalAreaPerHa,
    unspecifiedBasalAreaPerHa,
    sharePct,
    unspecifiedSharePct: total > 0 ? (unspecifiedBasalAreaPerHa / total) * 100 : 0,
    hasSpecies: TREE_SPECIES.some((s) => basalAreaPerHa[s] > 0),
  };
}

/**
 * Whole-stand form factor for the classic relascope volume shortcut
 * V ≈ F · G · H. ~0.5 is the standard rough figure for Nordic
 * conifer-dominated stands (pine ≈ 0.45, spruce ≈ 0.48–0.52); the result is
 * always labelled an estimate in the UI.
 */
export const STAND_FORM_FACTOR = 0.5;

/**
 * Standing-volume estimate, m³/ha, from basal area and a mean stand height
 * (the unit forest owners actually reason in). Returns null when height is
 * missing/invalid so callers render "—" rather than a fake zero.
 */
export function estimateVolumePerHa(
  basalAreaPerHa: number,
  meanHeightM: number | null | undefined,
  formFactor: number = STAND_FORM_FACTOR,
): number | null {
  if (meanHeightM == null || !(meanHeightM > 0) || basalAreaPerHa < 0) return null;
  return formFactor * basalAreaPerHa * meanHeightM;
}

/**
 * Rough standing-timber value, SEK/ha, from a per-hectare volume and a price
 * per cubic metre. Returns null when volume is missing so the UI shows nothing
 * rather than a fake "0 SEK" on an unmeasured stand.
 */
export function timberValuePerHaSek(
  volumePerHaM3: number | null | undefined,
  priceSekPerM3: number,
): number | null {
  if (volumePerHaM3 == null || !(volumePerHaM3 >= 0) || !(priceSekPerM3 >= 0)) return null;
  return volumePerHaM3 * priceSekPerM3;
}

/**
 * Tree height by clinometer (the relascope's traditional companion tool):
 * stand at a known horizontal distance, sight the trunk base and the top,
 * h = d · (tan θtop − tan θbase) with angles signed relative to the horizon
 * (base typically negative). Returns null for unusable sightings — distance
 * ≤ 0, angles where tan blows up, or top not above base — so the UI shows
 * "—" instead of nonsense.
 */
export function treeHeightM(
  distanceM: number,
  baseAngleDeg: number,
  topAngleDeg: number,
): number | null {
  if (!(distanceM > 0)) return null;
  if (Math.abs(baseAngleDeg) > 85 || Math.abs(topAngleDeg) > 85) return null;
  const h = distanceM * (Math.tan(toRad(topAngleDeg)) - Math.tan(toRad(baseAngleDeg)));
  return h > 0 ? h : null;
}

// ---------------------------------------------------------------------------
// Single-tree dimensions: optical distance, upper-stem diameter and stem volume.
//
// A physical Spiegel-Relaskop reads distance, upper diameters and volume, not
// just height and basal area. These reuse the inputs the phone already gives
// the height tool — a calibrated angle scale (HFOV, read off the edge markers)
// and the inclinometer pitch — so they are plain geometry, no new hardware.
//
// Round-trunk model: a trunk of diameter d at range D subtends
// α = 2·asin((d/2)/D) — the same sine geometry as the BAF critical angle
// (BAF = 2500·sin²(θ/2)), keeping diameter/distance consistent with the
// angle-count math.
// ---------------------------------------------------------------------------

/**
 * Slant range (metres) to a round trunk of known diameter `dbhCm` that subtends
 * `angularWidthDeg`. The trunk is the "known staff": a stem of measured DBH gives
 * the distance from its on-screen width, like a relascope ranging off a target.
 * D = (d/2) / sin(α/2).
 */
export function trunkSlantRangeM(dbhCm: number, angularWidthDeg: number): number {
  if (dbhCm <= 0 || angularWidthDeg <= 0) return 0;
  return dbhCm / 100 / 2 / Math.sin(toRad(angularWidthDeg) / 2);
}

/**
 * Diameter (centimetres) of a trunk subtending `angularWidthDeg` at slant range
 * `slantM` — the relascope's upper-stem reading: aim at any height, mark the
 * edges, read the diameter. d = 2·D·sin(α/2).
 */
export function diameterFromAngleCm(angularWidthDeg: number, slantM: number): number {
  if (slantM <= 0 || angularWidthDeg <= 0) return 0;
  return 2 * slantM * Math.sin(toRad(angularWidthDeg) / 2) * 100;
}

/** Horizontal distance from a slant range and the sight-line pitch. D_h = D·cos(φ). */
export function horizontalDistanceM(slantM: number, pitchDeg: number): number {
  return slantM * Math.cos(toRad(pitchDeg));
}

/**
 * Horizontal distance (metres) to a tree from eye height and the depression
 * angle down to its base, on level ground: D = h / tan(δ). Needs only the
 * inclinometer and a one-time eye-height setting — no known diameter — so DBH
 * can then be read optically. Accuracy falls off for distant trees (small δ).
 */
export function distanceFromEyeHeightM(eyeHeightM: number, baseDepressionDeg: number): number {
  if (eyeHeightM <= 0 || baseDepressionDeg <= 0) return 0;
  return eyeHeightM / Math.tan(toRad(baseDepressionDeg));
}

/**
 * Height (metres) above the tree base of a point sighted at pitch `angleDeg`,
 * given the base pitch and horizontal distance. Files an upper diameter at its
 * true stem height. h = D·(tan θ − tan θ_base) (base pitch is negative).
 */
export function stemHeightAtAngleM(horizontalM: number, baseAngleDeg: number, angleDeg: number): number {
  if (horizontalM <= 0) return 0;
  return horizontalM * (Math.tan(toRad(angleDeg)) - Math.tan(toRad(baseAngleDeg)));
}

/** Cross-sectional area (m²) of a stem of diameter `diaCm`. */
export function sectionAreaM2(diaCm: number): number {
  const d = diaCm / 100;
  return (Math.PI / 4) * d * d;
}

/** A diameter measured at a height up the stem, for taper/volume. */
export interface StemSection {
  /** Height above the tree base, metres. */
  heightM: number;
  /** Stem diameter at that height, centimetres. */
  diameterCm: number;
}

/**
 * Stem volume (m³) integrated from measured diameters up the stem — the payoff of
 * reading upper diameters, which a relascope makes you tabulate by hand. Pairs of
 * sections use **Smalian's formula** V = (A₁+A₂)/2·Δh; the butt below the lowest
 * section is a cylinder of its area, and when `totalHeightM` is known the tip
 * above the highest section is a cone (diameter → 0).
 */
export function stemVolumeM3(sections: StemSection[], totalHeightM?: number): number {
  const pts = sections
    .filter((s) => s.diameterCm > 0 && s.heightM >= 0)
    .sort((a, b) => a.heightM - b.heightM);
  if (pts.length === 0) return 0;

  let volume = sectionAreaM2(pts[0].diameterCm) * pts[0].heightM; // butt cylinder
  for (let i = 1; i < pts.length; i++) {
    const a1 = sectionAreaM2(pts[i - 1].diameterCm);
    const a2 = sectionAreaM2(pts[i].diameterCm);
    volume += ((a1 + a2) / 2) * (pts[i].heightM - pts[i - 1].heightM);
  }
  const top = pts[pts.length - 1];
  if (typeof totalHeightM === "number" && totalHeightM > top.heightM) {
    volume += (sectionAreaM2(top.diameterCm) / 3) * (totalHeightM - top.heightM);
  }
  return volume;
}

/**
 * Breast-height form factor f = V / (g₁.₃·H): true stem volume over the cylinder
 * defined by the basal area at breast height and the tree height. A classic
 * dimensionless taper descriptor, free once V, DBH and H are measured.
 */
export function breastHeightFormFactor(volumeM3: number, dbhCm: number, heightM: number): number {
  const cylinder = sectionAreaM2(dbhCm) * heightM;
  return cylinder > 0 ? volumeM3 / cylinder : 0;
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
