import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../AppContext";
import { useCamera, useMotion, useWakeLock } from "../hooks";
import {
  markerSpanFramePx,
  frameWidthToAngleDeg,
  distanceFromEyeHeightM,
  diameterFromAngleCm,
  treeHeightM,
  stemVolumeM3,
} from "../../domain/relascope";
import { EdgeMarkerOverlay, useEdgeMarkers } from "../components/EdgeMarkers";
import { newId } from "../../storage/store";

const DEG = Math.PI / 180;

type Step = "base" | "top" | "result" | "thick";

export function MeasureScreen() {
  const { settings, saveMeasurement, t } = useApp();
  const navigate = useNavigate();
  const stageRef = useRef<HTMLDivElement | null>(null);
  const { videoRef, start, stop, error, ready, frame } = useCamera();
  const { pitchDeg, needsPermission, active, start: startMotion } = useMotion();
  const { left, right, onPointerDown, reset: resetMarkers } = useEdgeMarkers(stageRef);
  useWakeLock(true);

  const [step, setStep] = useState<Step>("base");
  const [err, setErr] = useState<string | null>(null);
  const [distanceM, setDistanceM] = useState<number | null>(null);
  const [baseAngle, setBaseAngle] = useState<number | null>(null);
  const [heightM, setHeightM] = useState<number | null>(null);
  const [dbhCm, setDbhCm] = useState<number | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    start();
    return () => stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-save when height result is ready
  useEffect(() => {
    if (step === "result" && heightM !== null && !saved) {
      saveMeasurement({
        id: newId(),
        createdAt: new Date().toISOString(),
        heightM,
        dbhCm: dbhCm ?? null,
        woodVolumeM3: woodVolumeM3 ?? null,
      });
      setSaved(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, heightM, dbhCm, saved]);

  const pitch = active && pitchDeg !== null ? pitchDeg : 0;

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

  const measureBase = () => {
    if (pitchDeg === null) return;
    const d = distanceFromEyeHeightM(settings.eyeHeightM, -pitchDeg);
    if (d <= 0) {
      setErr(t("errAimLower"));
      return;
    }
    setDistanceM(d);
    setBaseAngle(pitchDeg);
    setErr(null);
    if (navigator.vibrate) navigator.vibrate(25);
    setStep("top");
  };

  const measureTop = () => {
    if (pitchDeg === null || distanceM === null || baseAngle === null) return;
    const h = treeHeightM(distanceM, baseAngle, pitchDeg);
    if (h === null) {
      setErr(t("errAimHigher"));
      return;
    }
    setHeightM(h);
    setErr(null);
    if (navigator.vibrate) navigator.vibrate(25);
    setStep("result");
  };

  const measureThickness = () => {
    if (distanceM === null) return;
    const angle = currentAngleDeg();
    if (angle <= 0) return;
    setDbhCm(diameterFromAngleCm(angle, distanceM / Math.cos(pitch * DEG)));
    if (navigator.vibrate) navigator.vibrate(25);
    setSaved(false); // re-save with thickness
    setStep("result");
  };

  const woodVolumeM3 =
    dbhCm !== null && dbhCm > 0
      ? stemVolumeM3([{ heightM: 1.3, diameterCm: dbhCm }], heightM ?? undefined)
      : null;

  const startOver = () => {
    setDistanceM(null);
    setBaseAngle(null);
    setHeightM(null);
    setDbhCm(null);
    setErr(null);
    setSaved(false);
    resetMarkers();
    setStep("base");
  };

  if (error === "camera-denied") {
    return (
      <div className="content stack" style={{ justifyContent: "center", minHeight: "70vh" }}>
        <div className="banner warn">{t("cameraDenied")}</div>
        <button className="btn" onClick={() => navigate("/")}>
          {t("back")}
        </button>
      </div>
    );
  }

  // ---- Result screen ----
  if (step === "result") {
    return (
      <div className="content stack" style={{ minHeight: "100dvh", justifyContent: "center" }}>
        <div className="result-hero">
          <div className="tree-icon">🌲</div>
          <div className="result-label">{t("resultTitle")}</div>
          <div className="result-number">
            {heightM !== null ? heightM.toFixed(1) : "—"}
            <span className="result-unit">m {t("resultTall")}</span>
          </div>
          {saved && (
            <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, letterSpacing: "0.12em", color: "var(--acc)", marginTop: 10, textTransform: "uppercase" }}>
              ✓ Saved
            </div>
          )}
        </div>

        {dbhCm !== null && (
          <div className="result-tiles">
            <div className="result-tile">
              <div className="rt-val">{dbhCm.toFixed(0)}<span className="rt-unit"> cm</span></div>
              <div className="rt-label">{t("thickResult")}</div>
            </div>
            {woodVolumeM3 !== null && (
              <div className="result-tile">
                <div className="rt-val">{woodVolumeM3.toFixed(2)}<span className="rt-unit"> m³</span></div>
                <div className="rt-label">{t("woodVolume")}</div>
              </div>
            )}
          </div>
        )}

        <div className="stack">
          {dbhCm === null && (
            <button className="btn" onClick={() => { setErr(null); setSaved(false); setStep("thick"); }}>
              {t("addThickness")}
            </button>
          )}
          <button className="btn primary" onClick={startOver}>
            {t("measureAnother")}
          </button>
          <button className="btn ghost" onClick={() => navigate("/")}>
            {t("finishDone")}
          </button>
        </div>

        {/* Feedback nudge */}
        <a
          href={`mailto:christo@beetlesense.com?subject=${encodeURIComponent("Digital Relascope feedback")}`}
          style={{ display: "block", textAlign: "center", fontFamily: "'Space Mono', monospace", fontSize: 10.5, letterSpacing: "0.08em", color: "var(--muted)", textDecoration: "none", paddingTop: 4 }}
        >
          📬 {t("feedbackNudge")}
        </a>
      </div>
    );
  }

  // ---- Camera steps (base / top / thick) ----
  const stepConfig =
    step === "base"
      ? { num: 1, title: t("mBaseTitle"), hint: t("mBaseHint"), btn: t("mBaseBtn"), onTap: measureBase }
      : step === "top"
        ? { num: 2, title: t("mTopTitle"), hint: t("mTopHint"), btn: t("mTopBtn"), onTap: measureTop }
        : { num: 3, title: t("thickTitle"), hint: t("thickHint"), btn: t("thickBtn"), onTap: measureThickness };

  return (
    <div className="sweep" ref={stageRef}>
      <video ref={videoRef} playsInline muted />
      <div className="sweep-overlay">
        {step !== "thick" && (
          <>
            <div className="sight-line" />
            <div className="aim-dot" />
          </>
        )}
        {step === "thick" && ready && <EdgeMarkerOverlay left={left} right={right} onPointerDown={onPointerDown} />}
      </div>

      <div className="sweep-hud">
        <button
          className="btn small ghost"
          onClick={() => navigate("/")}
          aria-label={t("back")}
          style={{ backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)", background: "rgba(0,0,0,0.4)", borderColor: "rgba(255,255,255,0.18)", color: "#fff" }}
        >
          ✕
        </button>
      </div>

      <div className="wizard-panel">
        <div className="step-num">{t("mStep", { n: stepConfig.num, total: 3 })}</div>
        <div className="step-title">{stepConfig.title}</div>
        <p className="step-hint">{stepConfig.hint}</p>
        {err && <p className="inline-err">{err}</p>}

        {!active && needsPermission ? (
          <div>
            {/* Bullet-point trust signals for iOS sensor */}
            <div style={{ background: "rgba(67,217,163,0.08)", border: "1px solid rgba(67,217,163,0.22)", borderRadius: 14, padding: "12px 14px", marginBottom: 12 }}>
              {[t("iosSensorBullet1"), t("iosSensorBullet2")].map((line) => (
                <div key={line} style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 6 }}>
                  <span style={{ color: "var(--acc)", flexShrink: 0 }}>✓</span>
                  <span style={{ fontSize: 14, color: "#cfeede", lineHeight: 1.35 }}>{line}</span>
                </div>
              ))}
            </div>
            {/* Full transparency note — kept for e2e test assertions */}
            <p className="step-hint" style={{ fontSize: 13, marginBottom: 14 }}>{t("iosSensorNote")}</p>
            <button className="btn primary big-cta" onClick={startMotion}>
              {t("mTurnOn")}
            </button>
          </div>
        ) : (
          <button className="btn primary big-cta" onClick={stepConfig.onTap}>
            {stepConfig.btn}
          </button>
        )}

        {step === "thick" && !settings.calibrated && (
          <p className="step-hint" style={{ fontSize: 14, margin: "12px 0 0" }}>
            {t("thickCalibNote")}{" "}
            <button
              className="btn small ghost"
              style={{ display: "inline-flex", marginTop: 8 }}
              onClick={() => navigate("/calibrate")}
            >
              {t("setUpCamera")}
            </button>
          </p>
        )}
      </div>
    </div>
  );
}
