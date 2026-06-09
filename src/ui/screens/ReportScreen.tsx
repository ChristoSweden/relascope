import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useApp } from "../AppContext";
import { getStand } from "../../storage/store";
import { aggregateStand, computePointMetrics } from "../../domain/relascope";

// One-page stand report (PRD §5.5 follow-up): a print-styled summary the owner
// can hand to a forester or timber buyer. Uses the browser's print-to-PDF so it
// works offline with zero dependencies. The route renders light-on-white
// regardless of theme so the PDF looks like a document, not an app screenshot.
export function ReportScreen() {
  const { standId } = useParams();
  const { stands, settings, t } = useApp();
  const navigate = useNavigate();
  const stand = getStand(stands, standId ?? "");

  // Browsers use document.title as the default PDF filename.
  useEffect(() => {
    if (!stand) return;
    const prev = document.title;
    document.title = `${stand.name} — ${t("report")}`;
    return () => {
      document.title = prev;
    };
  }, [stand, t]);

  if (!stand) {
    navigate("/");
    return null;
  }

  const metrics = stand.points.map((p) => computePointMetrics(p.trees, p.baf, p.borderlinePolicy));
  const agg = aggregateStand(metrics.map((m) => m.basalAreaPerHa));
  const locale = settings.language === "sv" ? "sv-SE" : "en-GB";
  const fmtDate = (iso: string) => new Date(iso).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" });

  const calibDesc = !settings.calibrated
    ? t("calibDefaultDesc", { hfov: settings.hfovDeg })
    : settings.lastCheckAt
      ? t("calibVerifiedDesc", {
          hfov: settings.hfovDeg,
          date: new Date(settings.lastCheckAt).toLocaleDateString(locale),
          pct: settings.lastCheckBiasPct ?? 0,
        })
      : t("calibUncheckedDesc", { hfov: settings.hfovDeg });

  const methodNote = t("methodNote", {
    slope: settings.slopeCompensation ? t("slopeOn") : t("slopeOff"),
    policy: settings.borderlinePolicy === "half" ? t("policyHalfDesc") : t("policyConfirmDesc"),
    calib: calibDesc,
  });

  return (
    <div className="report">
      <div className="report-actions no-print">
        <button className="btn small ghost" onClick={() => navigate(-1)}>
          ← {t("back")}
        </button>
        <button className="btn small primary" onClick={() => window.print()}>
          {t("printSavePdf")}
        </button>
      </div>

      <header>
        <h1>{stand.name}</h1>
        <p className="report-sub">
          {t("appName")} · {t("reportGenerated")} {fmtDate(new Date().toISOString())}
        </p>
      </header>

      <section>
        <h2>{t("summary")}</h2>
        <table className="report-summary">
          <tbody>
            <tr>
              <th>{t("meanWithSpread")}</th>
              <td>
                <strong>{agg.meanBasalAreaPerHa.toFixed(1)} m²/ha</strong> ± {agg.standardError.toFixed(1)} (SE)
              </td>
            </tr>
            <tr>
              <th>{t("coefficientOfVariation")}</th>
              <td>{agg.coefficientOfVariationPct.toFixed(0)} %</td>
            </tr>
            <tr>
              <th>{t("pointsUsed")}</th>
              <td>{agg.pointCount}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section>
        <h2>{t("points")}</h2>
        <table className="report-points">
          <thead>
            <tr>
              <th>{t("pointCol")}</th>
              <th>{t("dateCol")}</th>
              <th>{t("locationCol")}</th>
              <th>{t("baf")}</th>
              <th>{t("countsCol")}</th>
              <th>{t("basalAreaPerHa")}</th>
              <th>{t("stemsPerHa")}*</th>
              <th>{t("meanDbh")}*</th>
              <th>{t("notesCol")}</th>
            </tr>
          </thead>
          <tbody>
            {stand.points.map((p, i) => {
              const m = metrics[i];
              return (
                <tr key={p.id}>
                  <td>{i + 1}</td>
                  <td>{fmtDate(p.createdAt)}</td>
                  <td>
                    {p.lat !== null ? `${p.lat.toFixed(5)}, ${p.lng!.toFixed(5)}` : "—"}
                    {p.accuracyM !== null ? ` (±${Math.round(p.accuracyM)} m)` : ""}
                  </td>
                  <td>{p.baf}</td>
                  <td>
                    {m.inCount} / {m.borderlineCount} / {m.outCount}
                  </td>
                  <td>{m.basalAreaPerHa.toFixed(1)} m²/ha</td>
                  <td>{m.stemsPerHa !== null ? Math.round(m.stemsPerHa) : "—"}</td>
                  <td>{m.meanDbhCm !== null ? `${m.meanDbhCm.toFixed(0)} cm` : "—"}</td>
                  <td>{p.notes || ""}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="report-footnote">* {t("resultEstimated")}</p>
      </section>

      <section>
        <h2>{t("method")}</h2>
        <p className="report-method">{methodNote}</p>
      </section>
    </div>
  );
}
