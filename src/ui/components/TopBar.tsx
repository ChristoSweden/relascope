import { useNavigate } from "react-router-dom";
import type { ReactNode } from "react";
import { useApp } from "../AppContext";

export function TopBar({ title, right }: { title: string; right?: ReactNode }) {
  const navigate = useNavigate();
  const { t } = useApp();
  return (
    <div className="topbar">
      <button
        className="btn small ghost"
        onClick={() => navigate(-1)}
        aria-label={t("back")}
        style={{ color: "var(--acc)", borderColor: "transparent" }}
      >
        ‹
      </button>
      <h1>{title}</h1>
      {right}
    </div>
  );
}
