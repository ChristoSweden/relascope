import { useNavigate } from "react-router-dom";
import type { ReactNode } from "react";

export function TopBar({ title, right }: { title: string; right?: ReactNode }) {
  const navigate = useNavigate();
  return (
    <div className="topbar">
      <button
        className="btn small ghost"
        onClick={() => navigate(-1)}
        aria-label="Back"
        style={{ color: "var(--acc)", borderColor: "transparent" }}
      >
        ‹
      </button>
      <h1>{title}</h1>
      {right}
    </div>
  );
}
