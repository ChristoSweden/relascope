// @vitest-environment jsdom
//
// Automated click-through of the non-sensor user journeys — the flows that do
// NOT depend on a physical camera or tilt sensor and so can be driven headless:
//
//   A. Create a forest from Home → run a sweep (IN/BORD/OUT + undo) → see the
//      aggregated basal-area result, stems/ha and species mix → export CSV.
//   B. Settings language switch persists (EN → SV).
//   C. Backup restore through the Settings UI brings a stand back onto Home.
//   D. The BeetleSense funnel surfaces render (header link, home footer link,
//      measure-result hook card) and point at beetlesense.ai.
//
// Camera/tilt accuracy is intentionally out of scope here — that needs a real
// phone. This proves the app's logic, navigation, persistence and export wiring.
import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { AppProvider } from "./AppContext";
import { App } from "./App";
import { backupToJson } from "../storage/backup";
import { DEFAULT_SETTINGS, type Stand } from "../storage/types";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

let objectUrls = 0;

beforeAll(() => {
  // Android default: no requestPermission on the motion events → sensors attach
  // on mount without a gesture (matches a desktop/Android browser).
  (globalThis as Record<string, unknown>).DeviceMotionEvent = class {};
  (globalThis as Record<string, unknown>).DeviceOrientationEvent = class {};
  // Fake a working rear camera so SweepScreen reaches its live state.
  const track = { getCapabilities: () => ({}), applyConstraints: () => Promise.resolve(), stop: () => undefined };
  const stream = { getVideoTracks: () => [track], getTracks: () => [track] };
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia: () => Promise.resolve(stream) },
  });
  Object.defineProperty(window.HTMLMediaElement.prototype, "play", { configurable: true, value: () => Promise.resolve() });
  Object.defineProperty(window.HTMLVideoElement.prototype, "videoWidth", { configurable: true, get: () => 1920 });
  Object.defineProperty(window.HTMLVideoElement.prototype, "videoHeight", { configurable: true, get: () => 1080 });
  Element.prototype.getBoundingClientRect = () =>
    ({ width: 300, height: 225, top: 0, left: 0, right: 300, bottom: 225, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
  // jsdom has no Blob URL plumbing — count downloads so we can assert export fired.
  (URL as unknown as { createObjectURL: () => string }).createObjectURL = () => {
    objectUrls += 1;
    return "blob:mock";
  };
  (URL as unknown as { revokeObjectURL: () => void }).revokeObjectURL = () => undefined;
});

let root: Root | null = null;
let container: HTMLDivElement | null = null;

async function renderAt(path: string) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <MemoryRouter initialEntries={[path]}>
        <AppProvider>
          <App />
        </AppProvider>
      </MemoryRouter>,
    );
  });
}

beforeEach(() => {
  localStorage.clear();
  // Past the one-time onboarding AND calibration gate so Home shows the launchpad.
  localStorage.setItem("relascope.onboarded.v1", "1");
  localStorage.setItem("relascope.settings.v1", JSON.stringify({ calibrated: true }));
  objectUrls = 0;
});
afterEach(() => {
  if (root) act(() => root!.unmount());
  root = null;
  container?.remove();
  container = null;
});

const text = () => container?.textContent ?? "";

function clickText(label: string) {
  const btn = [...container!.querySelectorAll("button")].find((b) => (b.textContent ?? "").includes(label));
  if (!btn) throw new Error(`button "${label}" not found in: ${text().slice(0, 400)}`);
  act(() => btn.dispatchEvent(new MouseEvent("click", { bubbles: true })));
}

function clickSel(selector: string, index = 0) {
  const el = container!.querySelectorAll<HTMLElement>(selector)[index];
  if (!el) throw new Error(`selector "${selector}"[${index}] not found`);
  act(() => el.dispatchEvent(new MouseEvent("click", { bubbles: true })));
}

describe("automated click-through — non-sensor flows", () => {
  it("A. create a forest, run a sweep, and read the aggregated result + CSV", async () => {
    await renderAt("/");

    // Home launchpad → create a forest.
    expect(text()).toContain("Estimate my whole forest");
    clickText("Estimate my whole forest");

    // Landed on a fresh, empty stand → start a sweep.
    expect(text()).toContain("New sweep");
    clickText("New sweep");

    // Sweep HUD: pick a species, then call trees. borderlinePolicy "half" means
    // BORD records immediately (no distance modal). Default BAF is 2.
    clickSel(".species-seg button", 0); // pine
    clickSel(".call-in", 0);
    clickSel(".call-in", 0);
    clickSel(".call-in", 0);
    clickSel(".call-in", 0);
    clickSel(".call-in", 0); // 5 IN…
    clickText("↶"); //            …undo one → 4 IN
    clickSel(".call-bord", 0); // 1 borderline (½)
    clickSel(".call-out", 0);
    clickSel(".call-out", 0); // 2 OUT (don't count)

    // Effective stems = 4 + ½ = 4.5; BA = BAF 2 × 4.5 = 9.0 m²/ha.
    clickText("Finish sweep");

    // Back on the stand screen with the computed aggregate.
    expect(text()).toContain("9.0");
    expect(text()).toContain("m²/ha");
    expect(text()).toContain("Pine"); // species mix picked up the pine calls
    expect(text()).toMatch(/stems\s*\/\s*ha/i);

    // Export CSV → the download path runs end-to-end (Blob URL created).
    clickText("Export CSV");
    expect(objectUrls).toBeGreaterThan(0);
  });

  it("B. settings language switch persists to storage and re-renders in Swedish", async () => {
    await renderAt("/settings");
    expect(text()).toContain("Language"); // EN label
    clickText("Svenska");
    expect(text()).toContain("Språk"); // SV label now visible
    const saved = JSON.parse(localStorage.getItem("relascope.settings.v1") ?? "{}");
    expect(saved.language).toBe("sv");
  });

  it("C. restoring a backup through Settings brings the stand onto Home", async () => {
    // A backup file captured from another device.
    const stand: Stand = {
      id: "restored-1",
      name: "Återställt skifte",
      createdAt: "2026-06-01T08:00:00.000Z",
      meanHeightM: 20,
      points: [],
    };
    const backupJson = backupToJson([stand], { ...DEFAULT_SETTINGS, calibrated: true });

    // Restore asks for confirmation — accept it.
    const origConfirm = window.confirm;
    window.confirm = () => true;
    try {
      await renderAt("/settings");
      const fileInput = container!.querySelector<HTMLInputElement>('input[type="file"]')!;
      const file = new File([backupJson], "backup.json", { type: "application/json" });
      Object.defineProperty(fileInput, "files", { configurable: true, value: [file] });
      await act(async () => {
        fileInput.dispatchEvent(new Event("change", { bubbles: true }));
        await Promise.resolve();
      });
    } finally {
      window.confirm = origConfirm;
    }

    // The restored stand is now persisted and shows on Home.
    const persisted = JSON.parse(localStorage.getItem("relascope.stands.v1") ?? "[]");
    expect(persisted.some((s: Stand) => s.name === "Återställt skifte")).toBe(true);
    await renderAt("/");
    expect(text()).toContain("Återställt skifte");
  });

  it("E. an uncalibrated app gates on calibration before any measuring", async () => {
    // Override the calibrated seed: simulate a brand-new, uncalibrated install.
    localStorage.setItem("relascope.settings.v1", JSON.stringify({ calibrated: false }));

    // Home shows the calibration gate, not the measuring launchpad.
    await renderAt("/");
    expect(text()).toContain("Set up your gauge first");
    expect(text()).not.toContain("Estimate my whole forest");

    // Deep-linking straight to the measure tool is blocked (redirected away).
    await renderAt("/measure");
    expect(text()).not.toMatch(/Step 1 of 3/);
  });

  it("D. BeetleSense funnel surfaces render and link to beetlesense.ai", async () => {
    // Home: header brand link + footer link.
    await renderAt("/");
    expect(text()).toContain("by BeetleSense");
    expect(text()).toContain("Part of BeetleSense");
    const homeLinks = [...container!.querySelectorAll('a[href="https://beetlesense.ai"]')];
    expect(homeLinks.length).toBeGreaterThanOrEqual(2);
    homeLinks.forEach((a) => expect(a.getAttribute("rel")).toContain("noopener"));
  });
});
