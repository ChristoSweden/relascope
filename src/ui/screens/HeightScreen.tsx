import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useApp } from "../AppContext";
import { getStand } from "../../storage/store";
import { useCamera, useMotion, useWakeLock } from "../hooks";
import { treeHeightM } from "../../domain/relascope";

/**
 * Phone clinometer (hypsometer): measure tree height from a known distance by
 * sighting the trunk base and the top against the on-screen horizontal line.
 * h = d·(tan θtop − tan θbase). Feeds the stand's mean height so the volume
 * estimate rests on a measurement instead of a guess.
 */
export function HeightScreen() {
  const { standId } = useParams();
  const { stands, upsertStand, t } = useApp();
  const navigate = useNavigate();
  const stand = getStand(stands, standId ?? "");

  const { videoRef, start, stop, error } = useCamera();
  const { pitchDeg, needsPermission, active, start: startMotion } = useMotion();
  useWakeLock(true);

  const [distance, setDistance] = useState("15");
  const [baseAngle, setBaseAngle] = useState<number | null>(null);
  const [topAngle, setTopAngle] = useState<number | null>(null);

  useEffect(() => {
    start();
    return () => stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const d = parseFloat(distance.replace(",", "."));
  const height =
    baseAngle !== null && topAngle !== null && d > 0 ? treeHeightM(d, baseAngle, topAngle) : null;

  const mark = (which: "base" | "top") => {
    if (pitchDeg === null) return;
    if (which === "base") setBaseAngle(pitchDeg);
    else setTopAngle(pitchDeg);
    if (navigator.vibrate) navigator.vibrate(25);
  };

  const saveAsMeanHeight = () => {
    if (!stand || height === null) return;
    upsertStand({ ...stand, meanHeightM: Math.round(height * 10) / 10 });
    navigate(`/stand/${stand.id}`);
  };

  if (error === "camera-denied") {
    return (
      <div className="content stack">
        <div className="banner warn">{t("cameraDenied")}</div>
        <button className="btn" onClick={() => navigate(-1)}>
          {t("back")}
        </button>
      </div>
    );
  }

  return (
    <div className="sweep">
      <video ref={videoRef} playsInline muted />
      <div className="sweep-overlay">
        <div className="sight-line" />
      </div>

      <div className="sweep-hud">
        <button className="btn small ghost" onClick={() => navigate(-1)} aria-label={t("back")}>
          ✕
        </button>
        <div className="count-pill" style={{ flex: 1, textAlign: "center" }}>
          {t("heightTool")}
          {active && pitchDeg !== null ? ` · ${pitchDeg.toFixed(1)}°` : ""}
        </div>
      </div>

      <div className="sweep-controls">
        <p className="align-hint" style={{ marginBottom: 8 }}>
          {t("heightHelp")}
        </p>

        {needsPermission && !active && (
          <button className="btn ghost" style={{ marginBottom: 10 }} onClick={startMotion}>
            {t("enableMotion")}
          </button>
        )}

        <label className="field">{t("distanceToTree")}</label>
        <input
          type="number"
          inputMode="decimal"
          value={distance}
          onChange={(e) => setDistance(e.target.value)}
        />

        <div className="row" style={{ marginTop: 10, gap: 8 }}>
          <button className="btn" onClick={() => mark("base")} disabled={pitchDeg === null}>
            {t("markBase")}
            {baseAngle !== null ? ` ✓ ${baseAngle.toFixed(1)}°` : ""}
          </button>
          <button className="btn" onClick={() => mark("top")} disabled={pitchDeg === null}>
            {t("markTop")}
            {topAngle !== null ? ` ✓ ${topAngle.toFixed(1)}°` : ""}
          </button>
        </div>

        <div className="metric" style={{ marginTop: 10 }}>
          <span>
            {t("treeHeight")} <span className="tag estimate">{t("estimate")}</span>
          </span>
          <span className="value">
            {height !== null ? (
              <>
                {height.toFixed(1)} <span className="unit">m</span>
              </>
            ) : (
              "—"
            )}
          </span>
        </div>

        <button
          className="btn primary"
          style={{ marginTop: 8 }}
          disabled={height === null || !stand}
          onClick={saveAsMeanHeight}
        >
          {t("useAsMeanHeight")}
        </button>
      </div>
    </div>
  );
}
