// @vitest-environment jsdom
//
// The spruce → bark-beetle risk flag is a data-driven BeetleSense funnel: it
// must fire on the owner's own spruce-heavy stands (in both languages) and stay
// silent otherwise, so it never cries wolf. Driven headless from the stand
// result screen.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { AppProvider } from "./AppContext";
import { App } from "./App";
import type { Stand } from "../storage/types";
import type { TreeObservation } from "../domain/relascope";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function standWith(trees: TreeObservation[]): Stand {
  return {
    id: "s1",
    name: "Test",
    createdAt: "2026-06-01T08:00:00.000Z",
    meanHeightM: 22,
    points: [
      {
        id: "p1",
        createdAt: "2026-06-01T08:10:00.000Z",
        baf: 2,
        borderlinePolicy: "half",
        trees,
        lat: 59.3,
        lng: 18.0,
        accuracyM: 8,
        startHeadingDeg: 180,
        notes: "",
      },
    ],
  };
}

function render(stand: Stand, lang: "en" | "sv"): string {
  localStorage.clear();
  localStorage.setItem("relascope.stands.v1", JSON.stringify([stand]));
  localStorage.setItem("relascope.settings.v1", JSON.stringify({ calibrated: true, language: lang }));
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(
      <MemoryRouter initialEntries={["/stand/s1"]}>
        <AppProvider>
          <App />
        </AppProvider>
      </MemoryRouter>,
    );
  });
  return container.textContent ?? "";
}

afterEach(() => {
  if (root) act(() => root!.unmount());
  root = null;
  container?.remove();
  container = null;
});

// 3 spruce + 1 pine → spruce is 75% of basal area (above the 40% threshold).
const spruceHeavy: TreeObservation[] = [
  { call: "in", species: "spruce" },
  { call: "in", species: "spruce" },
  { call: "in", species: "spruce" },
  { call: "in", species: "pine" },
];

describe("bark-beetle risk flag", () => {
  beforeEach(() => localStorage.clear());

  it("fires on a spruce-heavy stand with the share, message and BeetleSense link", () => {
    const text = render(standWith(spruceHeavy), "en");
    expect(text).toContain("75% of this stand is spruce");
    expect(text).toContain("bark beetle");
    const link = container!.querySelector<HTMLAnchorElement>('a.bs-hook--risk');
    expect(link?.getAttribute("href")).toBe("https://beetlesense.ai");
    expect(link?.getAttribute("rel")).toContain("noopener");
  });

  it("speaks Swedish when the app is Swedish (no English leaks)", () => {
    const text = render(standWith(spruceHeavy), "sv");
    expect(text).toContain("75% av beståndet är gran");
    expect(text).toContain("granbarkborrens");
    expect(text).not.toContain("bark beetle");
  });

  it("stays silent on a pine-only stand", () => {
    const text = render(standWith([{ call: "in", species: "pine" }, { call: "in", species: "pine" }]), "en");
    expect(text).not.toContain("is spruce");
    expect(container!.querySelector("a.bs-hook--risk")).toBeNull();
  });
});
