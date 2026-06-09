import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Attach the rear camera stream to a <video> element. Field-first: requests the
 * environment-facing camera at high resolution and locks zoom to 1× so the
 * field of view (and therefore the gauge calibration) cannot drift mid-sweep
 * (PRD §5.1). Exposes the native frame dimensions needed to size the gauge bar
 * in true pixels.
 */
export function useCamera() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [frame, setFrame] = useState<{ width: number; height: number }>({ width: 0, height: 0 });

  const start = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });
      streamRef.current = stream;

      // Lock zoom to its minimum (usually 1×) so HFOV stays fixed — the
      // calibration is only valid at a single zoom level.
      const track = stream.getVideoTracks()[0];
      const caps = track.getCapabilities?.() as (MediaTrackCapabilities & { zoom?: { min: number } }) | undefined;
      if (caps && "zoom" in caps && caps.zoom) {
        try {
          await track.applyConstraints({ advanced: [{ zoom: caps.zoom.min } as never] });
        } catch {
          /* zoom not adjustable — fine, we just use the default FOV */
        }
      }

      if (videoRef.current) {
        const v = videoRef.current;
        v.srcObject = stream;
        v.onloadedmetadata = () => setFrame({ width: v.videoWidth, height: v.videoHeight });
        await v.play().catch(() => undefined);
        if (v.videoWidth) setFrame({ width: v.videoWidth, height: v.videoHeight });
      }
      setReady(true);
    } catch {
      setError("camera-denied");
      setReady(false);
    }
  }, []);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setReady(false);
  }, []);

  useEffect(() => () => stop(), [stop]);

  return { videoRef, start, stop, error, ready, frame };
}

// Screen Wake Lock API surface (not yet in all TS DOM libs).
interface WakeLockSentinelLike {
  release: () => Promise<void>;
}
interface WakeLockNavigator {
  wakeLock?: { request: (type: "screen") => Promise<WakeLockSentinelLike> };
}

/**
 * Keep the screen awake while `active` (field hardening): a sweep can take a
 * couple of minutes of looking through the camera without touching the screen,
 * and a phone sleeping mid-sweep loses the count. Re-acquires the lock when the
 * page becomes visible again (the OS silently releases it on background).
 */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const nav = navigator as Navigator & WakeLockNavigator;
    if (!nav.wakeLock) return;
    let sentinel: WakeLockSentinelLike | null = null;
    let cancelled = false;

    const acquire = async () => {
      try {
        const s = await nav.wakeLock!.request("screen");
        if (cancelled) await s.release().catch(() => undefined);
        else sentinel = s;
      } catch {
        /* low battery or unsupported — the sweep still works */
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") acquire();
    };

    acquire();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      sentinel?.release().catch(() => undefined);
    };
  }, [active]);
}

/** True when iOS-style explicit motion-sensor permission is required. */
function motionNeedsPermission(): boolean {
  const anyEvt = DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> };
  return typeof anyEvt?.requestPermission === "function";
}

/** Request both orientation and motion permission on a single user gesture. */
async function requestMotionPermission(): Promise<boolean> {
  const orientation = DeviceOrientationEvent as unknown as {
    requestPermission?: () => Promise<"granted" | "denied">;
  };
  const motion = DeviceMotionEvent as unknown as {
    requestPermission?: () => Promise<"granted" | "denied">;
  };
  try {
    const results = await Promise.all([
      orientation.requestPermission?.() ?? Promise.resolve<"granted">("granted"),
      motion.requestPermission?.() ?? Promise.resolve<"granted">("granted"),
    ]);
    return results.every((r) => r === "granted");
  } catch {
    return false;
  }
}

/**
 * Track compass heading (360° sweep progress, PRD §5.2) and line-of-sight
 * elevation (terrain inclination, for automatic slope compensation). Both ride
 * on the same iOS permission gesture exposed via `needsPermission` / `start`.
 */
export function useMotion() {
  const [heading, setHeading] = useState<number | null>(null);
  const [elevationDeg, setElevationDeg] = useState(0);
  const [pitchDeg, setPitchDeg] = useState<number | null>(null);
  const [needsPermission, setNeedsPermission] = useState(false);
  const [active, setActive] = useState(false);

  const onOrientation = useCallback((e: DeviceOrientationEvent) => {
    const anyE = e as DeviceOrientationEvent & { webkitCompassHeading?: number };
    let h: number | null = null;
    if (typeof anyE.webkitCompassHeading === "number") {
      h = anyE.webkitCompassHeading;
    } else if (typeof e.alpha === "number") {
      h = (360 - e.alpha) % 360; // convert CCW alpha to CW compass-style
    }
    if (h !== null) setHeading(h);
    // Signed camera-axis pitch for the height tool: in upright portrait the
    // W3C beta angle is 90°, so pitch above the horizon = beta − 90 (negative
    // when sighting below). Spec-standard across platforms, unlike the sign
    // of accelerationIncludingGravity.z.
    if (typeof e.beta === "number") setPitchDeg(e.beta - 90);
  }, []);

  const onMotion = useCallback((e: DeviceMotionEvent) => {
    const g = e.accelerationIncludingGravity;
    if (!g || g.x == null || g.y == null || g.z == null) return;
    const mag = Math.hypot(g.x, g.y, g.z) || 1;
    // Elevation of the optical axis (device −Z) from horizontal. |az|/|g| is
    // sign-convention independent across platforms, and slope correction only
    // needs the magnitude (cos is even).
    const phi = Math.asin(Math.min(1, Math.abs(g.z) / mag)) * (180 / Math.PI);
    setElevationDeg(phi);
  }, []);

  const start = useCallback(async () => {
    if (motionNeedsPermission()) {
      const ok = await requestMotionPermission();
      if (!ok) {
        setNeedsPermission(true);
        return;
      }
    }
    window.addEventListener("deviceorientation", onOrientation, true);
    window.addEventListener("devicemotion", onMotion, true);
    setActive(true);
    setNeedsPermission(false);
  }, [onOrientation, onMotion]);

  useEffect(() => {
    if (motionNeedsPermission()) setNeedsPermission(true);
    return () => {
      window.removeEventListener("deviceorientation", onOrientation, true);
      window.removeEventListener("devicemotion", onMotion, true);
    };
  }, [onOrientation, onMotion]);

  return { heading, elevationDeg, pitchDeg, needsPermission, active, start };
}

/** One-shot GPS read for tagging a sample point (PRD §5.2, §5.5). */
export function useGeolocation() {
  const [coords, setCoords] = useState<{ lat: number; lng: number; accuracyM: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const capture = useCallback(() => {
    if (!("geolocation" in navigator)) {
      setError("unavailable");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracyM: pos.coords.accuracy });
        setError(null);
      },
      () => setError("unavailable"),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 },
    );
  }, []);

  return { coords, error, capture };
}

/**
 * Accumulate total rotation swept so far, in degrees, from a stream of compass
 * headings. Handles the 360→0 wrap and ignores tiny jitter.
 */
export function useSweepProgress(heading: number | null) {
  const [swept, setSwept] = useState(0);
  const last = useRef<number | null>(null);

  useEffect(() => {
    if (heading === null) return;
    if (last.current === null) {
      last.current = heading;
      return;
    }
    let delta = heading - last.current;
    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;
    last.current = heading;
    if (Math.abs(delta) > 0.5) {
      setSwept((s) => Math.max(0, Math.min(360, s + Math.abs(delta))));
    }
  }, [heading]);

  const reset = useCallback(() => {
    setSwept(0);
    last.current = null;
  }, []);

  return { swept, reset };
}
