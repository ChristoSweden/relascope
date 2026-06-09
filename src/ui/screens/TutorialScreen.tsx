import { useApp } from "../AppContext";
import { TopBar } from "../components/TopBar";

// Zero-training path (PRD §6): a short explainer of the in/out call against the
// gauge bar before the first real sweep.
export function TutorialScreen() {
  const { t } = useApp();
  return (
    <>
      <TopBar title={t("tutorial")} />
      <div className="content stack">
        <div className="card">
          <p style={{ marginTop: 0 }}>{t("tutorialBody")}</p>
        </div>
        <div className="card stack">
          <div className="row">
            <span className="tag measured">{t("in")}</span>
            <span>{t("inHint")}</span>
          </div>
          <div className="row">
            <span className="tag estimate">{t("borderline")}</span>
            <span>{t("bordHint")}</span>
          </div>
          <div className="row">
            <span className="tag">{t("out")}</span>
            <span>{t("outHint")}</span>
          </div>
        </div>
        <p className="muted" style={{ fontSize: 14 }}>
          G = {t("baf")} × {t("treeCount").toLowerCase()}
        </p>
      </div>
    </>
  );
}
