import { promises as fs } from "fs";
import path from "path";
import { NextResponse } from "next/server";
import {
  defaultCandleComposite,
  normalizeCandleComposite,
  type CandleCompositeConfig,
} from "@/lib/candleComposite";

const environmentPath = path.join(process.cwd(), "src/content/environment.json");

type StoredEnvironment = {
  lighting?: unknown;
  objects?: unknown[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCandleComposite(value: unknown): value is Partial<CandleCompositeConfig> {
  return isRecord(value) && value.kind === "candle-composite";
}

async function readEnvironment(): Promise<StoredEnvironment> {
  const file = await fs.readFile(environmentPath, "utf8");
  const parsed = JSON.parse(file) as StoredEnvironment;
  return {
    ...parsed,
    objects: Array.isArray(parsed.objects) ? parsed.objects : [],
  };
}

export async function GET() {
  const environment = await readEnvironment();
  const candleComposite =
    environment.objects?.find(isCandleComposite) ?? defaultCandleComposite;

  return NextResponse.json(normalizeCandleComposite(candleComposite));
}

export async function POST(request: Request) {
  const candleComposite = normalizeCandleComposite(await request.json());
  const environment = await readEnvironment();
  const objects = Array.isArray(environment.objects) ? [...environment.objects] : [];
  const existingIndex = objects.findIndex(isCandleComposite);

  if (existingIndex >= 0) {
    objects[existingIndex] = candleComposite;
  } else {
    objects.push(candleComposite);
  }

  await fs.writeFile(
    environmentPath,
    `${JSON.stringify({ ...environment, objects }, null, 2)}\n`,
  );
  return NextResponse.json({ ok: true });
}
