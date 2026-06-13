import { useApp } from "../AppContext";

// Relascope is the free, top-of-funnel field tool. This card is the bridge
// into the full BeetleSense monitoring platform — shown at high-intent
// moments (right after a measurement) to convert a one-tree user into a
// whole-forest user.
export const BEETLESENSE_URL = "https://beetlesense.ai";

export function BeetleSenseHook() {
  const { t } = useApp();
  return (
    <a
      href={BEETLESENSE_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="bs-hook"
    >
      <div className="bs-hook-head">
        <span className="bs-hook-dot" aria-hidden />
        <span className="bs-hook-brand">BeetleSense</span>
      </div>
      <div className="bs-hook-title">{t("bsHookTitle")}</div>
      <p className="bs-hook-body">{t("bsHookBody")}</p>
      <span className="bs-hook-cta">
        {t("bsHookCta")} <span aria-hidden>→</span>
      </span>
    </a>
  );
}

// A spruce share at or above this fraction of basal area flags the stand as
// bark-beetle territory (spruce is the beetle's host).
export const SPRUCE_RISK_THRESHOLD_PCT = 40;

// Data-driven funnel: only fires on the owner's own spruce-heavy stands, and
// bridges straight into BeetleSense's outbreak-monitoring product — the most
// honest hook we have because the risk is real and computed from their sweep.
export function BeetleRiskHook({ sprucePct }: { sprucePct: number }) {
  const { t } = useApp();
  const pct = Math.round(sprucePct);
  return (
    <a
      href={BEETLESENSE_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="bs-hook bs-hook--risk"
    >
      <div className="bs-hook-head">
        <span className="bs-hook-dot" aria-hidden />
        <span className="bs-hook-brand">⚠ {t("beetleRiskBrand")}</span>
      </div>
      <div className="bs-hook-title">{t("beetleRiskTitle", { pct })}</div>
      <p className="bs-hook-body">{t("beetleRiskBody")}</p>
      <span className="bs-hook-cta">
        {t("beetleRiskCta")} <span aria-hidden>→</span>
      </span>
    </a>
  );
}
