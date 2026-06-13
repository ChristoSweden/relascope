import { useEffect, useRef, useState } from "react";
import { useApp } from "../AppContext";
import { useCamera, useMotion, useWakeLock } from "../hooks";
import {
  markerSpanFramePx,
  frameWidthToAngleDeg,
  trunkSlantRangeM,
  horizontalDistanceM,
  distanceFromEyeHeightM,
  diameterFromAngleCm,
  treeHeightM,
  stemHeightAtAngleM,
  stemVolumeM3,
  breastHeightFormFactor,
  type StemSection,
} from "../../domain/relascope";
import { TopBar } from "../components/TopBar";
import { EdgeMarkerOverlay, useEdgeMarkers } from "../components/EdgeMarkers";

const DEG = Math.PI / 180;

/**
 * Single-tree measure tool — the relascope functions beyond basal area: optical
 * distance (incl. a clinometer range off eye height that needs no diameter),
 * upper-stem diameter at any height, and a Smalian stem volume with form factor.
 * Reuses the calibrated angle scale (HFOV via the edge markers) and the
 * inclinometer pitch the height tool already relies on.
 */
export function MeasureScreen() {
  const { settings, t } = useApp();
  const stageRef = useRef<HTMLDivElement | null>(null);
  const { videoRef, start, stop, error, ready, frame } = useCamera();
  const { pitchDeg, needsPermission, active, start: startMotion } = useMotion();
  const { left, right, onPointerDown, reset: resetMarkers } = useEdgeMarkers(stageRef);
  useWakeLock(true);

  const [dbh, setDbh] = useState("");
  const [manualDist, setManualDist] = useState("");
  const [distanceM, setDistanceM] = useState<number | null>(null);
  const [baseAngle, setBaseAngle] = useState<number | null>(null);
  const [topAngle, setTopAngle] = useState<number | null>(null);
  const [sections, setSections] = useState<StemSection[]>([]);

  useEffect(() => {
    start();
    return () => stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pitch = active && pitchDeg !== null ? pitchDeg : 0;

  // Edge-to-edge angle the markers currently span, via the shared helper.
  const currentAngleDeg = (): number => {
    const stage = stageRef.current;
    if (!stage || !frame.width) return 0;
    const rect = stage.getBoundingClientRect();
    const span = markerSpanFramePx({
      leftFrac: left,
      rightFrac: right,
      stageWidthPx: rect.width,
      stageHeightPx: rect.height,
      frameWidthPx: frame.width,
      frameHeightPx: frame.height,
    });
    return frameWidthToAngleDeg(span, settings.hfovDeg, frame.width);
  };

  // Distance, method A: clinometer range off eye height (no DBH). Sighting the
  // base also captures the base angle the height/sections need.
  const rangeFromBase = () => {
    if (pitchDeg === null) return;
    const d = distanceFromEyeHeightM(settings.eyeHeightM, -pitchDeg); // base is below eye
    if (d <= 0) return;
    setDistanceM(d);
    setBaseAngle(pitchDeg);
  };

  // Distance, method B: range off a known DBH (trunk as the "staff").
  const measureFromDbh = () => {
    const d = parseFloat(dbh);
    const angle = currentAngleDeg();
    if (!(d > 0) || angle <= 0) return;
    setDistanceM(horizontalDistanceM(trunkSlantRangeM(d, angle), pitch));
  };

  const useManualDistance = () => {
    const d = parseFloat(manualDist);
    if (d > 0) setDistanceM(d);
  };

  // With distance known, DBH is an optical read-out: mark the edges at breast
  // height and the angle gives the diameter.
  const readDbhOptically = () => {
    if (distanceM === null) return;
    const angle = currentAngleDeg();
    if (angle <= 0) return;
    setDbh(diameterFromAngleCm(angle, distanceM / Math.cos(pitch * DEG)).toFixed(0));
  };

  const addSection = () => {
    if (distanceM === null || baseAngle === null) return;
    const angle = currentAngleDeg();
    if (angle <= 0) return;
    const diameterCm = diameterFromAngleCm(angle, distanceM / Math.cos(pitch * DEG));
    const heightM = stemHeightAtAngleM(distanceM, baseAngle, pitch);
    setSections((prev) => [...prev, { heightM, diameterCm }].sort((a, b) => a.heightM - b.heightM));
  };

  const heightM =
    distanceM !== null && baseAngle !== null && topAngle !== null
      ? treeHeightM(distanceM, baseAngle, topAngle)
      : null;

  const dbhNum = parseFloat(dbh);
  const allSections: StemSection[] =
    dbhNum > 0 ? [{ heightM: 1.3, diameterCm: dbhNum }, ...sections] : sections;
  const volumeM3 = allSections.length > 0 ? stemVolumeM3(allSections, heightM ?? undefined) : null;
  const formFactor =
    volumeM3 !== null && dbhNum > 0 && heightM ? breastHeightFormFactor(volumeM3, dbhNum, heightM) : null;

  const hasDistance = distanceM !== null;

  const newTree = () => {
    setDbh("");
    setManualDist("");
    setDistanceM(null);
    setBaseAngle(null);
    setTopAngle(null);
    setSections([]);
    resetMarkers();
  };

  return (
    <>
      <TopBar
        title={t("measureTitle")}
        right={
          <button className="btn small ghost" onClick={newTree}>
            {t("newTree")}
          </button>
        }
      />
      <div className="content stack">
        <p className="muted" style={{ marginTop: 0 }}>
          {t("measureIntro")}
        </p>

        {!settings.calibrated && <div className="banner warn">{t("notCalibrated")}</div>}
        {error === "camera-denied" && <div className="banner warn">{t("cameraDenied")}</div>}

        <div className="calib-stage" ref={stageRef}>
          <video ref={videoRef} playsInline muted />
          {ready && <EdgeMarkerOverlay left={left} right={right} onPointerDown={onPointerDown} />}
          <div className="measure-pitch">
            {t("pitch")}: {active && pitchDeg !== null ? `${pitchDeg.toFixed(0)}°` : "—"}
          </div>
        </div>

        {needsPermission && !active && (
          <button className="btn ghost" onClick={startMotion}>
            {t("enableMotion")}
          </button>
        )}

        {/* Step 1 — distance */}
        <div className="card stack">
          <strong>{t("measureStepDistance")}</strong>
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>
            {t("rangeEyeHeightHelp", { h: settings.eyeHeightM })}
          </p>
          <button className="btn primary" onClick={rangeFromBase} disabled={!active}>
            {t("rangeFromBase")}
          </button>

          <div className="row" style={{ alignItems: "flex-end" }}>
            <div style={{ flex: 1 }}>
              <label className="field">{t("dbhCm")}</label>
              <input type="number" inputMode="decimal" value={dbh} onChange={(e) => setDbh(e.target.value)} />
            </div>
            <button className="btn small" style={{ width: "auto" }} onClick={readDbhOptically} disabled={!hasDistance || !ready}>
              {t("readDiameter")}
            </button>
          </div>
          <button className="btn ghost" onClick={measureFromDbh} disabled={!ready || !(parseFloat(dbh) > 0)}>
            {t("measureFromDbh")}
          </button>

          <div className="row">
            <input
              type="number"
              inputMode="decimal"
              placeholder={t("distanceToTree")}
              value={manualDist}
              onChange={(e) => setManualDist(e.target.value)}
            />
            <button className="btn small" style={{ width: "auto" }} onClick={useManualDistance}>
              {t("useManual")}
            </button>
          </div>
          {hasDistance && (
            <div className="banner ok">
              {t("distanceResult")}: <strong>{distanceM!.toFixed(1)} m</strong>
              {parseFloat(dbh) > 0 ? ` · DBH ${parseFloat(dbh).toFixed(0)} cm` : ""}
            </div>
          )}
        </div>

        {/* Step 2 — height */}
        <div className="card stack" style={{ opacity: hasDistance ? 1 : 0.5 }}>
          <strong>{t("measureStepHeight")}</strong>
          <div className="row">
            <button className="btn" onClick={() => pitchDeg !== null && setBaseAngle(pitchDeg)} disabled={!hasDistance || !active}>
              {t("markBase")}
              {baseAngle !== null ? ` ✓` : ""}
            </button>
            <button className="btn" onClick={() => pitchDeg !== null && setTopAngle(pitchDeg)} disabled={!hasDistance || !active}>
              {t("markTop")}
              {topAngle !== null ? ` ✓` : ""}
            </button>
          </div>
          {heightM !== null && (
            <div className="metric">
              <span>
                {t("treeHeight")} <span className="tag estimate">{t("estimate")}</span>
              </span>
              <span className="value">
                {heightM.toFixed(1)} <span className="unit">m</span>
              </span>
            </div>
          )}
        </div>

        {/* Step 3 — upper diameter + volume */}
        <div className="card stack" style={{ opacity: hasDistance && baseAngle !== null ? 1 : 0.5 }}>
          <strong>{t("measureStepDiameter")}</strong>
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>
            {t("measureDiameterHelp")}
          </p>
          <button className="btn" onClick={addSection} disabled={!hasDistance || baseAngle === null || !active}>
            {t("addSection")}
          </button>
          {sections.length > 0 && (
            <>
              <div className="stack" style={{ gap: 6 }}>
                {sections.map((s, i) => (
                  <div key={i} className="metric" style={{ padding: "6px 0" }}>
                    <span className="muted" style={{ fontSize: 14 }}>
                      {t("atHeight", { h: s.heightM.toFixed(1) })}
                    </span>
                    <span>
                      {s.diameterCm.toFixed(0)} <span className="unit">cm</span>
                    </span>
                  </div>
                ))}
              </div>
              <button className="btn small ghost" style={{ width: "auto" }} onClick={() => setSections((p) => p.slice(0, -1))}>
                ↶ {t("removeLast")}
              </button>
            </>
          )}
          {volumeM3 !== null && (
            <>
              <div className="metric">
                <span>
                  {t("stemVolume")} <span className="tag estimate">{t("estimate")}</span>
                </span>
                <span className="value">
                  {volumeM3.toFixed(3)} <span className="unit">m³</span>
                </span>
              </div>
              {formFactor !== null && (
                <div className="metric">
                  <span>{t("formFactor")}</span>
                  <span className="value">{formFactor.toFixed(2)}</span>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
