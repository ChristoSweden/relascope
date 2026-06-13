import { useNavigate, useParams } from "react-router-dom";
import { useApp } from "../AppContext";
import { getStand } from "../../storage/store";
import {
  aggregateStand,
  aggregateSpecies,
  computePointMetrics,
  estimateVolumePerHa,
  TREE_SPECIES,
} from "../../domain/relascope";
import { standToCsv, downloadText } from "../../storage/export";
import { TopBar } from "../components/TopBar";
import { speciesKey } from "../../i18n/strings";

const SPECIES_COLORS: Record<string, string> = {
  pine:      "var(--acc)",
  spruce:    "#2a9d77",
  deciduous: "var(--amber)",
};

export function StandScreen() {
  const { standId } = useParams();
  const { stands, upsertStand, deleteStand, t } = useApp();
  const navigate = useNavigate();
  const stand = getStand(stands, standId ?? "");

  if (!stand) {
    return (
      <>
        <TopBar title="—" />
        <div className="content">
          <p className="muted">Not found.</p>
        </div>
      </>
    );
  }

  const agg = aggregateStand(
    stand.points.map((p) => computePointMetrics(p.trees, p.baf, p.borderlinePolicy).basalAreaPerHa),
  );
  const species = aggregateSpecies(stand.points);
  const volume = estimateVolumePerHa(agg.meanBasalAreaPerHa, stand.meanHeightM);

  // Estimate stems/ha and mean DBH for the metric tiles (use 24cm default if no DBH data)
  const allPoints = stand.points.map((p) => computePointMetrics(p.trees, p.baf, p.borderlinePolicy));
  const dbhPoints = allPoints.filter((m) => m.hasDiameterEstimates && m.meanDbhCm != null);
  const meanDbhCm = dbhPoints.length > 0
    ? dbhPoints.reduce((s, m) => s + m.meanDbhCm!, 0) / dbhPoints.length
    : 24;
  const baTree = Math.PI * Math.pow(meanDbhCm / 200, 2);
  const stemsHa = baTree > 0 ? Math.round(agg.meanBasalAreaPerHa / baTree) : null;

  const cvPct = agg.coefficientOfVariationPct;
  const needMore = cvPct > 20;
  const recTxt = needMore
    ? t("suggestMorePoints", { n: agg.suggestedAdditionalPoints })
    : t("spreadOk");

  const removePoint = (pointId: string) => {
    if (!confirm(t("deletePointConfirm"))) return;
    upsertStand({ ...stand, points: stand.points.filter((p) => p.id !== pointId) });
  };

  const removeStand = () => {
    if (!confirm(t("deleteStandConfirm"))) return;
    deleteStand(stand.id);
    navigate("/");
  };

  const rename = () => {
    const name = prompt(t("standName"), stand.name);
    if (name && name.trim()) upsertStand({ ...stand, name: name.trim() });
  };

  const editMeanHeight = () => {
    const raw = prompt(t("meanHeightPrompt"), stand.meanHeightM ? String(stand.meanHeightM) : "");
    if (raw === null) return;
    const h = parseFloat(raw.replace(",", "."));
    upsertStand({ ...stand, meanHeightM: Number.isFinite(h) && h > 0 ? h : null });
  };

  const editNotes = (pointId: string) => {
    const point = stand.points.find((p) => p.id === pointId);
    if (!point) return;
    const notes = prompt(t("notesPlaceholder"), point.notes);
    if (notes === null) return;
    upsertStand({
      ...stand,
      points: stand.points.map((p) => (p.id === pointId ? { ...p, notes: notes.trim() } : p)),
    });
  };

  return (
    <>
      <TopBar
        title={stand.name}
        right={
          <button className="btn small ghost" onClick={rename} aria-label="Rename">
            ✎
          </button>
        }
      />
      <div className="content stack">

        {stand.points.length > 0 && (
          <>
            {/* Hero card: basal area */}
            <div className="hero-card">
              <div className="hero-label">
                Basal area · mean of {stand.points.length} point{stand.points.length !== 1 ? "s" : ""}
              </div>
              <div className="hero-number">
                {agg.meanBasalAreaPerHa.toFixed(1)}
                <span className="hero-unit">m²/ha</span>
              </div>
              <div className="hero-sub">
                ±{agg.standardError.toFixed(1)} standard error · CV {cvPct.toFixed(0)}%
              </div>
            </div>

            {/* Metric tiles */}
            <div className="metric-tiles">
              <div className="metric-tile">
                <div className="tile-value">{stemsHa ?? "—"}</div>
                <div className="tile-label">stems/ha</div>
                <div className="tile-tag">estimate</div>
              </div>
              <div className="metric-tile">
                <div className="tile-value">{meanDbhCm.toFixed(0)}<span className="tile-unit"> cm</span></div>
                <div className="tile-label">mean ø</div>
                <div className="tile-tag">estimate</div>
              </div>
              <button
                className="metric-tile"
                onClick={volume === null ? editMeanHeight : undefined}
                style={{ textAlign: "left", cursor: volume === null ? "pointer" : "default", background: volume === null ? "rgba(67,217,163,0.05)" : undefined, borderColor: volume === null ? "rgba(67,217,163,0.3)" : undefined }}
              >
                {volume !== null ? (
                  <>
                    <div className="tile-value">{Math.round(volume)}</div>
                    <div className="tile-label">m³/ha vol</div>
                    <div className="tile-tag">estimate</div>
                  </>
                ) : (
                  <>
                    <div style={{ fontSize: 13, color: "var(--acc)", fontWeight: 600, marginBottom: 2 }}>+ {t("meanHeight")}</div>
                    <div className="tile-label">m³/ha vol</div>
                    <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 4, lineHeight: 1.3 }}>{t("setHeightForVolume")}</div>
                  </>
                )}
              </button>
            </div>

            {/* Height tool shortcut (only visible if height set, to allow editing) */}
            {stand.meanHeightM != null && (
              <div className="row" style={{ gap: 8 }}>
                <button className="btn small ghost" onClick={editMeanHeight} style={{ flex: 1 }}>
                  {t("meanHeight")} {stand.meanHeightM} m ✎
                </button>
                <button className="btn small ghost" onClick={() => navigate(`/stand/${stand.id}/height`)} style={{ flex: 1 }}>
                  📐 {t("heightTool")}
                </button>
              </div>
            )}

            {/* Species mix bar */}
            {species.hasSpecies && (
              <div className="mix-card">
                <div className="section-label">Species mix · share of basal area</div>
                <div className="mix-bar">
                  {TREE_SPECIES.filter((s) => species.sharePct[s] > 0).map((s) => (
                    <div
                      key={s}
                      style={{ width: `${species.sharePct[s]}%`, background: SPECIES_COLORS[s] ?? "var(--muted)" }}
                    />
                  ))}
                  {species.unspecifiedSharePct >= 0.5 && (
                    <div style={{ flex: 1, background: "var(--line2)" }} />
                  )}
                </div>
                <div className="mix-legend">
                  {TREE_SPECIES.filter((s) => species.sharePct[s] > 0).map((s) => (
                    <span key={s}>
                      <span className="mix-swatch" style={{ background: SPECIES_COLORS[s] ?? "var(--muted)" }} />
                      {t(speciesKey(s))} {Math.round(species.sharePct[s])}%
                    </span>
                  ))}
                  {species.unspecifiedSharePct >= 0.5 && (
                    <span>
                      <span className="mix-swatch" style={{ background: "var(--line2)" }} />
                      {t("speciesUnspecified")} {Math.round(species.unspecifiedSharePct)}%
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* CV / spread card */}
            <div className="rec-card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
                <div>
                  <div className="section-label" style={{ marginBottom: 2 }}>Variation (CV)</div>
                  <div style={{ fontSize: 26, fontWeight: 800 }}>{cvPct.toFixed(0)}%</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div className="section-label" style={{ marginBottom: 2 }}>Points</div>
                  <div style={{ fontSize: 26, fontWeight: 800 }}>{stand.points.length}</div>
                </div>
              </div>
              <div className={`rec-banner ${needMore ? "warn" : "ok"}`}>{recTxt}</div>
            </div>
          </>
        )}

        <button className="btn primary" onClick={() => navigate(`/stand/${stand.id}/sweep`)}>
          + {t("addPoint")}
        </button>

        {/* Individual sweep points */}
        {stand.points.length > 0 && (
          <>
            <div className="section-label" style={{ marginTop: 4 }}>{t("points")}</div>
            <div className="stack">
              {stand.points.map((p, i) => {
                const m = computePointMetrics(p.trees, p.baf, p.borderlinePolicy);
                return (
                  <div key={p.id} className="card">
                    <div className="row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
                      <strong>
                        #{i + 1} · {t("baf")} {p.baf}
                      </strong>
                      <div className="row" style={{ gap: 8 }}>
                        <button
                          className="btn small ghost"
                          onClick={() => editNotes(p.id)}
                          aria-label={t("editNotes")}
                        >
                          ✎
                        </button>
                        <button className="btn small danger" onClick={() => removePoint(p.id)}>
                          {t("delete")}
                        </button>
                      </div>
                    </div>
                    <div className="metric">
                      <span>
                        {t("basalAreaPerHa")} <span className="tag measured">{t("measured")}</span>
                      </span>
                      <span className="value">
                        {m.basalAreaPerHa.toFixed(1)} <span className="unit">m²/ha</span>
                      </span>
                    </div>
                    {m.hasDiameterEstimates && (
                      <>
                        <div className="metric">
                          <span>{t("stemsPerHa")} <span className="tag estimate">{t("estimate")}</span></span>
                          <span className="value">{Math.round(m.stemsPerHa!)}</span>
                        </div>
                        <div className="metric">
                          <span>{t("meanDbh")} <span className="tag estimate">{t("estimate")}</span></span>
                          <span className="value">{m.meanDbhCm!.toFixed(0)} <span className="unit">cm</span></span>
                        </div>
                      </>
                    )}
                    <p className="muted" style={{ margin: "8px 0 0", fontSize: 13 }}>
                      {m.inCount} IN · {m.borderlineCount} {t("borderline")} · {m.outCount} OUT
                      {p.lat !== null
                        ? ` · ${p.lat.toFixed(5)}, ${p.lng!.toFixed(5)}`
                        : ` · ${t("gpsUnavailable")}`}
                    </p>
                    {p.notes && (
                      <p className="muted" style={{ margin: "4px 0 0", fontSize: 13 }}>
                        "{p.notes}"
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}

        {stand.points.length === 0 && <p className="muted">{t("noPoints")}</p>}

        {stand.points.length > 0 && (
          <>
            <button className="btn" onClick={() => navigate(`/stand/${stand.id}/report`)}>
              {t("standReport")}
            </button>
            <button
              className="btn"
              onClick={() => downloadText(`${stand.name.replace(/\s+/g, "_")}.csv`, standToCsv(stand))}
            >
              {t("exportCsv")}
            </button>
          </>
        )}

        <button className="btn danger ghost" onClick={removeStand}>
          {t("delete")} {stand.name}
        </button>
      </div>
    </>
  );
}
