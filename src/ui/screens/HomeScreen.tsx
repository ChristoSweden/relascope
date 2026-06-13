import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useApp } from "../AppContext";
import { newId } from "../../storage/store";
import { computePointMetrics, aggregateStand } from "../../domain/relascope";

const ONBOARDED_KEY = "relascope.onboarded.v1";

/** Tree-height icon: vertical line + apex dot + base bar */
function TreeHeightIcon() {
  return (
    <div style={{ position: "relative", width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: 2, height: 26, background: "var(--acc)", borderRadius: 2, position: "relative" }}>
        <div style={{ position: "absolute", top: -4, left: "50%", transform: "translateX(-50%)", width: 7, height: 7, borderRadius: "50%", background: "var(--acc)" }} />
        <div style={{ position: "absolute", bottom: 0, left: -5, width: 12, height: 2, background: "var(--acc)", borderRadius: 2 }} />
      </div>
    </div>
  );
}

/** Relascope compass icon: partial-arc circle */
function RelaIcon() {
  return (
    <div style={{ position: "relative", width: 28, height: 28, borderRadius: "50%", border: "1.5px solid var(--line2)", display: "grid", placeItems: "center" }}>
      <div style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "conic-gradient(rgba(67,217,163,0.55) 0 130deg, transparent 130deg)" }} />
      <div style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--acc)", zIndex: 1 }} />
    </div>
  );
}

export function HomeScreen() {
  const { stands, upsertStand, t } = useApp();
  const navigate = useNavigate();
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

  // ---- First run ----
  if (!onboarded) {
    return (
      <div className="content stack" style={{ minHeight: "100dvh", justifyContent: "center" }}>
        <div className="onboard">
          <div className="onboard-emoji">🌲</div>
          <h1>{t("welcomeTitle")}</h1>
          <p>{t("welcomeBody")}</p>
          <p style={{ color: "var(--acc)" }}>{t("welcomeNew")}</p>
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
        <p className="muted" style={{ fontFamily: "'Space Mono', monospace", fontSize: 9.5, letterSpacing: "0.1em", textAlign: "center", margin: "4px auto 0", maxWidth: "38ch", textTransform: "uppercase" }}>
          🔒 {t("privacyNote")}
        </p>
      </div>
    );
  }

  // ---- Main launchpad ----
  return (
    <>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 11, padding: "14px 16px", borderBottom: "1px solid var(--line)", position: "sticky", top: 0, background: "rgba(5,15,10,0.88)", backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)", zIndex: 5 }}>
        <div className="logo-mark">
          <div className="logo-dot" />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.01em", lineHeight: 1 }}>Relascope</div>
          <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 9, letterSpacing: "0.18em", color: "var(--muted)", marginTop: 3, textTransform: "uppercase" }}>by BeetleSense</div>
        </div>
        <Link to="/settings" style={{ width: 40, height: 40, borderRadius: 12, border: "1px solid var(--line)", background: "rgba(255,255,255,0.03)", display: "grid", placeItems: "center", color: "var(--muted)", fontSize: 18, textDecoration: "none" }} aria-label={t("settings")}>
          ⚙
        </Link>
      </div>

      <div className="content stack">
        <div className="section-label">What do you want to do?</div>

        {/* Measure a tree — primary CTA */}
        <button className="home-cta primary" onClick={() => navigate("/measure")}>
          <div className="cta-icon"><TreeHeightIcon /></div>
          <div className="cta-body">
            <span className="cta-title">🌲 {t("measureTitle")}</span>
            <span className="cta-hint">{t("homeMeasureHint")}</span>
          </div>
          <span className="cta-arrow">›</span>
        </button>

        {/* Estimate my forest — secondary CTA */}
        <button className="home-cta" onClick={createStand}>
          <div className="cta-icon"><RelaIcon /></div>
          <div className="cta-body">
            <span className="cta-title">📐 {t("homeForestTitle")}</span>
            <span className="cta-hint">{t("homeForestHint")}</span>
          </div>
          <span className="cta-arrow">›</span>
        </button>

        {stands.length > 0 && (
          <>
            <div className="section-label" style={{ marginTop: 8 }}>{t("homeSavedTitle")}</div>
            <div className="stack" style={{ gap: 9 }}>
              {stands.map((stand) => {
                const agg = aggregateStand(
                  stand.points.map((p) => computePointMetrics(p.trees, p.baf, p.borderlinePolicy).basalAreaPerHa),
                );
                const pointsLabel = `${stand.points.length} ${t("points").toLowerCase()}`;
                const cvLabel = stand.points.length > 1 ? ` · CV ${agg.coefficientOfVariationPct.toFixed(0)}%` : "";
                return (
                  <Link key={stand.id} to={`/stand/${stand.id}`} className="stand-item">
                    <div className="stand-icon">
                      <div className="stand-icon-ring" />
                    </div>
                    <div className="stand-meta">
                      <div className="stand-name">{stand.name}</div>
                      <div className="stand-sub">{pointsLabel}{cvLabel}</div>
                    </div>
                    {stand.points.length > 0 && (
                      <div className="stand-ba">
                        <div className="stand-ba-val">{agg.meanBasalAreaPerHa.toFixed(1)}</div>
                        <span className="stand-ba-unit">m²/ha</span>
                      </div>
                    )}
                  </Link>
                );
              })}
            </div>
          </>
        )}

        <div className="row" style={{ marginTop: 4 }}>
          <Link to="/tutorial" className="btn ghost" style={{ fontSize: 14 }}>
            {t("tutorial")}
          </Link>
          <Link to="/calibrate" className="btn ghost" style={{ fontSize: 14 }}>
            {t("calibrate")}
          </Link>
        </div>

        <p style={{ fontFamily: "'Space Mono', monospace", fontSize: 9.5, letterSpacing: "0.1em", color: "var(--muted)", textAlign: "center", margin: "4px 0 0", lineHeight: 1.7, textTransform: "uppercase" }}>
          🔒 Nothing leaves your phone · Works offline
        </p>
      </div>
    </>
  );
}
