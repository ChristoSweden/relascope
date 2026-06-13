import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useApp } from "../AppContext";
import { newId } from "../../storage/store";
import { computePointMetrics, aggregateStand } from "../../domain/relascope";

const ONBOARDED_KEY = "relascope.onboarded.v1";

export function HomeScreen() {
  const { stands, upsertStand, t } = useApp();
  const navigate = useNavigate();
  // Returning users (anyone who already has saved areas) skip the welcome.
  const [onboarded, setOnboarded] = useState(
    () => localStorage.getItem(ONBOARDED_KEY) === "1" || stands.length > 0,
  );

  const dismissOnboarding = (then?: () => void) => {
    localStorage.setItem(ONBOARDED_KEY, "1");
    setOnboarded(true);
    then?.();
  };

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

  // ---- First run: a friendly, plain-language welcome ----
  if (!onboarded) {
    return (
      <div className="content stack" style={{ minHeight: "100dvh", justifyContent: "center" }}>
        <div className="onboard">
          <div className="onboard-emoji">🌲</div>
          <h1>{t("welcomeTitle")}</h1>
          <p>{t("welcomeBody")}</p>
          <p style={{ color: "var(--green)" }}>{t("welcomeNew")}</p>
          <p style={{ fontWeight: 700, margin: "0 auto 6px", maxWidth: "30ch" }}>{t("welcomeNeedLabel")}</p>
          <ul>
            <li>{t("welcomeNeed1")}</li>
            <li>{t("welcomeNeed2")}</li>
            <li>{t("welcomeNeed3")}</li>
          </ul>
        </div>
        <button className="btn primary big-cta" onClick={() => dismissOnboarding(() => navigate("/measure"))}>
          {t("welcomeStart")}
        </button>
        <button className="btn ghost" onClick={() => dismissOnboarding()}>
          {t("skip")}
        </button>
        <p className="muted" style={{ fontSize: 15, textAlign: "center", margin: "4px auto 0", maxWidth: "32ch" }}>
          🔒 {t("privacyNote")}
        </p>
      </div>
    );
  }

  // ---- Launchpad: one obvious action, plain language ----
  return (
    <>
      <div className="topbar">
        <h1>{t("appName")}</h1>
        <Link to="/settings" className="btn small ghost" aria-label={t("settings")}>
          ⚙
        </Link>
      </div>
      <div className="content stack">
        <button className="btn primary home-cta primary" onClick={() => navigate("/measure")}>
          <span className="cta-title">🌲 {t("measureTitle")}</span>
          <span className="cta-hint">{t("homeMeasureHint")}</span>
        </button>

        <button className="btn home-cta" onClick={createStand}>
          <span className="cta-title">📐 {t("homeForestTitle")}</span>
          <span className="cta-hint">{t("homeForestHint")}</span>
        </button>

        {stands.length > 0 && (
          <>
            <h2 style={{ fontSize: 17, margin: "8px 0 0" }}>{t("homeSavedTitle")}</h2>
            <div className="stack">
              {stands.map((stand) => {
                const agg = aggregateStand(
                  stand.points.map((p) => computePointMetrics(p.trees, p.baf, p.borderlinePolicy).basalAreaPerHa),
                );
                return (
                  <Link key={stand.id} to={`/stand/${stand.id}`} className="list-item">
                    <div className="meta">
                      <strong>{stand.name}</strong>
                      <div className="muted" style={{ fontSize: 15 }}>
                        {stand.points.length} {t("points").toLowerCase()}
                        {stand.points.length > 0 && ` · ${agg.meanBasalAreaPerHa.toFixed(1)} m²/ha`}
                      </div>
                    </div>
                    <span aria-hidden>›</span>
                  </Link>
                );
              })}
            </div>
          </>
        )}

        <div className="row" style={{ marginTop: 8 }}>
          <Link to="/tutorial" className="btn ghost">
            {t("tutorial")}
          </Link>
          <Link to="/calibrate" className="btn ghost">
            {t("calibrate")}
          </Link>
        </div>
      </div>
    </>
  );
}
