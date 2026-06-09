import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useApp } from "../AppContext";
import { getStand, newId } from "../../storage/store";
import { useCamera, useMotion, useSweepProgress, useGeolocation, useWakeLock } from "../hooks";
import {
  gaugeBarWidthPx,
  coverDisplayScale,
  limitingDistanceM,
  type TreeCall,
  type TreeObservation,
} from "../../domain/relascope";
import { BAF_PRESETS } from "../../storage/types";

export function SweepScreen() {
  const { standId } = useParams();
  const { stands, settings, upsertStand, t } = useApp();
  const navigate = useNavigate();
  const stand = getStand(stands, standId ?? "");

  const [baf, setBaf] = useState(settings.defaultBaf);
  const [trees, setTrees] = useState<TreeObservation[]>([]);
  const [viewport, setViewport] = useState({ w: window.innerWidth, h: window.innerHeight });
  const [confirming, setConfirming] = useState(false);

  const { videoRef, start, stop, error, ready, frame } = useCamera();
  const { heading, elevationDeg, needsPermission, active, start: startMotion } = useMotion();
  const { swept, reset } = useSweepProgress(heading);
  const geo = useGeolocation();
  useWakeLock(true); // a sweep must survive minutes without screen touches

  useEffect(() => {
    start();
    geo.capture();
    const onResize = () => setViewport({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    return () => {
      stop();
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const liveElevation = settings.slopeCompensation && active ? elevationDeg : 0;

  const displayScale = useMemo(
    () => coverDisplayScale(frame.width, frame.height, viewport.w, viewport.h),
    [frame.width, frame.height, viewport.w, viewport.h],
  );

  const barWidth = useMemo(() => {
    // Fall back to viewport width before camera metadata arrives.
    const frameW = frame.width || viewport.w;
    const scale = frame.width ? displayScale : 1;
    return gaugeBarWidthPx({
      baf,
      hfovDeg: settings.hfovDeg,
      frameWidthPx: frameW,
      displayScale: scale,
      elevationDeg: liveElevation,
    });
  }, [baf, settings.hfovDeg, frame.width, viewport.w, displayScale, liveElevation]);

  const inCount = trees.filter((x) => x.call === "in").length;
  const bordCount = trees.filter((x) => x.call === "borderline").length;

  const record = (obs: TreeObservation) => {
    setTrees((prev) => [...prev, obs]);
    if (navigator.vibrate) navigator.vibrate(obs.call === "out" ? 10 : 25);
  };

  const call = (c: TreeCall) => {
    if (c === "borderline" && settings.borderlinePolicy === "confirm") {
      setConfirming(true);
      return;
    }
    record({ call: c, bearingDeg: heading ?? undefined, elevationDeg: active ? elevationDeg : undefined });
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
  const sloping = settings.slopeCompensation && active && elevationDeg >= 3;

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

        {settings.slopeCompensation && active && (
          <div className="align-hint" style={{ marginBottom: 8 }}>
            {t("slopeLabel")}: {sloping ? `${elevationDeg.toFixed(0)}°` : t("level")}
            {sloping ? " · ✓" : ""}
          </div>
        )}

        {needsPermission && !active && (
          <button className="btn ghost" style={{ marginBottom: 10 }} onClick={startMotion}>
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

      {confirming && (
        <BorderlineConfirm
          baf={baf}
          onResolve={(resolvedCall, distanceM, dbhCm) => {
            record({
              call: resolvedCall,
              distanceM,
              dbhCm,
              bearingDeg: heading ?? undefined,
              elevationDeg: active ? elevationDeg : undefined,
            });
            setConfirming(false);
          }}
          onCancel={() => setConfirming(false)}
          t={t}
        />
      )}
    </div>
  );
}

/**
 * Resolve a borderline tree by measured distance + DBH against the BAF limiting
 * distance (PRD §5.2). Sharper than eyeballing the bar, and the entered DBH also
 * feeds stems/ha and mean-diameter estimates.
 */
function BorderlineConfirm({
  baf,
  onResolve,
  onCancel,
  t,
}: {
  baf: number;
  onResolve: (call: TreeCall, distanceM: number, dbhCm: number) => void;
  onCancel: () => void;
  t: (k: string, v?: Record<string, string | number>) => string;
}) {
  const [distance, setDistance] = useState("");
  const [dbh, setDbh] = useState("");

  const d = parseFloat(distance);
  const dia = parseFloat(dbh);
  const limit = dia > 0 ? limitingDistanceM(baf, dia) : null;
  const isIn = d > 0 && limit !== null ? d <= limit : null;

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginTop: 0 }}>{t("borderlineConfirm")}</h3>
        <p className="muted" style={{ marginTop: 0, fontSize: 14 }}>
          {t("borderlineConfirmHelp")}
        </p>
        <label className="field">{t("dbhCm")}</label>
        <input type="number" inputMode="decimal" value={dbh} onChange={(e) => setDbh(e.target.value)} />
        <label className="field" style={{ marginTop: 10 }}>
          {t("distanceM")}
        </label>
        <input
          type="number"
          inputMode="decimal"
          value={distance}
          onChange={(e) => setDistance(e.target.value)}
        />
        {limit !== null && (
          <p className="muted" style={{ fontSize: 13 }}>
            {t("limitDistance")}: ≤ {limit.toFixed(1)} m
            {isIn !== null && (
              <strong style={{ color: isIn ? "var(--green)" : "#94a3b8", marginLeft: 8 }}>
                → {isIn ? t("resolveIn") : t("resolveOut")}
              </strong>
            )}
          </p>
        )}
        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn ghost" onClick={onCancel}>
            {t("cancel")}
          </button>
          <button
            className="btn primary"
            disabled={isIn === null}
            onClick={() => onResolve(isIn ? "in" : "out", d, dia)}
          >
            {t("save")}
          </button>
        </div>
      </div>
    </div>
  );
}
