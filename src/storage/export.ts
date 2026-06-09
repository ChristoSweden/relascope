import {
  computePointMetrics,
  estimateVolumePerHa,
  speciesBreakdown,
} from "../domain/relascope";
import type { Stand } from "./types";

// CSV export of raw points + computed metrics (PRD §5.5). A one-page PDF
// summary is a follow-up; CSV covers the forester/buyer hand-off for v1.

function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function standToCsv(stand: Stand): string {
  const header = [
    "stand_name",
    "point_id",
    "timestamp",
    "lat",
    "lng",
    "gps_accuracy_m",
    "start_heading_deg",
    "baf",
    "borderline_policy",
    "in_count",
    "borderline_count",
    "out_count",
    "effective_count",
    "basal_area_per_ha_m2",
    "pine_eff_count",
    "spruce_eff_count",
    "deciduous_eff_count",
    "unspecified_eff_count",
    "stems_per_ha_estimate",
    "mean_dbh_cm_estimate",
    "quadratic_mean_dbh_cm_estimate",
    "volume_per_ha_m3_estimate",
    "notes",
  ];

  const rows = stand.points.map((p) => {
    const m = computePointMetrics(p.trees, p.baf, p.borderlinePolicy);
    const sp = speciesBreakdown(p.trees);
    const vol = estimateVolumePerHa(m.basalAreaPerHa, stand.meanHeightM);
    return [
      stand.name,
      p.id,
      p.createdAt,
      p.lat,
      p.lng,
      p.accuracyM,
      p.startHeadingDeg,
      p.baf,
      p.borderlinePolicy,
      m.inCount,
      m.borderlineCount,
      m.outCount,
      m.effectiveCount,
      round(m.basalAreaPerHa, 2),
      sp.effectiveCounts.pine,
      sp.effectiveCounts.spruce,
      sp.effectiveCounts.deciduous,
      sp.unspecified,
      m.stemsPerHa === null ? null : round(m.stemsPerHa, 0),
      m.meanDbhCm === null ? null : round(m.meanDbhCm, 1),
      m.quadraticMeanDbhCm === null ? null : round(m.quadraticMeanDbhCm, 1),
      vol === null ? null : round(vol, 0),
      p.notes,
    ]
      .map(csvCell)
      .join(",");
  });

  return [header.join(","), ...rows].join("\n");
}

function round(n: number, dp: number): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

/** Trigger a client-side file download of a text blob. */
export function downloadText(filename: string, text: string, mime = "text/csv"): void {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
