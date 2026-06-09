import { useEffect, useRef, useState } from "react";
import { useApp } from "../AppContext";
import { useCamera } from "../hooks";
import { coverDisplayScale, hfovFromCalibration } from "../../domain/relascope";
import { TopBar } from "../components/TopBar";

// Guided calibration (PRD §5.1): with no native camera intrinsics in a browser,
// we recover HFOV from a reference object of known width at a known distance.
// Markers are placed on the *displayed* (cover-cropped) preview, then converted
// back to native frame pixels so the result transfers exactly to the sweep view.
export function CalibrationScreen() {
  const { settings, updateSettings, t } = useApp();
  const { videoRef, start, stop, error, ready, frame } = useCamera();
  const stageRef = useRef<HTMLDivElement | null>(null);

  const [objectWidthM, setObjectWidthM] = useState("1");
  const [distanceM, setDistanceM] = useState("5");
  const [left, setLeft] = useState(0.3); // fractions of stage width
  const [right, setRight] = useState(0.7);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    start();
    return () => stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const save = () => {
    const w = parseFloat(objectWidthM);
    const d = parseFloat(distanceM);
    const stage = stageRef.current;
    if (!w || !d || !stage || !frame.width) return;
    const rect = stage.getBoundingClientRect();
    // Convert the marker span from displayed CSS px to native frame px,
    // undoing the object-fit: cover scale, so calibration is resolution- and
    // aspect-ratio-independent.
    const scale = coverDisplayScale(frame.width, frame.height, rect.width, rect.height);
    const objectCssPx = Math.abs(right - left) * rect.width;
    const objectFramePx = objectCssPx / scale;
    try {
      const hfov = hfovFromCalibration({
        objectWidthM: w,
        distanceM: d,
        objectFramePx,
        frameWidthPx: frame.width,
      });
      updateSettings({ hfovDeg: Math.round(hfov * 10) / 10, calibrated: true });
      setSaved(true);
    } catch {
      /* invalid inputs — ignore */
    }
  };

  return (
    <>
      <TopBar title={t("calibration")} />
      <div className="content stack">
        <p className="muted" style={{ marginTop: 0 }}>
          {t("calibInstructions")}
        </p>

        {error === "camera-denied" && <div className="banner warn">{t("cameraDenied")}</div>}

        <div className="calib-stage" ref={stageRef}>
          <video ref={videoRef} playsInline muted />
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

        <button className="btn primary" onClick={save}>
          {t("save")}
        </button>

        {saved && (
          <div className="banner ok">
            {t("calibSaved")} HFOV ≈ {settings.hfovDeg}°
          </div>
        )}
        <p className="muted" style={{ fontSize: 14 }}>
          {settings.calibrated ? `${t("calibrated")}: ` : ""}HFOV = {settings.hfovDeg}°
        </p>
      </div>
    </>
  );
}
