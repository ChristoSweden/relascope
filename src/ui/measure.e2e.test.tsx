// @vitest-environment jsdom
//
// Integration test for the measure tool, in the same plain react-dom style as
// smoke.test.tsx (no extra test deps). Drives the real screen through the
// eye-height range → height → volume journey and guards the Android
// motion-sensor regression (sensors must run without a permission gesture).
import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { AppProvider } from "./AppContext";
import { App } from "./App";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

beforeAll(() => {
  // Motion sensor types exist but require no permission (the Android path).
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

beforeEach(() => localStorage.clear());
afterEach(() => {
  if (root) act(() => root!.unmount());
  root = null;
  container?.remove();
  container = null;
});

const text = () => container?.textContent ?? "";

function clickText(label: string) {
  const btn = [...container!.querySelectorAll("button")].find((b) => (b.textContent ?? "").includes(label));
  if (!btn) throw new Error(`button "${label}" not found`);
  act(() => btn.dispatchEvent(new MouseEvent("click", { bubbles: true })));
}

/** Drive the inclinometer: pitch above horizon = beta − 90 (W3C). */
function orientPitch(pitchDeg: number) {
  const ev = new Event("deviceorientation") as Event & { beta?: number; alpha?: number };
  ev.beta = pitchDeg + 90;
  ev.alpha = 0;
  act(() => window.dispatchEvent(ev));
}

function setNumberInput(index: number, value: string) {
  const input = container!.querySelectorAll("input")[index] as HTMLInputElement;
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("measure tool", () => {
  it("runs the sensor without a permission gesture (Android regression guard)", async () => {
    await renderAt("/measure");
    // No iOS gesture needed → no enable button, sensor live on mount.
    expect([...container!.querySelectorAll("button")].some((b) => /Enable motion/i.test(b.textContent ?? ""))).toBe(false);
    expect(text()).toMatch(/Tilt:\s*—/); // pitch unknown until first event
    orientPitch(-10);
    expect(text()).toMatch(/Tilt:\s*-?10°/); // event reached the hook → fix works
  });

  it("ranges from eye height, then measures height and stem volume", async () => {
    await renderAt("/measure");

    // Aim down at the base: 1.5 m eye height, 8.53° depression → ~10 m.
    orientPitch(-8.53);
    clickText("Sight tree base");
    expect(text()).toMatch(/Distance:\s*10\.0 m/);

    // Aim up at the top; height = D·(tan top − tan base) ≈ 7.3 m.
    orientPitch(30);
    clickText("Mark top");
    expect(text()).toMatch(/Tree height/);
    expect(text()).toMatch(/7\.\d\s*m/);

    // A DBH turns the taper into a stem volume.
    setNumberInput(0, "30");
    expect(text()).toMatch(/Stem volume/);
    expect(text()).toMatch(/m³/);
  });
});
