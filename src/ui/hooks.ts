import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Attach the rear camera stream to a <video> element. Field-first: requests the
 * environment-facing camera and a high resolution for a steady gauge overlay.
 */
export function useCamera() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const start = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
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

  return { videoRef, start, stop, error, ready };
}

/**
 * Track the phone's compass heading to drive the 360° sweep progress ring
 * (PRD §5.2). Uses DeviceOrientation; on iOS this needs an explicit permission
 * gesture, surfaced via `needsPermission` / `requestPermission`.
 */
export function useHeading() {
  const [heading, setHeading] = useState<number | null>(null);
  const [needsPermission, setNeedsPermission] = useState(false);
  const [active, setActive] = useState(false);

  const handler = useCallback((e: DeviceOrientationEvent) => {
    // webkitCompassHeading is the absolute compass on iOS; alpha elsewhere.
    const anyE = e as DeviceOrientationEvent & { webkitCompassHeading?: number };
    let h: number | null = null;
    if (typeof anyE.webkitCompassHeading === "number") {
      h = anyE.webkitCompassHeading;
    } else if (typeof e.alpha === "number") {
      // alpha increases counter-clockwise; convert to clockwise compass-style.
      h = (360 - e.alpha) % 360;
    }
    if (h !== null) setHeading(h);
  }, []);

  const start = useCallback(async () => {
    const anyOrientation = DeviceOrientationEvent as unknown as {
      requestPermission?: () => Promise<"granted" | "denied">;
    };
    if (typeof anyOrientation.requestPermission === "function") {
      try {
        const res = await anyOrientation.requestPermission();
        if (res !== "granted") {
          setNeedsPermission(true);
          return;
        }
      } catch {
        setNeedsPermission(true);
        return;
      }
    }
    window.addEventListener("deviceorientation", handler, true);
    setActive(true);
    setNeedsPermission(false);
  }, [handler]);

  useEffect(() => {
    // Detect whether an explicit permission gesture will be required (iOS 13+).
    const anyOrientation = DeviceOrientationEvent as unknown as {
      requestPermission?: () => Promise<string>;
    };
    if (typeof anyOrientation?.requestPermission === "function") {
      setNeedsPermission(true);
    }
    return () => window.removeEventListener("deviceorientation", handler, true);
  }, [handler]);

  return { heading, needsPermission, active, start };
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
        setCoords({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracyM: pos.coords.accuracy,
        });
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
 * headings. Handles the 360→0 wrap and ignores tiny jitter. Returns a value
 * that climbs past 360 as the user keeps turning, capped for the progress ring.
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
    // Only accumulate forward (clockwise) motion above a small jitter floor.
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
