// @vitest-environment jsdom
//
// Integration test for the guided measure wizard, in the same plain react-dom
// style as smoke.test.tsx. Walks the first-time journey (aim base → aim top →
// result → optional thickness) and guards the Android motion-sensor regression
// (the sensor must run without a permission gesture, or the steps never advance).
import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { AppProvider } from "./AppContext";
import { App } from "./App";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

beforeAll(() => {
  (globalThis as Record<string, unknown>).DeviceMotionEvent = class {};
  (globalThis as Record<string, unknown>).DeviceOrientationEvent = class {};
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
  // Measuring is gated behind calibration; this suite tests the post-setup flow.
  localStorage.setItem("relascope.settings.v1", JSON.stringify({ calibrated: true }));
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
  if (!btn) throw new Error(`button "${label}" not found in: ${text()}`);
  act(() => btn.dispatchEvent(new MouseEvent("click", { bubbles: true })));
}

/** Drive the inclinometer: pitch above horizon = beta − 90 (W3C). */
function orientPitch(pitchDeg: number) {
  const ev = new Event("deviceorientation") as Event & { beta?: number; alpha?: number };
  ev.beta = pitchDeg + 90;
  ev.alpha = 0;
  act(() => window.dispatchEvent(ev));
}

describe("guided measure wizard", () => {
  it("advances only because the sensor runs without a permission gesture (Android guard)", async () => {
    await renderAt("/measure");
    // Step 1 is shown, with the measure button (not a 'turn on sensor' prompt).
    expect(text()).toMatch(/Step 1 of 3/);
    expect([...container!.querySelectorAll("button")].some((b) => /Turn on/i.test(b.textContent ?? ""))).toBe(false);
    // The orientation event reaches the hook → tapping advances to step 2.
    orientPitch(-8.53);
    clickText("Measure the bottom");
    expect(text()).toMatch(/Step 2 of 3/);
    expect(text()).toMatch(/TOP of the tree/);
  });

  it("measures height end-to-end and offers thickness + wood volume", async () => {
    await renderAt("/measure");

    // Base: 1.5 m eye height, 8.53° down → ~10 m; advance to the top step.
    orientPitch(-8.53);
    clickText("Measure the bottom");

    // Top: height = 10·(tan30 − tan(−8.53)) ≈ 7.3 m → result screen.
    orientPitch(30);
    clickText("Measure the top");
    expect(text()).toMatch(/Your tree/);
    expect(text()).toMatch(/7\.\d/);
    expect(text()).toMatch(/m\s*tall/);

    // Optional thickness step yields a wood volume.
    clickText("Add thickness");
    orientPitch(-1); // roughly chest height
    clickText("Measure thickness");
    expect(text()).toMatch(/Thickness/);
    expect(text()).toMatch(/m³/);
  });

  it("is transparent about the tilt sensor on iPhone before asking permission", async () => {
    // Simulate iOS: DeviceOrientationEvent exposes requestPermission.
    (globalThis as Record<string, unknown>).DeviceOrientationEvent = class {
      static requestPermission = () => Promise.resolve("granted");
    };
    try {
      await renderAt("/measure");
      const buttons = [...container!.querySelectorAll("button")];
      expect(text()).toMatch(/only to measure the tree/i); // the transparency note
      expect(text()).toMatch(/never leave your phone/i);
      expect(buttons.some((b) => /Turn on the tilt sensor/i.test(b.textContent ?? ""))).toBe(true);
      // The measure action is gated until the user grants permission.
      expect(buttons.some((b) => /Measure the bottom/i.test(b.textContent ?? ""))).toBe(false);
    } finally {
      (globalThis as Record<string, unknown>).DeviceOrientationEvent = class {}; // restore Android default
    }
  });

  it("shows a friendly error when the base sight is not below the horizon", async () => {
    await renderAt("/measure");
    orientPitch(10); // aiming up, not at the base
    clickText("Measure the bottom");
    expect(text()).toMatch(/aim at the base/i);
    expect(text()).toMatch(/Step 1 of 3/); // stayed put
  });
});
