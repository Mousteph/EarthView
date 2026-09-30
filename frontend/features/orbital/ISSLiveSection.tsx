import { useCallback, useEffect, useRef, type PointerEvent as ReactPointerEvent, type RefCallback, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { ISS_LIVE_FEED } from "./issLiveFeedConfig";

export function ISSLiveSection({ visible, detached, unavailable, inlineHostRef, onDetach, onRetry, onShow }: {
  readonly visible: boolean;
  readonly detached: boolean;
  readonly unavailable: boolean;
  readonly inlineHostRef: RefCallback<HTMLDivElement>;
  readonly onDetach: () => void;
  readonly onRetry: () => void;
  readonly onShow: () => void;
}) {
  return <div className="orbital-detail-section iss-live-section">
    <div className="iss-live-heading">
      <h3>Live from the ISS</h3>
      {visible && !detached ? <button className="iss-live-action" type="button" onClick={onDetach} aria-label="Detach live ISS video" title="Detach player">
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M14 4h6v6M20 4l-8 8M10 20H4v-6M4 20l8-8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button> : null}
    </div>
    {detached ? <div className="iss-live-placeholder">
      <span>The player is floating. Use its close button to return it here.</span>
    </div> : visible ? <div ref={inlineHostRef} className="iss-live-frame-host" aria-label="Live Earth video player from the ISS" /> : <div className="iss-live-placeholder">
      <span>Live video player closed.</span>
      <button className="iss-live-action-label" type="button" onClick={onShow}>Show live player</button>
    </div>}
    {unavailable ? <><p className="iss-live-unavailable" role="status">Live video temporarily unavailable</p><button className="iss-live-action-label" type="button" onClick={onRetry}>Try loading again</button></> : null}
    <a className="iss-live-source" href={ISS_LIVE_FEED.sourceUrl} target="_blank" rel="noreferrer">
      Open the official NASA camera page
    </a>
  </div>;
}

export function ISSLiveFloatingPlayer({ hostRef, onClose, onDock, onRetry, unavailable, selected }: {
  readonly hostRef: RefCallback<HTMLDivElement>;
  readonly onClose: () => void;
  readonly onDock: () => void;
  readonly onRetry: () => void;
  readonly unavailable: boolean;
  readonly selected: boolean;
}) {
  const floatingRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const floating = floatingRef.current;
    if (!floating) return;
    const contain = () => {
      const rect = floating.getBoundingClientRect();
      if (rect.left < 8) floating.style.left = "8px";
      if (rect.top < 8) floating.style.top = "8px";
      if (rect.right > window.innerWidth - 8) floating.style.left = `${Math.max(8, window.innerWidth - rect.width - 8)}px`;
      if (rect.bottom > window.innerHeight - 8) floating.style.top = `${Math.max(8, window.innerHeight - rect.height - 8)}px`;
    };
    const observer = new ResizeObserver(contain);
    observer.observe(floating);
    window.addEventListener("resize", contain);
    contain();
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", contain);
    };
  }, []);

  const drag = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const target = event.currentTarget.closest<HTMLElement>(".iss-live-floating-player");
    if (!target) return;
    const rect = target.getBoundingClientRect();
    const offsetX = event.clientX - rect.left;
    const offsetY = event.clientY - rect.top;
    target.style.left = `${rect.left}px`;
    target.style.top = `${rect.top}px`;
    target.style.right = "auto";
    target.style.bottom = "auto";
    event.currentTarget.setPointerCapture(event.pointerId);
    const move = (moveEvent: PointerEvent) => {
      const maxLeft = Math.max(8, window.innerWidth - target.offsetWidth - 8);
      const maxTop = Math.max(8, window.innerHeight - target.offsetHeight - 8);
      target.style.left = `${Math.max(8, Math.min(maxLeft, moveEvent.clientX - offsetX))}px`;
      target.style.top = `${Math.max(8, Math.min(maxTop, moveEvent.clientY - offsetY))}px`;
    };
    const finish = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish, { once: true });
    window.addEventListener("pointercancel", finish, { once: true });
  }, []);

  const moveByKeyboard = useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
    const deltas: Record<string, readonly [number, number]> = {
      ArrowLeft: [-16, 0], ArrowRight: [16, 0], ArrowUp: [0, -16], ArrowDown: [0, 16],
    };
    const delta = deltas[event.key];
    if (!delta) return;
    event.preventDefault();
    const target = event.currentTarget.closest<HTMLElement>(".iss-live-floating-player");
    if (!target) return;
    const rect = target.getBoundingClientRect();
    target.style.left = `${Math.max(8, Math.min(window.innerWidth - target.offsetWidth - 8, rect.left + delta[0]))}px`;
    target.style.top = `${Math.max(8, Math.min(window.innerHeight - target.offsetHeight - 8, rect.top + delta[1]))}px`;
    target.style.right = "auto";
    target.style.bottom = "auto";
  }, []);

  return <section ref={floatingRef} className="iss-live-floating-player" aria-label="Floating live video from the ISS" onPointerDown={(event) => event.stopPropagation()}>
    <header className="iss-live-floating-header">
      <div className="iss-live-drag-handle" role="group" tabIndex={0} aria-label="Move live ISS player; use arrow keys to reposition" onPointerDown={drag} onKeyDown={moveByKeyboard}>
        <span className="iss-live-floating-title">Live from the ISS</span>
      </div>
      <button className="iss-live-window-action" type="button" onClick={selected ? onDock : onClose}
        aria-label={selected ? "Return live ISS video to its panel" : "Close floating ISS player"}
        title={selected ? "Return to panel" : "Close player"}>×</button>
    </header>
    <div ref={hostRef} className="iss-live-floating-frame-host" aria-label="Live Earth video player from the ISS" />
    {unavailable ? <div className="iss-live-floating-error">
      <p role="status">Live video temporarily unavailable</p>
      <a href={ISS_LIVE_FEED.sourceUrl} target="_blank" rel="noreferrer">Open NASA camera page</a>
      <button type="button" onClick={onRetry}>Try again</button>
    </div> : null}
  </section>;
}
