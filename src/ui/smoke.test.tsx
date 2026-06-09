// @vitest-environment jsdom
//
// Render smoke tests: mount the screens that don't need camera/sensor APIs
// and assert they produce their key content. This is the CI net for the class
// of failure the runtime ErrorBoundary exists for — a screen that throws on
// render — which the pure domain tests can't catch.
import { describe, it, expect, beforeEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { AppProvider } from "./AppContext";
import { App } from "./App";
import type { Stand } from "../storage/types";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const STAND: Stand = {
  id: "stand-1",
  name: "Testskiftet",
  createdAt: "2026-06-01T08:00:00.000Z",
  meanHeightM: 22,
  points: [
    {
      id: "point-1",
      createdAt: "2026-06-01T08:10:00.000Z",
      baf: 2,
      borderlinePolicy: "half",
      trees: [
        { call: "in", species: "pine" },
        { call: "in", species: "spruce", dbhCm: 28 },
        { call: "borderline", species: "pine" },
        { call: "out" },
      ],
      lat: 59.3293,
      lng: 18.0686,
      accuracyM: 8,
      startHeadingDeg: 180,
      notes: "smoke fixture",
    },
  ],
};

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function renderAt(path: string): string {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(
      <MemoryRouter initialEntries={[path]}>
        <AppProvider>
          <App />
        </AppProvider>
      </MemoryRouter>,
    );
  });
  return container.textContent ?? "";
}

beforeEach(() => {
  if (root) act(() => root!.unmount());
  root = null;
  container?.remove();
  container = null;
  localStorage.clear();
  localStorage.setItem("relascope.stands.v1", JSON.stringify([STAND]));
});

describe("screen render smoke tests", () => {
  it("home lists the stand", () => {
    expect(renderAt("/")).toContain("Testskiftet");
  });

  it("stand screen shows basal area, species mix and volume estimate", () => {
    const text = renderAt("/stand/stand-1");
    // BAF 2 × (2 + ½) = 5 m²/ha
    expect(text).toContain("5.0");
    expect(text).toContain("Pine");
    expect(text).toContain("Spruce");
    // V = 0.5 × 5 × 22 = 55 m³/ha
    expect(text).toContain("55");
  });

  it("report renders the summary and method note", () => {
    const text = renderAt("/stand/stand-1/report");
    expect(text).toContain("Testskiftet");
    expect(text).toContain("m³/ha");
    expect(text).toContain("F = 0.5");
  });

  it("settings renders all sections", () => {
    const text = renderAt("/settings");
    expect(text).toContain("BAF");
    expect(text).toContain("feedback");
  });

  it("tutorial renders", () => {
    expect(renderAt("/tutorial").length).toBeGreaterThan(100);
  });
});
