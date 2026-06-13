import { useCallback, useRef, useState } from "react";
import type { RefObject } from "react";

/**
 * Two draggable edge markers over a camera preview, plus the bookkeeping to read
 * their positions as native-frame pixels. Mirrors the calibration screen's
 * trunk-edge gesture so the measure tool can reuse it to read the angle a trunk
 * subtends. Positions are fractions [0,1] of the stage width; convert to a
 * frame-pixel span with `markerSpanFramePx`.
 */
export function useEdgeMarkers(
  stageRef: RefObject<HTMLElement | null>,
  initialLeft = 0.3,
  initialRight = 0.7,
) {
  const [left, setLeft] = useState(initialLeft);
  const [right, setRight] = useState(initialRight);
  const leftRef = useRef(initialLeft);
  const rightRef = useRef(initialRight);

  const onPointerDown = useCallback(
    (which: "left" | "right") => (e: React.PointerEvent) => {
      e.preventDefault();
      const stage = stageRef.current;
      if (!stage) return;
      const move = (ev: PointerEvent) => {
        const rect = stage.getBoundingClientRect();
        const frac = Math.min(1, Math.max(0, (ev.clientX - rect.left) / rect.width));
        if (which === "left") {
          const v = Math.min(frac, rightRef.current - 0.02);
          leftRef.current = v;
          setLeft(v);
        } else {
          const v = Math.max(frac, leftRef.current + 0.02);
          rightRef.current = v;
          setRight(v);
        }
      };
      const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    },
    [stageRef],
  );

  const reset = useCallback(() => {
    leftRef.current = initialLeft;
    rightRef.current = initialRight;
    setLeft(initialLeft);
    setRight(initialRight);
  }, [initialLeft, initialRight]);

  return { left, right, onPointerDown, reset };
}

/** The two marker handles. Render inside the `.calib-stage` once the camera is ready. */
export function EdgeMarkerOverlay({
  left,
  right,
  onPointerDown,
}: {
  left: number;
  right: number;
  onPointerDown: (which: "left" | "right") => (e: React.PointerEvent) => void;
}) {
  return (
    <>
      <div className="calib-marker" style={{ left: `${left * 100}%` }} onPointerDown={onPointerDown("left")} />
      <div className="calib-marker" style={{ left: `${right * 100}%` }} onPointerDown={onPointerDown("right")} />
    </>
  );
}
