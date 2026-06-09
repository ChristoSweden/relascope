import { Link } from "react-router-dom";
import { useApp } from "../AppContext";
import { BAF_PRESETS, type Language } from "../../storage/types";
import type { BorderlinePolicy } from "../../domain/relascope";
import { TopBar } from "../components/TopBar";

export function SettingsScreen() {
  const { settings, updateSettings, t } = useApp();

  return (
    <>
      <TopBar title={t("settings")} />
      <div className="content stack">
        <div className="card stack">
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

        <div className="card stack">
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
              ? `${t("lastVerified")}: ${new Date(settings.lastCheckAt).toLocaleDateString()} · ${t("baBias")} ${
                  settings.lastCheckBiasPct ?? 0
                }%`
              : t("neverVerified")}
          </p>
          <Link to="/verify" className="btn ghost">
            {t("verifyCalibration")}
          </Link>
        </div>

        <p className="muted" style={{ fontSize: 13, textAlign: "center" }}>
          ✓ {t("offlineReady")}
        </p>
      </div>
    </>
  );
}
