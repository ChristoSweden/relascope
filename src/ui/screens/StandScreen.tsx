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
          <div className="card">
            <div className="metric">
              <span>{t("meanWithSpread")}</span>
              <span className="value">
                {agg.meanBasalAreaPerHa.toFixed(1)} <span className="unit">m²/ha</span>
              </span>
            </div>
            <div className="metric">
              <span>± SE</span>
              <span className="value">
                {agg.standardError.toFixed(1)} <span className="unit">m²/ha</span>
              </span>
            </div>
            <div className="metric">
              <span>{t("coefficientOfVariation")}</span>
              <span className="value">
                {agg.coefficientOfVariationPct.toFixed(0)}
                <span className="unit">%</span>
              </span>
            </div>
            {species.hasSpecies && (
              <div className="metric">
                <span>{t("species")}</span>
                <span className="value" style={{ fontSize: 16 }}>
                  {TREE_SPECIES.filter((s) => species.sharePct[s] > 0)
                    .map((s) => `${t(speciesKey(s))} ${Math.round(species.sharePct[s])}%`)
                    .join(" · ")}
                  {species.unspecifiedSharePct >= 0.5
                    ? ` · ${t("speciesUnspecified")} ${Math.round(species.unspecifiedSharePct)}%`
                    : ""}
                </span>
              </div>
            )}
            <div className="metric">
              <span>
                {t("volumePerHa")} <span className="tag estimate">{t("estimate")}</span>
              </span>
              <span className="value" style={{ fontSize: 18 }}>
                {volume !== null ? (
                  <>
                    {Math.round(volume)} <span className="unit">m³/ha</span>{" "}
                  </>
                ) : (
                  "— "
                )}
                <button className="btn small ghost" onClick={editMeanHeight} aria-label={t("setMeanHeight")}>
                  {stand.meanHeightM ? `${t("meanHeight")} ${stand.meanHeightM} m ✎` : `+ ${t("meanHeight")}`}
                </button>{" "}
                <button
                  className="btn small ghost"
                  onClick={() => navigate(`/stand/${stand.id}/height`)}
                  aria-label={t("heightTool")}
                >
                  📐 {t("heightTool")}
                </button>
              </span>
            </div>
            <p className="muted" style={{ margin: "10px 0 0", fontSize: 14 }}>
              {agg.suggestedAdditionalPoints > 0
                ? t("suggestMorePoints", { n: agg.suggestedAdditionalPoints })
                : t("spreadOk")}
            </p>
          </div>
        )}

        <button className="btn primary" onClick={() => navigate(`/stand/${stand.id}/sweep`)}>
          + {t("addPoint")}
        </button>

        <h2 style={{ fontSize: 16, marginBottom: 0 }}>{t("points")}</h2>
        {stand.points.length === 0 && <p className="muted">{t("noPoints")}</p>}

        <div className="stack">
          {stand.points.map((p, i) => {
            const m = computePointMetrics(p.trees, p.baf, p.borderlinePolicy);
            return (
              <div key={p.id} className="card">
                <div className="row" style={{ justifyContent: "space-between" }}>
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
                      <span>
                        {t("stemsPerHa")} <span className="tag estimate">{t("estimate")}</span>
                      </span>
                      <span className="value">{Math.round(m.stemsPerHa!)}</span>
                    </div>
                    <div className="metric">
                      <span>
                        {t("meanDbh")} <span className="tag estimate">{t("estimate")}</span>
                      </span>
                      <span className="value">
                        {m.meanDbhCm!.toFixed(0)} <span className="unit">cm</span>
                      </span>
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
                    “{p.notes}”
                  </p>
                )}
              </div>
            );
          })}
        </div>

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
