"use client";

import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { X } from "lucide-react";

type Props = {
  children: ReactNode;
  className: string;
  style?: CSSProperties;
  onClose: () => void;
};

function waitForVimeoPlayer(frame: HTMLIFrameElement, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const origin = "https://player.vimeo.com";
    // Match the ready/ping handshake used by Vimeo's official player SDK.
    const ping = () => frame.contentWindow?.postMessage({ method: "ping" }, origin);
    window.addEventListener("message", (event: MessageEvent) => {
      if (event.origin !== origin || event.source !== frame.contentWindow) return;
      let data = event.data;
      if (typeof data === "string") {
        try { data = JSON.parse(data); } catch { return; }
      }
      if (!data || typeof data !== "object") return;
      if (data.event === "ready" || data.method === "ping") resolve();
      if (data.event === "error" && data.data?.method === "ready") {
        reject(new Error("Video player failed to initialize"));
      }
    }, { signal });
    frame.addEventListener("load", ping, { once: true, signal });
    ping();
  });
}

// Remount this boundary when navigating to a different modal view. Keeping the
// media mounted at opacity zero lets the browser load and decode it normally.
export function ReadyModalSurface(props: Props) {
  const [attempt, setAttempt] = useState(0);
  return <SurfaceAttempt key={attempt} {...props} onRetry={() => setAttempt((value) => value + 1)} />;
}

function SurfaceAttempt({ children, className, style, onClose, onRetry }: Props & { onRetry: () => void }) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useLayoutEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) return;
    let disposed = false;
    const controller = new AbortController();
    const { signal } = controller;

    const waitForLoad = (element: HTMLImageElement | HTMLIFrameElement) =>
      new Promise<void>((resolve, reject) => {
        element.addEventListener("load", () => resolve(), { once: true, signal });
        element.addEventListener("error", () => reject(new Error("Media failed to load")), { once: true, signal });
        // Check after installing listeners so cached images cannot race us.
        if (element instanceof HTMLImageElement && element.complete) {
          if (element.naturalWidth > 0) resolve();
          else reject(new Error("Image failed to load"));
        }
      });

    const media = Array.from(surface.querySelectorAll<HTMLImageElement | HTMLIFrameElement>("img, iframe"));
    const pending = media.map(async (element) => {
      // Offscreen items in scrollable galleries must load before the reveal too.
      element.loading = "eager";
      const loaded = waitForLoad(element);
      if (element instanceof HTMLIFrameElement && new URL(element.src).origin === "https://player.vimeo.com") {
        await Promise.all([loaded, waitForVimeoPlayer(element, signal)]);
      } else {
        await loaded;
      }
      if (element instanceof HTMLImageElement) await element.decode();
    });
    // Explicitly request the heading face, even before the first layout.
    pending.push(document.fonts.load('16px "Yaz Winky Show"').then(() => document.fonts.ready).then(() => {}));

    // A failed or stalled asset gets a retry state instead of revealing partial
    // content (which would allow the same late image pop-in we are avoiding).
    const timeout = window.setTimeout(() => {
      if (!disposed) setStatus("error");
      disposed = true;
      controller.abort();
    }, 30000);
    Promise.all(pending).then(
      () => {
        if (!disposed) setStatus("ready");
        window.clearTimeout(timeout);
        controller.abort();
      },
      () => {
        if (!disposed) setStatus("error");
        window.clearTimeout(timeout);
        controller.abort();
      },
    );

    return () => {
      disposed = true;
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, []);

  return (
    <>
      {status !== "ready" ? (
        <div className="absolute inset-0 flex items-center justify-center text-white">
          <button type="button" onClick={onClose} aria-label="Close" className="absolute right-5 top-5 grid size-9 cursor-pointer place-items-center hover:bg-white/10 focus-visible:outline focus-visible:outline-white">
            <X size={20} strokeWidth={1.5} />
          </button>
          <div role="status" className="px-6 text-center font-sans text-sm" onClick={(event) => event.stopPropagation()}>
            {status === "error" ? (
              <>
                <p>Some content couldn’t load.</p>
                <button type="button" onClick={onRetry} className="mt-3 cursor-pointer underline underline-offset-4">Try again</button>
              </>
            ) : <span className="modal-loading-label">Loading…</span>}
          </div>
        </div>
      ) : null}
      <div
        ref={surfaceRef}
        className={`${className} modal-ready-surface`}
        style={style}
        data-ready={status === "ready"}
        aria-busy={status === "loading"}
        aria-hidden={status !== "ready"}
        inert={status !== "ready"}
        onClick={(event) => event.stopPropagation()}
      >
        {children}
      </div>
    </>
  );
}
