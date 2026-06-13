import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useApp } from "../AppContext";
import { BAF_PRESETS, type Language } from "../../storage/types";
import type { BorderlinePolicy } from "../../domain/relascope";
import { backupToJson, parseBackup } from "../../storage/backup";
import { downloadText } from "../../storage/export";
import { TopBar } from "../components/TopBar";

export function SettingsScreen() {
  const { stands, settings, updateSettings, restoreAll, t } = useApp();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [restoreMsg, setRestoreMsg] = useState<"done" | "invalid" | null>(null);

  const exportBackup = () => {
    const date = new Date().toISOString().slice(0, 10);
    downloadText(`relascope-backup-${date}.json`, backupToJson(stands, settings), "application/json");
  };

  const onRestoreFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const { stands: nextStands, settings: nextSettings } = parseBackup(await file.text());
      if (!confirm(t("restoreConfirm"))) return;
      restoreAll(nextStands, nextSettings);
      setRestoreMsg("done");
    } catch {
      setRestoreMsg("invalid");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <>
      <TopBar title={t("settings")} />
      <div className="content stack">

        {/* Preferences card */}
        <div className="card stack">
          <div className="section-label" style={{ marginBottom: 4 }}>Preferences</div>

          <div>
            <label className="field">{t("language")}</label>
            <div className="seg">
              {(["en", "sv"] as Language[]).map((lang) => (
                <button
                  key={lang}
                  className={settings.language === lang ? "active" : ""}
                  onClick={() => updateSettings({ language: lang })}
                >
                  {lang === "en" ? "English" : "Svenska"}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="field">{t("defaultBaf")}</label>
            <div className="seg">
              {BAF_PRESETS.map((b) => (
                <button
                  key={b}
                  className={settings.defaultBaf === b ? "active" : ""}
                  onClick={() => updateSettings({ defaultBaf: b })}
                >
                  {b}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="field">{t("borderlinePolicy")}</label>
            <div className="seg">
              {(
                [
                  ["half", t("halfTree")],
                  ["confirm", t("confirmDistance")],
                ] as [BorderlinePolicy, string][]
              ).map(([policy, label]) => (
                <button
                  key={policy}
                  className={settings.borderlinePolicy === policy ? "active" : ""}
                  onClick={() => updateSettings({ borderlinePolicy: policy })}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="field">{t("slopeCompensation")}</label>
            <div className="seg">
              {(
                [
                  [true, t("slopeOn")],
                  [false, t("slopeOff")],
                ] as [boolean, string][]
              ).map(([on, label]) => (
                <button
                  key={String(on)}
                  className={settings.slopeCompensation === on ? "active" : ""}
                  onClick={() => updateSettings({ slopeCompensation: on })}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="muted" style={{ fontSize: 13, margin: "6px 0 0" }}>
              {t("slopeHelp")}
            </p>
          </div>

          <div>
            <label className="field">{t("eyeHeight")}</label>
            <input
              type="number"
              inputMode="decimal"
              step="0.05"
              value={settings.eyeHeightM}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                if (v > 0) updateSettings({ eyeHeightM: v });
              }}
            />
            <p className="muted" style={{ fontSize: 13, margin: "6px 0 0" }}>
              {t("eyeHeightHelp")}
            </p>
          </div>

          <div>
            <label className="field">{t("sunlightMode")}</label>
            <div className="seg">
              {(
                [
                  [true, t("slopeOn")],
                  [false, t("slopeOff")],
                ] as [boolean, string][]
              ).map(([on, label]) => (
                <button
                  key={String(on)}
                  className={settings.sunlightMode === on ? "active" : ""}
                  onClick={() => updateSettings({ sunlightMode: on })}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="muted" style={{ fontSize: 13, margin: "6px 0 0" }}>
              {t("sunlightHelp")}
            </p>
          </div>
        </div>

        {/* Calibration card */}
        <div className="card stack">
          <div className="section-label" style={{ marginBottom: 4 }}>Camera calibration</div>
          <div className="metric">
            <span>{t("calibration")}</span>
            <span className="value" style={{ fontSize: 18 }}>
              {settings.hfovDeg}°{" "}
              <span className={`tag ${settings.calibrated ? "measured" : "estimate"}`}>
                {settings.calibrated ? t("calibrated") : t("estimate")}
              </span>
            </span>
          </div>
          <p className="muted" style={{ fontSize: 13, margin: 0 }}>
            {settings.lastCheckAt
              ? `${t("lastVerified")}: ${new Date(settings.lastCheckAt).toLocaleDateString()} · ${t("baBias")} ${settings.lastCheckBiasPct ?? 0}%`
              : t("neverVerified")}
          </p>
          <Link to="/verify" className="btn ghost" style={{ justifyContent: "flex-start" }}>
            {t("verifyCalibration")}
          </Link>
        </div>

        {/* Backup card */}
        <div className="card stack">
          <div className="section-label" style={{ marginBottom: 4 }}>{t("backup")}</div>
          <p className="muted" style={{ fontSize: 13, margin: 0 }}>
            {t("backupHelp")}
          </p>
          <button className="btn" onClick={exportBackup}>
            {t("exportBackup")}
          </button>
          <button className="btn ghost" onClick={() => fileRef.current?.click()}>
            {t("restoreBackup")}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            style={{ display: "none" }}
            onChange={(e) => onRestoreFile(e.target.files?.[0])}
          />
          {restoreMsg === "done" && <div className="banner ok">{t("restoreDone")}</div>}
          {restoreMsg === "invalid" && <div className="banner warn">{t("restoreInvalid")}</div>}
        </div>

        {/* Feedback card */}
        <div className="card stack">
          <div className="section-label" style={{ marginBottom: 4 }}>{t("feedback")}</div>
          <p className="muted" style={{ fontSize: 13, margin: 0 }}>
            {t("feedbackHelp")}
          </p>
          <a
            className="btn"
            href={`mailto:christo@beetlesense.com?subject=${encodeURIComponent("Digital Relascope feedback")}`}
          >
            ✉ {t("feedback")}
          </a>
        </div>

        <p className="muted" style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, letterSpacing: "0.1em", textAlign: "center", textTransform: "uppercase" }}>
          ✓ {t("offlineReady")}
        </p>
      </div>
    </>
  );
}
