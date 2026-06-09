# Digital Relascope

A phone-based **angle-count (Bitterlich) tool** for forest owners, built as an
offline-first **Progressive Web App**. Point your phone's camera at the trees,
sweep a full circle, tap each trunk **IN / borderline / OUT** against the gauge
bar, and the app gives you **basal area per hectare** in real time — no physical
relascope, no tape, no signal required.

This implements **v1 (camera-only)** of the [Digital Relascope PRD](#prd-mapping).

**Live app:** <https://christosweden.github.io/relascope/> — open it on your
phone and use “Add to Home Screen” to install. Deployed automatically from
`main` on every push.

## Why a PWA

The PRD targets every modern phone with no app-store install. A PWA delivers
that, works offline once loaded, and reaches iOS + Android from one codebase.
The trade-off vs. a native app: browsers don't expose camera focal-length
intrinsics or ARKit/ARCore per-frame poses. We handle the first with a **guided
manual calibration** (the PRD's own §5.1 fallback) and defer the native-only
frame-capture / Gaussian-splat ambitions (PRD §7) to a later native track.

## Features (v1)

- **Digital gauge** — BAF critical angle rendered as an on-screen bar, sized from
  the calibrated field of view. Presets BAF 1 / 2 / 4.
- **Guided calibration** — recover the camera's HFOV from a reference object of
  known width at a known distance.
- **Sweep flow** — live camera + gauge overlay, IN/borderline/OUT tap counting,
  360° progress ring driven by the compass, haptic feedback, undo.
- **Live results** — basal area per hectare (count-based, robust); stems/ha and
  mean/quadratic DBH when diameters are entered, clearly labelled as estimates.
- **Multi-point stands** — mean basal area with standard error and CV, plus a
  point-count recommendation based on observed variability.
- **Geotagging** — each point captures GPS + heading.
- **Offline-first** — full measurement with no connectivity; data stays on-device
  (localStorage).
- **CSV export** — raw points + computed metrics for a forester/buyer hand-off.
- **EN + SV**, metric units, Nordic BAF 2 default.

## Features (v1.1 — trust & hand-off)

- **Calibration self-check** — the app *proves* its gauge: it predicts where a
  known-width object's edges should appear under the saved calibration, you mark
  the real edges, and it reports the implied basal-area bias (pass ≤ ±5%). See
  `checkCalibration` in `domain/relascope.ts`.
- **Stand report (PDF)** — a one-page, print-styled summary (mean basal area
  ± SE, per-point table, method & calibration provenance) via the browser's
  print-to-PDF. Works offline, zero dependencies.
- **Screen wake lock** — the display stays on during a sweep.
- **Sunlight mode** — high-contrast light theme for direct sun.
- **Field validation protocol** — [docs/FIELD_VALIDATION.md](docs/FIELD_VALIDATION.md)
  defines the side-by-side comparison against a physical gauge and its
  acceptance criteria.

## Getting started

```bash
npm install
npm run dev      # local dev server (camera needs https or localhost)
npm test         # run the domain unit tests
npm run build    # production build (PWA service worker generated)
npm run preview  # serve the production build
```

> The camera, compass and geolocation APIs require a **secure context**
> (`https://` or `localhost`). Deploy over HTTPS for field use.

## Architecture

```
src/
  domain/      Pure Bitterlich geometry + stand calculations (unit-tested)
  storage/     Local-first persistence (localStorage) + CSV export
  i18n/        English + Swedish strings
  ui/          React app, device hooks, screens, styles
```

The math in `src/domain/relascope.ts` is framework-free and fully covered by
`relascope.test.ts`, including the PRD §2 reference angles and §5.3 formulas.

## PRD mapping

| PRD section | Where |
|---|---|
| §2 geometry, §5.1 gauge/calibration | `domain/relascope.ts`, `screens/CalibrationScreen.tsx` |
| §5.2 sweep flow | `screens/SweepScreen.tsx`, `ui/hooks.ts` |
| §5.3 calculations | `domain/relascope.ts` (`computePointMetrics`) |
| §5.4 multi-point stands | `domain/relascope.ts` (`aggregateStand`), `screens/StandScreen.tsx` |
| §5.5 data/export | `storage/` |
| §6 UX, §8 non-functional | `ui/styles.css`, PWA config in `vite.config.ts` |

## Deferred (later tracks)

- Opt-in frame-bundle capture + ARKit/ARCore poses and Gaussian splats (PRD §7) —
  needs native capabilities a browser can't provide.
- ML auto-detection and LiDAR diameter measurement (PRD v2).
