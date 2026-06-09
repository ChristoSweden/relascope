import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useApp } from "../AppContext";
import { useCamera } from "../hooks";
import {
  angleToFrameWidthPx,
  checkCalibration,
  coverDisplayScale,
  type CalibrationCheckResult,
} from "../../domain/relascope";
import { TopBar } from "../components/TopBar";

const DEG = Math.PI / 180;

// Calibration self-check: the inverse of the guided calibration. The app
// *predicts* where the edges of a known-width object should appear under the
// saved HFOV and draws that as a frame; the user marks the real edges and the
// app reports the implied basal-area bias. This is how the digital gauge proves
// it is as trustworthy as a physical relascope before a sweep.
export function VerifyScreen() {
  const { settings, updateSettings, t } = useApp();
  const { videoRef, start, stop, error, ready, frame } = useCamera();
  const stageRef = useRef<HTMLDivElement | null>(null);

  const [objectWidthM, setObjectWidthM] = useState("1");
  const [distanceM, setDistanceM] = useState("5");
  const [left, setLeft] = useState(0.3); // fractions of stage width
  const [right, setRight] = useState(0.7);
  const [result, setResult] = useState<CalibrationCheckResult | null>(null);
  const [stageW, setStageW] = useState(0);
  const [stageH, setStageH] = useState(0);

  useEffect(() => {
    start();
    return () => stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const update = () => {
      const rect = stage.getBoundingClientRect();
      setStageW(rect.width);
      setStageH(rect.height);
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [ready]);

  // Predicted on-screen span of the reference object under the saved HFOV.
  const predictedCssPx = useMemo(() => {
    const w = parseFloat(objectWidthM);
    const d = parseFloat(distanceM);
    if (!w || !d || w <= 0 || d <= 0 || !frame.width || !stageW) return 0;
    const expectedAngleDeg = (2 * Math.atan(w / 2 / d)) / DEG;
    const framePx = angleToFrameWidthPx(expectedAngleDeg, settings.hfovDeg, frame.width);
    const scale = coverDisplayScale(frame.width, frame.height, stageW, stageH);
    return framePx * scale;
  }, [objectWidthM, distanceM, frame.width, frame.height, stageW, stageH, settings.hfovDeg]);

  const drag = (which: "left" | "right") => (e: React.PointerEvent) => {
    e.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;
    const move = (ev: PointerEvent) => {
      const rect = stage.getBoundingClientRect();
      const frac = Math.min(1, Math.max(0, (ev.clientX - rect.left) / rect.width));
      if (which === "left") setLeft(Math.min(frac, right - 0.02));
      else setRight(Math.max(frac, left + 0.02));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const runCheck = () => {
    const w = parseFloat(objectWidthM);
    const d = parseFloat(distanceM);
    const stage = stageRef.current;
    if (!w || !d || !stage || !frame.width) return;
    const rect = stage.getBoundingClientRect();
    const scale = coverDisplayScale(frame.width, frame.height, rect.width, rect.height);
    const markedFramePx = (Math.abs(right - left) * rect.width) / scale;
    try {
      const res = checkCalibration({
        objectWidthM: w,
        distanceM: d,
        markedFramePx,
        frameWidthPx: frame.width,
        hfovDeg: settings.hfovDeg,
      });
      setResult(res);
      updateSettings({
        lastCheckBiasPct: Math.round(res.basalAreaBiasPct * 10) / 10,
        lastCheckAt: new Date().toISOString(),
      });
    } catch {
      /* invalid inputs — ignore */
    }
  };

  const biasStr = result ? Math.abs(result.basalAreaBiasPct).toFixed(1) : "";

  return (
    <>
      <TopBar title={t("verifyCalibration")} />
      <div className="content stack">
        <p className="muted" style={{ marginTop: 0 }}>
          {t("verifyInstructions")}
        </p>

        {error === "camera-denied" && <div className="banner warn">{t("cameraDenied")}</div>}

        <div className="calib-stage" ref={stageRef}>
          <video ref={videoRef} playsInline muted />
          {ready && predictedCssPx > 0 && (
            <div className="predicted-frame" style={{ width: `${predictedCssPx}px` }} />
          )}
          {ready && (
            <>
              <div className="calib-marker" style={{ left: `${left * 100}%` }} onPointerDown={drag("left")} />
              <div className="calib-marker" style={{ left: `${right * 100}%` }} onPointerDown={drag("right")} />
            </>
          )}
        </div>

        <div className="row">
          <div style={{ flex: 1 }}>
            <label className="field">{t("calibObjectWidth")}</label>
            <input
              type="number"
              inputMode="decimal"
              value={objectWidthM}
              onChange={(e) => setObjectWidthM(e.target.value)}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label className="field">{t("calibDistance")}</label>
            <input
              type="number"
              inputMode="decimal"
              value={distanceM}
              onChange={(e) => setDistanceM(e.target.value)}
            />
          </div>
        </div>

        <button className="btn primary" onClick={runCheck}>
          {t("check")}
        </button>

        {result && (
          <div className={`banner ${result.pass ? "ok" : "warn"}`}>
            {result.pass ? t("verifyPass", { pct: biasStr }) : t("verifyFail", { pct: biasStr })}
            <div style={{ marginTop: 6, fontSize: 13 }}>
              {t("angleError")}: {result.angleErrorPct.toFixed(1)}% · {t("baBias")}:{" "}
              {result.basalAreaBiasPct > 0 ? "+" : ""}
              {result.basalAreaBiasPct.toFixed(1)}%
            </div>
          </div>
        )}

        {result && !result.pass && (
          <Link to="/calibrate" className="btn">
            {t("recalibrate")}
          </Link>
        )}
      </div>
    </>
  );
}
