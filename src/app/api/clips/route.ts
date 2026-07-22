import { spawn } from "child_process";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { NextResponse } from "next/server";
import savedComposites from "@/content/composites.json";
import { works } from "@/content/works";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const publicClipDir = path.join(process.cwd(), "public/work-clips");
const worksPath = path.join(process.cwd(), "src/content/works.ts");
const localUvxPath = path.join(os.homedir(), ".local", "bin", "uvx");
const ytDlpWithImpersonation = "yt-dlp[default,curl-cffi]";
const maxLogLength = 12000;

type ClipRequest = {
  workSlug?: string;
  sourceUrl?: string;
  outputSlug?: string;
  startSeconds?: number | string;
  durationSeconds?: number | string;
  width?: number | string;
  crf?: number | string;
  updateWorkMetadata?: boolean;
};

type SavedComposite = {
  kind?: string;
  workSlug?: string;
  videoAspect?: number;
};

const savedCompositeEntries = savedComposites as SavedComposite[];

function parseSeconds(value: number | string | undefined, fallback: number) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : fallback;
  }

  if (!value) {
    return fallback;
  }

  const trimmed = value.trim();
  if (!trimmed.includes(":")) {
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  const parts = trimmed.split(":").map((part) => Number(part));
  if (parts.some((part) => !Number.isFinite(part))) {
    return fallback;
  }

  return parts.reduce((total, part) => total * 60 + part, 0);
}

function parseInteger(value: number | string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : fallback;
}

function formatClipSecond(value: number) {
  return Number(value.toFixed(3)).toString();
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function outputAspectForWork(workSlug: string | undefined) {
  if (!workSlug) {
    return null;
  }

  const aspect = savedCompositeEntries.find(
    (composite) => composite.kind === "video-frame" && composite.workSlug === workSlug,
  )?.videoAspect;

  return typeof aspect === "number" && Number.isFinite(aspect) && aspect > 0 ? aspect : null;
}

function vimeoPlayerUrl(sourceUrl: string) {
  try {
    const url = new URL(sourceUrl);
    const hostname = url.hostname.replace(/^www\./, "");
    if (hostname !== "vimeo.com" && hostname !== "player.vimeo.com") {
      return null;
    }

    const videoId = url.pathname.split("/").find((part) => /^\d+$/.test(part));
    return videoId ? `https://player.vimeo.com/video/${videoId}` : null;
  } catch {
    return null;
  }
}

async function ytDlpInvocation(sourceUrl: string, downloadArgs: string[]) {
  const playerUrl = vimeoPlayerUrl(sourceUrl);
  if (!playerUrl) {
    return {
      command: "yt-dlp",
      args: [...downloadArgs, sourceUrl],
    };
  }

  try {
    await fs.access(localUvxPath);
  } catch {
    throw new Error(
      "Vimeo clip generation requires uvx so yt-dlp can use browser impersonation. Install uv and try again.",
    );
  }

  return {
    command: localUvxPath,
    args: [
      "--from",
      ytDlpWithImpersonation,
      "yt-dlp",
      "--impersonate",
      "chrome",
      ...downloadArgs,
      playerUrl,
    ],
  };
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findWorkBlock(source: string, workSlug: string) {
  const slugIndex = source.search(new RegExp(`slug:\\s*"${escapeRegExp(workSlug)}"`));
  if (slugIndex < 0) {
    throw new Error(`Could not find work slug in works.ts: ${workSlug}`);
  }

  const prefix = source.slice(0, slugIndex);
  const blockStartMatch = Array.from(prefix.matchAll(/^  \{/gm)).at(-1);
  if (!blockStartMatch || blockStartMatch.index === undefined) {
    throw new Error(`Could not find work block start in works.ts: ${workSlug}`);
  }

  const start = blockStartMatch.index;
  const endMatch = source.slice(slugIndex).match(/^  \},?$/m);
  if (!endMatch || endMatch.index === undefined) {
    throw new Error(`Could not find work block end in works.ts: ${workSlug}`);
  }

  const end = slugIndex + endMatch.index + endMatch[0].length;
  return {
    start,
    end,
    block: source.slice(start, end),
  };
}

function replaceRequiredField(block: string, field: string, nextValue: string) {
  const pattern = new RegExp(`(${field}:\\s*)[^,\\n]+`);
  if (!pattern.test(block)) {
    throw new Error(`Could not find ${field} in selected work block.`);
  }

  return block.replace(pattern, `$1${nextValue}`);
}

async function runCommand(command: string, args: string[], timeoutMs: number) {
  return await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";

    const timer = windowlessSetTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`${command} timed out after ${Math.round(timeoutMs / 1000)} seconds.`));
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      stdout = `${stdout}${chunk.toString()}`.slice(-maxLogLength);
    });

    child.stderr.on("data", (chunk: Buffer) => {
      stderr = `${stderr}${chunk.toString()}`.slice(-maxLogLength);
    });

    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      reject(new Error(`${command} exited with code ${code}.\n${stderr || stdout}`));
    });
  });
}

function windowlessSetTimeout(callback: () => void, timeoutMs: number) {
  return setTimeout(callback, timeoutMs);
}

async function findDownloadedSource(tempDir: string) {
  const files = await fs.readdir(tempDir);
  const sourceFile = files.find((file) => file.startsWith("source."));
  if (!sourceFile) {
    throw new Error("yt-dlp finished without creating a source video file.");
  }

  return path.join(tempDir, sourceFile);
}

async function updateWorksMetadata(workSlug: string, clipSrc: string, start: number, duration: number) {
  const source = await fs.readFile(worksPath, "utf8");
  const match = findWorkBlock(source, workSlug);
  const nextBlock = [
    ["clipSrc", `"${clipSrc}"`],
    ["clipStartSeconds", String(start)],
    ["clipDurationSeconds", String(duration)],
  ].reduce((block, [field, value]) => replaceRequiredField(block, field, value), match.block);

  await fs.writeFile(worksPath, `${source.slice(0, match.start)}${nextBlock}${source.slice(match.end)}`);
}

export async function POST(request: Request) {
  let tempDir: string | null = null;

  try {
    if (process.env.VERCEL) {
      return NextResponse.json(
        { error: "The clip tool is only available in the local development app." },
        { status: 403 },
      );
    }

    const body = (await request.json()) as ClipRequest;
    const selectedWork = works.find((work) => work.slug === body.workSlug);
    const sourceUrl = body.sourceUrl?.trim() || selectedWork?.sourceUrl;
    const requestedOutputSlug = slugify(body.outputSlug || selectedWork?.slug || "");
    const outputSlug = selectedWork && body.updateWorkMetadata ? selectedWork.slug : requestedOutputSlug;
    const startSeconds = parseSeconds(body.startSeconds, selectedWork?.clipStartSeconds ?? 0);
    const durationSeconds = parseSeconds(body.durationSeconds, selectedWork?.clipDurationSeconds ?? 10);
    const width = Math.min(1920, Math.max(320, parseInteger(body.width, 1280)));
    const crf = Math.min(35, Math.max(18, parseInteger(body.crf, 24)));

    if (body.updateWorkMetadata && !selectedWork) {
      return NextResponse.json({ error: "A valid work selection is required to update metadata." }, { status: 400 });
    }

    if (
      body.updateWorkMetadata &&
      selectedWork &&
      requestedOutputSlug &&
      requestedOutputSlug !== selectedWork.slug
    ) {
      return NextResponse.json(
        {
          error: `Selected work clips must be saved as ${selectedWork.slug}.mp4, not ${requestedOutputSlug}.mp4.`,
        },
        { status: 400 },
      );
    }

    if (!sourceUrl || !/^https?:\/\//.test(sourceUrl)) {
      return NextResponse.json({ error: "A valid source URL is required." }, { status: 400 });
    }

    if (!outputSlug || !/^[a-z0-9][a-z0-9-]*$/.test(outputSlug)) {
      return NextResponse.json({ error: "A valid output slug is required." }, { status: 400 });
    }

    if (startSeconds < 0 || durationSeconds <= 0 || durationSeconds > 90) {
      return NextResponse.json(
        { error: "Use a non-negative start time and a duration between 0 and 90 seconds." },
        { status: 400 },
      );
    }

    await fs.mkdir(publicClipDir, { recursive: true });
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "yaz-clip-"));

    const downloadInvocation = await ytDlpInvocation(sourceUrl, [
      "--no-playlist",
      "--download-sections",
      `*${formatClipSecond(startSeconds)}-${formatClipSecond(startSeconds + durationSeconds)}`,
      "--force-keyframes-at-cuts",
      "-f",
      "bv*[height<=1080]+ba/b[height<=1080]/best",
      "--merge-output-format",
      "mp4",
      "-o",
      path.join(tempDir, "source.%(ext)s"),
    ]);

    await runCommand(downloadInvocation.command, downloadInvocation.args, 8 * 60 * 1000);

    const sourcePath = await findDownloadedSource(tempDir);
    const outputPath = path.join(publicClipDir, `${outputSlug}.mp4`);
    const outputAspect = outputAspectForWork(selectedWork?.slug);
    const outputHeight = outputAspect
      ? Math.max(2, Math.round(width / outputAspect / 2) * 2)
      : null;
    const videoFilter = outputHeight
      ? `scale=${width}:${outputHeight}:force_original_aspect_ratio=increase,crop=${width}:${outputHeight},setsar=1`
      : `scale=${width}:-2,setsar=1`;

    await runCommand(
      "ffmpeg",
      [
        "-y",
        "-t",
        String(durationSeconds),
        "-i",
        sourcePath,
        "-vf",
        videoFilter,
        "-an",
        "-movflags",
        "+faststart",
        "-pix_fmt",
        "yuv420p",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        String(crf),
        outputPath,
      ],
      2 * 60 * 1000,
    );

    const clipSrc = `/work-clips/${outputSlug}.mp4`;
    if (body.updateWorkMetadata && selectedWork) {
      await updateWorksMetadata(selectedWork.slug, clipSrc, startSeconds, durationSeconds);
    }

    const stats = await fs.stat(outputPath);
    return NextResponse.json({
      ok: true,
      clipSrc,
      bytes: stats.size,
      outputPath,
      startSeconds,
      durationSeconds,
      width,
      height: outputHeight,
      outputAspect,
      updatedWorkMetadata: Boolean(body.updateWorkMetadata && selectedWork),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  } finally {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}
