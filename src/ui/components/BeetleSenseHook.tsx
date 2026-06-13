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
