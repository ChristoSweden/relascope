import { Link, useNavigate } from "react-router-dom";
import { useApp } from "../AppContext";
import { newId } from "../../storage/store";
import { computePointMetrics, aggregateStand } from "../../domain/relascope";

export function HomeScreen() {
  const { stands, settings, upsertStand, t } = useApp();
  const navigate = useNavigate();

  const createStand = () => {
    const id = newId();
    const n = stands.length + 1;
    upsertStand({
      id,
      name: `${t("newStand")} ${n}`,
      createdAt: new Date().toISOString(),
      points: [],
    });
    navigate(`/stand/${id}`);
  };

  return (
    <>
      <div className="topbar">
        <h1>{t("appName")}</h1>
        <Link to="/settings" className="btn small ghost" aria-label={t("settings")}>
          ⚙
        </Link>
      </div>
      <div className="content stack">
        <p className="muted" style={{ marginTop: 0 }}>
          {t("tagline")}
        </p>

        {!settings.calibrated && (
          <Link to="/calibrate" className="banner warn" style={{ textDecoration: "none" }}>
            {t("notCalibrated")}
          </Link>
        )}

        <div className="row">
          <Link to="/tutorial" className="btn ghost">
            {t("tutorial")}
          </Link>
          <Link to="/calibrate" className="btn ghost">
            {t("calibrate")}
          </Link>
        </div>

        <button className="btn primary" onClick={createStand}>
          + {t("newStand")}
        </button>

        <h2 style={{ fontSize: 16, marginBottom: 0 }}>{t("stands")}</h2>
        {stands.length === 0 && <p className="muted">{t("noStands")}</p>}
        <div className="stack">
          {stands.map((stand) => {
            const agg = aggregateStand(
              stand.points.map((p) => computePointMetrics(p.trees, p.baf, p.borderlinePolicy).basalAreaPerHa),
            );
            return (
              <Link key={stand.id} to={`/stand/${stand.id}`} className="list-item">
                <div className="meta">
                  <strong>{stand.name}</strong>
                  <div className="muted" style={{ fontSize: 14 }}>
                    {stand.points.length} {t("points").toLowerCase()}
                    {stand.points.length > 0 &&
                      ` · ${agg.meanBasalAreaPerHa.toFixed(1)} m²/ha`}
                  </div>
                </div>
                <span aria-hidden>›</span>
              </Link>
            );
          })}
        </div>
      </div>
    </>
  );
}
