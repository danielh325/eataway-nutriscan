import { useRef, useState, useCallback, ReactNode, useEffect } from "react";

interface BottomSheetProps {
  children: ReactNode;
  isDark?: boolean;
  snapPoints?: number[];
  initialSnap?: number;
  onSnapChange?: (snapIndex: number) => void;
}

const DEFAULT_SNAP_POINTS = [0.12, 0.45, 0.88];

function springLerp(current: number, target: number, velocity: number, dt: number) {
  const stiffness = 300;
  const damping = 26;
  const force = stiffness * (target - current) - damping * velocity;
  const newVelocity = velocity + force * dt;
  const newValue = current + newVelocity * dt;
  return { value: newValue, velocity: newVelocity };
}

export default function BottomSheet({
  children,
  isDark = false,
  snapPoints = DEFAULT_SNAP_POINTS,
  initialSnap = 1,
  onSnapChange,
}: BottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef({ startY: 0, startHeight: 0, dragging: false, lastY: 0, lastTime: 0, velocity: 0 });
  const animRef = useRef<number | null>(null);
  const springRef = useRef({ value: snapPoints[initialSnap] * 100, velocity: 0 });
  const currentSnapRef = useRef(initialSnap);

  const [height, setHeight] = useState(snapPoints[initialSnap] * 100);

  const animateToSnap = useCallback((targetPct: number, initialVelocity = 0) => {
    if (animRef.current) cancelAnimationFrame(animRef.current);

    const target = targetPct * 100;
    springRef.current = { value: height, velocity: initialVelocity };

    let lastFrame = performance.now();

    const step = (now: number) => {
      const dt = Math.min((now - lastFrame) / 1000, 0.032);
      lastFrame = now;

      const result = springLerp(springRef.current.value, target, springRef.current.velocity, dt);
      springRef.current = result;

      setHeight(result.value);

      if (Math.abs(result.value - target) < 0.1 && Math.abs(result.velocity) < 0.5) {
        setHeight(target);
        animRef.current = null;
        return;
      }

      animRef.current = requestAnimationFrame(step);
    };

    animRef.current = requestAnimationFrame(step);
  }, [height]);

  const findClosestSnap = useCallback((pct: number, velocity: number) => {
    const projected = pct + velocity * 0.15;
    return snapPoints.reduce((prev, curr) =>
      Math.abs(curr - projected) < Math.abs(prev - projected) ? curr : prev
    );
  }, [snapPoints]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (animRef.current) {
      cancelAnimationFrame(animRef.current);
      animRef.current = null;
    }
    dragRef.current = {
      startY: e.clientY,
      startHeight: height,
      dragging: true,
      lastY: e.clientY,
      lastTime: performance.now(),
      velocity: 0,
    };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [height]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current.dragging) return;
    const now = performance.now();
    const dt = (now - dragRef.current.lastTime) / 1000;
    const dy = dragRef.current.startY - e.clientY;
    const dvh = (dy / window.innerHeight) * 100;
    const newH = Math.max(snapPoints[0] * 100, Math.min(snapPoints[snapPoints.length - 1] * 100, dragRef.current.startHeight + dvh));

    if (dt > 0) {
      const pixelVelocity = (dragRef.current.lastY - e.clientY) / dt;
      dragRef.current.velocity = (pixelVelocity / window.innerHeight) * 100;
    }
    dragRef.current.lastY = e.clientY;
    dragRef.current.lastTime = now;

    setHeight(newH);
  }, [snapPoints]);

  const handlePointerUp = useCallback(() => {
    dragRef.current.dragging = false;
    const currentPct = height / 100;
    const velocityPct = dragRef.current.velocity / 100;
    const target = findClosestSnap(currentPct, velocityPct);
    const snapIndex = snapPoints.indexOf(target);
    if (snapIndex !== currentSnapRef.current) {
      currentSnapRef.current = snapIndex;
      onSnapChange?.(snapIndex);
    }
    animateToSnap(target, dragRef.current.velocity);
  }, [height, findClosestSnap, animateToSnap, snapPoints, onSnapChange]);

  useEffect(() => {
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, []);

  return (
    <div
      ref={sheetRef}
      className="fixed bottom-0 left-0 right-0 z-[1001] rounded-t-[24px] flex flex-col will-change-[height] sheet-panel"
      style={{ height: `${height}vh` }}
    >
      {/* Drag handle */}
      <div
        className="flex-shrink-0 flex items-center justify-center pt-2.5 pb-3 cursor-grab active:cursor-grabbing touch-none select-none"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <div className="w-10 h-[5px] rounded-full bg-[hsl(0_0%_75%)]" />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 pb-8">
        {children}
      </div>
    </div>
  );
}
