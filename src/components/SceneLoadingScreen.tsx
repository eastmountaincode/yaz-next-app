"use client";

import { useEffect, useMemo, useState } from "react";

const MAX_PARALLEL_REQUESTS = 2;
const MAX_ASSET_ATTEMPTS = 5;

function canRetryStatus(status: number) {
  return status === 401 || status === 408 || status === 425 || status === 429 || status >= 500;
}

function waitForRetry(delayMs: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      signal.removeEventListener("abort", handleAbort);
      resolve();
    }, delayMs);
    const handleAbort = () => {
      window.clearTimeout(timeout);
      reject(new DOMException("Asset loading was cancelled.", "AbortError"));
    };
    signal.addEventListener("abort", handleAbort, { once: true });
  });
}

function isLocalSiteImage(asset: string) {
  if (!asset.startsWith("/")) {
    return false;
  }
  const pathname = asset.split(/[?#]/, 1)[0].toLowerCase();
  return /\.(?:avif|gif|jpe?g|png|webp)$/.test(pathname);
}

function loadAndDecodeImage(asset: string, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const image = new Image();
    const cleanup = () => {
      image.onload = null;
      image.onerror = null;
      signal.removeEventListener("abort", handleAbort);
    };
    const handleAbort = () => {
      cleanup();
      image.src = "";
      reject(new DOMException("Asset loading was cancelled.", "AbortError"));
    };

    image.decoding = "async";
    image.onload = () => {
      image
        .decode()
        .catch(() => undefined)
        .then(() => {
          cleanup();
          resolve();
        });
    };
    image.onerror = () => {
      cleanup();
      reject(new Error(`Image failed to load: ${asset}`));
    };
    signal.addEventListener("abort", handleAbort, { once: true });
    image.src = asset;
  });
}

async function loadAsset(asset: string, initialCache: RequestCache, signal: AbortSignal) {
  for (let requestAttempt = 0; requestAttempt < MAX_ASSET_ATTEMPTS; requestAttempt += 1) {
    if (isLocalSiteImage(asset)) {
      try {
        await loadAndDecodeImage(asset, signal);
        return;
      } catch (error) {
        if (signal.aborted || requestAttempt === MAX_ASSET_ATTEMPTS - 1) {
          throw error;
        }
        await waitForRetry(500 * 2 ** requestAttempt, signal);
        continue;
      }
    }

    let response: Response;
    try {
      response = await fetch(asset, {
        cache: requestAttempt === 0 ? initialCache : "reload",
        signal,
      });
    } catch (error) {
      if (signal.aborted || requestAttempt === MAX_ASSET_ATTEMPTS - 1) {
        throw error;
      }
      await waitForRetry(500 * 2 ** requestAttempt, signal);
      continue;
    }
    if (response.ok) {
      // Consuming the body ensures the complete asset is available in the
      // browser cache before Three.js begins parsing the scene.
      await response.arrayBuffer();
      return;
    }

    await response.arrayBuffer().catch(() => undefined);
    const isLastAttempt = requestAttempt === MAX_ASSET_ATTEMPTS - 1;
    if (isLastAttempt || !canRetryStatus(response.status)) {
      throw new Error(`Could not load ${asset} (${response.status}).`);
    }

    await waitForRetry(500 * 2 ** requestAttempt, signal);
  }
}

export function SceneLoadingScreen({
  assets,
  assetsReady,
  sceneReady,
  sceneError,
  onAssetsReady,
  onError,
}: {
  assets: string[] | null;
  assetsReady: boolean;
  sceneReady: boolean;
  sceneError?: string | null;
  onAssetsReady: () => void;
  onError: (error: Error | null) => void;
}) {
  const [loadedCount, setLoadedCount] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [headingFontReady, setHeadingFontReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const descriptor = '400 48px "Yaz Winky Show"';
    const text = "Yaslynn Rivera";

    document.fonts
      .load(descriptor, text)
      .then(() => {
        if (!cancelled && document.fonts.check(descriptor, text)) {
          setHeadingFontReady(true);
        }
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!assets || assetsReady) {
      return undefined;
    }

    const abortController = new AbortController();
    let cancelled = false;
    let nextIndex = 0;
    let completed = 0;

    const loadNext = async () => {
      while (!cancelled) {
        const index = nextIndex;
        nextIndex += 1;
        if (index >= assets.length) {
          return;
        }

        const asset = assets[index];
        await loadAsset(
          asset,
          attempt === 0 ? "force-cache" : "reload",
          abortController.signal,
        );
        completed += 1;
        if (!cancelled) {
          setLoadedCount(completed);
        }
      }
    };

    const workerCount = Math.min(MAX_PARALLEL_REQUESTS, Math.max(assets.length, 1));
    Promise.all(Array.from({ length: workerCount }, () => loadNext()))
      .then(() => {
        if (!cancelled) {
          onAssetsReady();
        }
      })
      .catch((error: unknown) => {
        if (cancelled || abortController.signal.aborted) {
          return;
        }
        const normalizedError = error instanceof Error ? error : new Error(String(error));
        setLoadError(normalizedError.message);
        onError(normalizedError);
      });

    return () => {
      cancelled = true;
      abortController.abort();
    };
  }, [assets, assetsReady, attempt, onAssetsReady, onError]);

  const percentage = useMemo(() => {
    if (!assets || assets.length === 0) {
      return assetsReady ? 100 : 0;
    }
    return Math.min(100, Math.round((loadedCount / assets.length) * 100));
  }, [assets, assetsReady, loadedCount]);

  if (sceneReady) {
    return null;
  }

  const status = !assets
    ? "Opening the room"
    : assetsReady
      ? "Preparing the room"
      : "Loading the room";
  const displayedError = loadError ?? sceneError;

  return (
    <div
      className="absolute inset-0 z-[70] grid place-items-center bg-[#15130f] px-6 text-[#f6f0e5]"
      role="status"
      aria-live="polite"
      aria-label={status}
    >
      <div className="w-full max-w-sm text-center">
        <p
          className={`text-4xl leading-none sm:text-5xl ${
            headingFontReady ? "visible" : "invisible"
          }`}
          style={{ fontFamily: '"Yaz Winky Show", "Winky Show Script", cursive' }}
        >
          Yaslynn Rivera
        </p>
        <p className="mt-4 text-xs uppercase tracking-[0.22em] text-[#b9aa92]">{status}</p>

        <div className="mt-6 h-px overflow-hidden bg-white/15">
          <div
            className="h-full bg-[#f6f0e5] transition-[width] duration-300 ease-out"
            style={{ width: `${assetsReady ? 100 : percentage}%` }}
          />
        </div>

        <p className="mt-3 font-mono text-xs tabular-nums text-[#b9aa92]">
          {assetsReady ? 100 : percentage}%
        </p>

        {displayedError ? (
          <div className="mt-6">
            <p className="text-sm leading-6 text-[#e2b8a7]">{displayedError}</p>
            <button
              type="button"
              className="mt-4 cursor-pointer rounded border border-white/20 px-4 py-2 text-sm transition hover:bg-white/10"
              onClick={() => {
                if (loadError) {
                  setLoadedCount(0);
                  setLoadError(null);
                  onError(null);
                  setAttempt((current) => current + 1);
                } else {
                  window.location.reload();
                }
              }}
            >
              Try again
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
