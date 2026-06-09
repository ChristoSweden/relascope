# Field validation protocol

The app is only "equal or better than a physical relascope" if it agrees with
one in the woods. This protocol produces that evidence. Run it once per phone
model you care about, and again after any change to the gauge math or
calibration flow.

## Equipment

- A physical angle gauge or relascope with a known BAF (use **BAF 2** to match
  the app's Nordic default).
- The phone under test, **calibrated** in the app (Settings → Calibrate) and
  **verified** (Settings → Verify calibration) with implied basal-area bias
  within ±5%.
- A measuring tape (≥ 15 m) and a calliper or diameter tape for borderline
  checks.

## Bench check (before going out)

1. Calibrate the app with a reference object (e.g. a 1.00 m stick at exactly
   5.00 m).
2. Run **Verify calibration** with the object at a *different* distance (e.g.
   8.00 m). The check must pass (±5% basal-area bias). If it fails, the phone
   reports a wrong field of view (some devices switch lenses at startup) —
   recalibrate and repeat.

## Plot comparison

Pick at least **5 sample points** across different stand densities (sparse,
medium, dense). At each point:

1. **Physical sweep first**: stand on the point, sweep 360° with the physical
   gauge, recording IN / borderline / OUT per tree. Resolve every borderline
   tree properly: measure horizontal distance and DBH, tree is IN when
   `distance ≤ (50/√BAF) × DBH` (for BAF 2: ≤ 35.36 × DBH).
2. **App sweep second**, same point, same BAF, *without looking at the physical
   result*. Use the same borderline policy ("confirm by distance").
3. Record both counts and both basal-area figures.

### Acceptance criteria

| Metric | Target |
|---|---|
| Per-point effective count difference | ≤ 1 tree on ≥ 80% of points |
| Per-point basal-area difference | ≤ 2 m²/ha on every point |
| Mean basal area over all points | within ±5% of the physical mean |

### Common failure causes

- **Wrong lens**: multi-camera phones sometimes deliver the ultra-wide stream.
  Symptom: verification fails badly (>15% bias). Recalibrate after the camera
  is warm and verify again.
- **Zoom drift**: pinch-zooming during a sweep invalidates calibration. The app
  locks zoom to minimum, but OS-level accessibility zoom can interfere.
- **Slope**: on terrain steeper than ~10°, confirm slope compensation is ON in
  the app and that the physical gauge result was slope-corrected too —
  otherwise the *physical* count is the biased one.
- **Breast height discipline**: both methods must sight at 1.3 m. Sighting the
  app's bar against the visually widest part of the trunk inflates counts.

## Recording results

Use one app stand per validation session and export the CSV. Note the physical
counts in each point's notes field, so the comparison is preserved in the
export. Summarize the comparison in a table in this file (or a PR) per device:

| Device | Points | Mean G (app) | Mean G (physical) | Δ % | Verdict |
|---|---|---|---|---|---|
| _e.g. Pixel 8_ | 5 | — | — | — | — |
