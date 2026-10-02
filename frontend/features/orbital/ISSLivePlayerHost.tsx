"use client";

import { useCallback, useEffect, useRef, useState, type RefCallback } from "react";
import { ISS_LIVE_FEED } from "./issLiveFeedConfig";
import { ISSLiveFloatingPlayer } from "./ISSLiveSection";
import { shouldMountISSPlayer, type ISSPlayerLifecycle } from "./issPlayerLifecycle";

export function ISSLivePlayerHost({ lifecycle, inlineHost, onDock, onClose, unavailable, onUnavailable, onRetry, retryToken }: {
  readonly lifecycle: ISSPlayerLifecycle;
  readonly inlineHost: HTMLDivElement | null;
  readonly onDock: () => void;
  readonly onClose: () => void;
  readonly unavailable: boolean;
  readonly onUnavailable: () => void;
  readonly onRetry: () => void;
  readonly retryToken: number;
}) {
  const shouldMount = shouldMountISSPlayer(lifecycle);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const onUnavailableRef = useRef(onUnavailable);
  const [floatingHost, setFloatingHost] = useState<HTMLDivElement | null>(null);
  const floatingHostRef = useCallback<RefCallback<HTMLDivElement>>((node) => setFloatingHost(node), []);

  useEffect(() => {
    onUnavailableRef.current = onUnavailable;
  }, [onUnavailable]);

  useEffect(() => {
    if (!shouldMount) {
      iframeRef.current?.remove();
      iframeRef.current = null;
      return;
    }
    const iframe = document.createElement("iframe");
    iframe.className = "iss-live-frame";
    iframe.src = ISS_LIVE_FEED.embedUrl;
    iframe.title = "NASA live Earth video from the International Space Station";
    iframe.loading = "lazy";
    iframe.referrerPolicy = "strict-origin-when-cross-origin";
    iframe.allow = "encrypted-media; picture-in-picture; fullscreen";
    iframe.allowFullscreen = true;
    iframeRef.current = iframe;
    const handleError = () => {
      iframe.hidden = true;
      iframe.style.display = "none";
      onUnavailableRef.current();
    };
    iframe.addEventListener("error", handleError);
    return () => {
      iframe.removeEventListener("error", handleError);
      iframe.remove();
      if (iframeRef.current === iframe) iframeRef.current = null;
    };
  }, [retryToken, shouldMount]);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!shouldMount || !iframe) return;
    iframe.hidden = unavailable;
    iframe.style.display = unavailable ? "none" : "block";
    const target = lifecycle.detached ? floatingHost : inlineHost;
    if (target && iframe.parentElement !== target) target.appendChild(iframe);
  }, [floatingHost, inlineHost, lifecycle.detached, shouldMount, unavailable]);

  return lifecycle.detached ? <ISSLiveFloatingPlayer hostRef={floatingHostRef} onClose={onClose} onDock={onDock}
    onRetry={onRetry} unavailable={unavailable} selected={lifecycle.isISSSelected} /> : null;
}
