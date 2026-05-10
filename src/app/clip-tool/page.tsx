"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { ArrowLeft, Clapperboard, ExternalLink, RefreshCcw, Scissors } from "lucide-react";
import { works } from "@/content/works";

type ClipResult = {
  ok: boolean;
  clipSrc: string;
  bytes: number;
  outputPath: string;
  startSeconds: number;
  durationSeconds: number;
  updatedWorkMetadata: boolean;
};

const customSlug = "__custom__";

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function readError(response: Response) {
  try {
    const body = (await response.json()) as { error?: string };
    return body.error || `Request failed: ${response.status}`;
  } catch {
    return `Request failed: ${response.status}`;
  }
}

export default function ClipToolPage() {
  const firstWork = works[0];
  const [workSlug, setWorkSlug] = useState(firstWork?.slug ?? customSlug);
  const selectedWork = useMemo(
    () => works.find((work) => work.slug === workSlug),
    [workSlug],
  );
  const [sourceUrl, setSourceUrl] = useState(firstWork?.sourceUrl ?? "");
  const [outputSlug, setOutputSlug] = useState(firstWork?.slug ?? "");
  const [startSeconds, setStartSeconds] = useState(String(firstWork?.clipStartSeconds ?? 20));
  const [durationSeconds, setDurationSeconds] = useState(
    String(firstWork?.clipDurationSeconds ?? 10),
  );
  const [width, setWidth] = useState("1280");
  const [crf, setCrf] = useState("24");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ClipResult | null>(null);
  const [previewVersion, setPreviewVersion] = useState(0);

  const chooseWork = (nextSlug: string) => {
    setWorkSlug(nextSlug);
    setError(null);
    setStatus(null);

    const nextWork = works.find((work) => work.slug === nextSlug);
    if (!nextWork) {
      return;
    }

    setSourceUrl(nextWork.sourceUrl);
    setOutputSlug(nextWork.slug);
    setStartSeconds(String(nextWork.clipStartSeconds));
    setDurationSeconds(String(nextWork.clipDurationSeconds));
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setResult(null);
    setStatus("Downloading source video...");

    try {
      const response = await fetch("/api/clips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workSlug: selectedWork?.slug,
          sourceUrl,
          outputSlug,
          startSeconds,
          durationSeconds,
          width,
          crf,
          updateWorkMetadata: Boolean(selectedWork),
        }),
      });

      if (!response.ok) {
        throw new Error(await readError(response));
      }

      const nextResult = (await response.json()) as ClipResult;
      setResult(nextResult);
      setPreviewVersion((current) => current + 1);
      setStatus("Clip ready");
    } catch (nextError) {
      setStatus(null);
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    }
  };

  const previewSrc = result
    ? `${result.clipSrc}?clipPreview=${previewVersion}`
    : selectedWork?.clipSrc;

  return (
    <main className="min-h-screen bg-[#15130f] px-4 py-5 text-[#f6f0e5] sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="grid size-10 place-items-center rounded border border-white/10 bg-white/5 text-[#f6f0e5] transition hover:bg-white/10"
              aria-label="Back to frame wall"
              title="Back to frame wall"
            >
              <ArrowLeft size={18} />
            </Link>
            <div>
              <h1 className="text-xl font-medium text-[#fff7e8]">Clip tool</h1>
              <p className="text-sm text-[#c9bda9]">Regenerate local frame videos.</p>
            </div>
          </div>
          <Link
            href="/object-editor"
            className="inline-flex h-10 items-center gap-2 rounded border border-white/10 bg-white/5 px-3 text-sm text-[#f6f0e5] transition hover:bg-white/10"
          >
            <Clapperboard size={16} />
            Object editor
          </Link>
        </header>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <form
            className="rounded border border-white/10 bg-[#1b1711] p-4 shadow-2xl sm:p-5"
            onSubmit={submit}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block sm:col-span-2">
                <span className="mb-1 block text-xs uppercase tracking-[0.08em] text-[#a99d8a]">
                  Work
                </span>
                <select
                  className="h-11 w-full rounded border border-white/10 bg-black/25 px-3 text-sm text-[#fff7e8] outline-none focus:border-sky-300"
                  value={workSlug}
                  onChange={(event) => chooseWork(event.target.value)}
                >
                  {works.map((work) => (
                    <option key={work.slug} value={work.slug}>
                      {work.artist} - {work.title}
                    </option>
                  ))}
                  <option value={customSlug}>Custom URL</option>
                </select>
              </label>

              <label className="block sm:col-span-2">
                <span className="mb-1 block text-xs uppercase tracking-[0.08em] text-[#a99d8a]">
                  YouTube URL
                </span>
                <input
                  className="h-11 w-full rounded border border-white/10 bg-black/25 px-3 font-mono text-sm text-[#fff7e8] outline-none focus:border-sky-300"
                  value={sourceUrl}
                  onChange={(event) => setSourceUrl(event.target.value)}
                  placeholder="https://www.youtube.com/watch?v=..."
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-xs uppercase tracking-[0.08em] text-[#a99d8a]">
                  Output slug
                </span>
                <input
                  className="h-11 w-full rounded border border-white/10 bg-black/25 px-3 font-mono text-sm text-[#fff7e8] outline-none focus:border-sky-300"
                  value={outputSlug}
                  onChange={(event) => setOutputSlug(event.target.value)}
                  placeholder="snoop-ten-til-midnight"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-xs uppercase tracking-[0.08em] text-[#a99d8a]">
                  Start
                </span>
                <input
                  className="h-11 w-full rounded border border-white/10 bg-black/25 px-3 font-mono text-sm text-[#fff7e8] outline-none focus:border-sky-300"
                  value={startSeconds}
                  onChange={(event) => setStartSeconds(event.target.value)}
                  placeholder="20 or 1:14"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-xs uppercase tracking-[0.08em] text-[#a99d8a]">
                  Duration
                </span>
                <input
                  className="h-11 w-full rounded border border-white/10 bg-black/25 px-3 font-mono text-sm text-[#fff7e8] outline-none focus:border-sky-300"
                  value={durationSeconds}
                  onChange={(event) => setDurationSeconds(event.target.value)}
                  placeholder="10"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-xs uppercase tracking-[0.08em] text-[#a99d8a]">
                  Width
                </span>
                <input
                  className="h-11 w-full rounded border border-white/10 bg-black/25 px-3 font-mono text-sm text-[#fff7e8] outline-none focus:border-sky-300"
                  value={width}
                  onChange={(event) => setWidth(event.target.value)}
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-xs uppercase tracking-[0.08em] text-[#a99d8a]">
                  CRF
                </span>
                <input
                  className="h-11 w-full rounded border border-white/10 bg-black/25 px-3 font-mono text-sm text-[#fff7e8] outline-none focus:border-sky-300"
                  value={crf}
                  onChange={(event) => setCrf(event.target.value)}
                />
              </label>
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-end gap-3">
              <button
                type="submit"
                className="inline-flex h-11 items-center gap-2 rounded bg-sky-300 px-4 text-sm font-medium text-slate-950 transition hover:bg-sky-200"
              >
                {status === "Downloading source video..." ? (
                  <RefreshCcw className="animate-spin" size={16} />
                ) : (
                  <Scissors size={16} />
                )}
                Make clip
              </button>
            </div>

            {status ? (
              <div className="mt-4 rounded border border-sky-300/25 bg-sky-300/10 px-3 py-2 text-sm text-sky-100">
                {status}
              </div>
            ) : null}

            {error ? (
              <pre className="mt-4 max-h-72 overflow-auto rounded border border-red-300/35 bg-red-950/60 p-3 whitespace-pre-wrap text-xs leading-5 text-red-100">
                {error}
              </pre>
            ) : null}
          </form>

          <aside className="rounded border border-white/10 bg-[#1b1711] p-4 shadow-2xl">
            <div className="aspect-video overflow-hidden rounded border border-white/10 bg-black/45">
              {previewSrc ? (
                <video
                  key={previewSrc}
                  className="size-full object-cover"
                  src={previewSrc}
                  controls
                  muted
                  loop
                  playsInline
                  preload="metadata"
                />
              ) : null}
            </div>

            <div className="mt-4 space-y-3 text-sm text-[#d8cdbb]">
              <div>
                <div className="text-xs uppercase tracking-[0.08em] text-[#a99d8a]">Asset</div>
                <div className="mt-1 break-all font-mono text-xs text-[#fff7e8]">
                  {previewSrc?.split("?")[0] ?? "No clip selected"}
                </div>
              </div>

              {selectedWork ? (
                <a
                  href={selectedWork.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 text-sky-200 hover:text-sky-100"
                >
                  Source
                  <ExternalLink size={14} />
                </a>
              ) : null}

              {result ? (
                <div className="rounded border border-white/10 bg-black/20 p-3 font-mono text-xs leading-5 text-[#fff7e8]">
                  <div>{formatBytes(result.bytes)}</div>
                  <div>
                    {result.startSeconds}s / {result.durationSeconds}s
                  </div>
                  <div>
                    {result.updatedWorkMetadata ? "Source timing remembered" : "Asset only"}
                  </div>
                </div>
              ) : null}
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
