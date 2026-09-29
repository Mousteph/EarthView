"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { resolveHoverTooltip, type HoverData, type HoverKey } from "./hover";

type PendingHover = {
  readonly key: HoverKey;
  readonly x: number;
  readonly y: number;
  readonly distance: number;
  readonly event: PointerEvent;
};

export function useGlobeHover(data: HoverData, onInteraction: () => void) {
  const [hoverKey, setHoverKey] = useState<HoverKey | null>(null);
  const tooltip = useRef<HTMLDivElement>(null);
  const canvasRoot = useRef<HTMLDivElement>(null);
  const currentKey = useRef<HoverKey | null>(null);
  const position = useRef<{ readonly x: number; readonly y: number } | null>(null);
  const activePointer = useRef<{ readonly id: number; readonly x: number; readonly y: number; dragged: boolean } | null>(null);
  const pending = useRef<PendingHover | null>(null);
  const frame = useRef<number | null>(null);
  const resolvedTooltip = useMemo(() => resolveHoverTooltip(hoverKey, data), [data, hoverKey]);

  const positionTooltip = useCallback((clientX: number, clientY: number) => {
    position.current = { x: clientX, y: clientY };
    const root = canvasRoot.current?.parentElement;
    const element = tooltip.current;
    if (!root || !element || !currentKey.current || activePointer.current?.dragged) return;
    const bounds = root.getBoundingClientRect();
    const width = element.offsetWidth;
    const height = element.offsetHeight;
    const localX = clientX - bounds.left;
    const localY = clientY - bounds.top;
    const gap = 14;
    const left = localX + width + gap <= bounds.width ? localX + gap : Math.max(0, localX - width - gap);
    const top = localY + height + gap <= bounds.height ? localY + gap : Math.max(0, localY - height - gap);
    element.style.transform = `translate3d(${left}px, ${top}px, 0)`;
  }, []);

  const clearHover = useCallback(() => {
    pending.current = null;
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    currentKey.current = null;
    setHoverKey(null);
  }, []);

  const onHover = useCallback((key: HoverKey, clientX: number, clientY: number, distance: number, event: PointerEvent) => {
    if (activePointer.current?.dragged) return;
    const queued = pending.current;
    if (!queued || queued.event !== event || distance < queued.distance) pending.current = { key, x: clientX, y: clientY, distance, event };
    positionTooltip(clientX, clientY);
    if (frame.current !== null) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      const next = pending.current;
      pending.current = null;
      if (!next || activePointer.current?.dragged) return;
      currentKey.current = next.key;
      setHoverKey((current) => current?.type === next.key.type && current.id === next.key.id ? current : next.key);
      positionTooltip(next.x, next.y);
    });
  }, [positionTooltip]);

  const onHoverEnd = useCallback((key: HoverKey) => {
    const current = currentKey.current;
    const queued = pending.current;
    if (queued?.key.type === key.type && queued.key.id === key.id) pending.current = null;
    if (!current || current.type !== key.type || current.id !== key.id) return;
    currentKey.current = null;
    setHoverKey(null);
  }, []);

  useEffect(() => {
    if (!hoverKey || resolvedTooltip) return;
    const timeout = window.setTimeout(clearHover);
    return () => window.clearTimeout(timeout);
  }, [clearHover, hoverKey, resolvedTooltip]);

  useEffect(() => {
    const canvas = canvasRoot.current?.querySelector("canvas");
    if (canvas) canvas.style.cursor = resolvedTooltip && !activePointer.current?.dragged ? "pointer" : "";
  }, [resolvedTooltip]);

  useEffect(() => {
    if (resolvedTooltip && position.current) positionTooltip(position.current.x, position.current.y);
  }, [positionTooltip, resolvedTooltip]);

  useEffect(() => () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
  }, []);

  const handlePointerDown = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    onInteraction();
    if (!(event.target instanceof HTMLCanvasElement) || event.pointerType === "touch") return;
    activePointer.current = { id: event.pointerId, x: event.clientX, y: event.clientY, dragged: false };
  }, [onInteraction]);

  const handlePointerMove = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (event.target instanceof HTMLCanvasElement && event.pointerType !== "touch") onInteraction();
    const active = activePointer.current;
    if (active && active.id === event.pointerId && !active.dragged
      && (event.clientX - active.x) ** 2 + (event.clientY - active.y) ** 2 > 25) {
      active.dragged = true;
      clearHover();
    }
    if (event.pointerType !== "touch") positionTooltip(event.clientX, event.clientY);
  }, [clearHover, onInteraction, positionTooltip]);

  const handlePointerUp = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const active = activePointer.current;
    if (!active || active.id !== event.pointerId) return;
    const dragged = active.dragged;
    activePointer.current = null;
    if (!dragged || event.pointerType === "touch") return;
    requestAnimationFrame(() => {
      const canvas = canvasRoot.current?.querySelector("canvas");
      if (!canvas) return;
      canvas.dispatchEvent(new PointerEvent("pointermove", {
        bubbles: true,
        clientX: event.clientX,
        clientY: event.clientY,
        pointerId: event.pointerId,
        pointerType: event.pointerType,
        isPrimary: true,
      }));
    });
  }, []);

  const handlePointerCancel = useCallback(() => {
    activePointer.current = null;
    clearHover();
  }, [clearHover]);

  return {
    hoverTooltip: resolvedTooltip,
    hovered: resolvedTooltip ? hoverKey : null,
    globeCanvasRef: canvasRoot,
    hoverTooltipRef: tooltip,
    handleHover: onHover,
    handleHoverEnd: onHoverEnd,
    clearHover,
    handlePointerEnter: onInteraction,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerCancel,
  };
}
