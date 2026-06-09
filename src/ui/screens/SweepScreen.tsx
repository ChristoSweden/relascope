import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useApp } from "../AppContext";
import { getStand, newId } from "../../storage/store";
import { useCamera, useHeading, useSweepProgress, useGeolocation } from "../hooks";
import { gaugeBarWidthPx, type TreeCall, type TreeObservation } from "../../domain/relascope";
import { BAF_PRESETS } from "../../storage/types";

export function SweepScreen() {
  const { standId } = useParams();
  const { stands, settings, upsertStand, t } = useApp();
  const navigate = useNavigate();
  const stand = getStand(stands, standId ?? "");

  const [baf, setBaf] = useState(settings.defaultBaf);
  const [trees, setTrees] = useState<TreeObservation[]>([]);
  const [viewportWidth, setViewportWidth] = useState(() => window.innerWidth);

  const { videoRef, start, stop, error, ready } = useCamera();
  const { heading, needsPermission, active, start: startHeading } = useHeading();
  const { swept, reset } = useSweepProgress(heading);
  const geo = useGeolocation();

  useEffect(() => {
    start();
    geo.capture();
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => {
      stop();
      window.removeEventListener("resize", onResize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const barWidth = useMemo(
    () => gaugeBarWidthPx(baf, settings.hfovDeg, viewportWidth),
    [baf, settings.hfovDeg, viewportWidth],
  );

  const inCount = trees.filter((x) => x.call === "in").length;
  const bordCount = trees.filter((x) => x.call === "borderline").length;

  const call = (c: TreeCall) => {
    const bearing = heading ?? undefined;
    setTrees((prev) => [...prev, { call: c, bearingDeg: bearing }]);
    if (navigator.vibrate) navigator.vibrate(c === "out" ? 10 : 25);
  };

  const undo = () => setTrees((prev) => prev.slice(0, -1));

  const finish = () => {
    if (!stand) return;
    const point = {
      id: newId(),
      createdAt: new Date().toISOString(),
      baf,
      borderlinePolicy: settings.borderlinePolicy,
      trees,
      lat: geo.coords?.lat ?? null,
      lng: geo.coords?.lng ?? null,
      accuracyM: geo.coords?.accuracyM ?? null,
      startHeadingDeg: heading,
      notes: "",
    };
    upsertStand({ ...stand, points: [...stand.points, point] });
    reset();
    navigate(`/stand/${stand.id}`);
  };

  if (!stand) {
    navigate("/");
    return null;
  }

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

  const sweptPct = Math.round((swept / 360) * 100);

  return (
    <div className="sweep">
      <video ref={videoRef} playsInline muted />
      <div className="sweep-overlay">
        <div className="gauge-bar" style={{ width: `${barWidth}px` }} />
      </div>

      <div className="sweep-hud">
        <button className="btn small ghost" onClick={() => navigate(-1)} aria-label={t("back")}>
          ✕
        </button>
        <div className="seg" style={{ flex: 1 }}>
          {BAF_PRESETS.map((b) => (
            <button key={b} className={b === baf ? "active" : ""} onClick={() => setBaf(b)}>
              {t("baf")} {b}
            </button>
          ))}
        </div>
      </div>

      <div className="sweep-controls">
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 10 }}>
          <div className="row" style={{ gap: 10 }}>
            <div className="ring" style={{ ["--pct" as string]: sweptPct }}>
              <span>{sweptPct}%</span>
            </div>
            <div className="count-pill">
              {t("treeCount")}: {inCount}
              {bordCount > 0 ? ` +${bordCount}½` : ""}
            </div>
          </div>
          <button className="btn small ghost" onClick={undo} disabled={trees.length === 0}>
            ↶
          </button>
        </div>

        {needsPermission && !active && (
          <button className="btn ghost" style={{ marginBottom: 10 }} onClick={startHeading}>
            {t("enableMotion")}
          </button>
        )}

        {ready && <div className="align-hint">{t("alignTrunk")}</div>}

        <div className="call-buttons">
          <button className="call-out" onClick={() => call("out")}>
            {t("out")}
            <span className="hint">{t("outHint")}</span>
          </button>
          <button className="call-bord" onClick={() => call("borderline")}>
            {t("borderline")}
            <span className="hint">{t("bordHint")}</span>
          </button>
          <button className="call-in" onClick={() => call("in")}>
            {t("in")}
            <span className="hint">{t("inHint")}</span>
          </button>
        </div>

        <button className="btn primary" onClick={finish}>
          {t("finishSweep")} · {(baf * (inCount + bordCount / 2)).toFixed(1)} m²/ha
        </button>
      </div>
    </div>
  );
}
