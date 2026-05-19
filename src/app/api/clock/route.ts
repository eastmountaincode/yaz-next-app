import { promises as fs } from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { normalizeClockComposite } from "@/lib/clockComposite";

const clockPath = path.join(process.cwd(), "src/content/clock.json");

export async function GET() {
  const file = await fs.readFile(clockPath, "utf8");
  return NextResponse.json(normalizeClockComposite(JSON.parse(file)));
}

export async function POST(request: Request) {
  const clock = normalizeClockComposite(await request.json());

  await fs.writeFile(clockPath, `${JSON.stringify(clock, null, 2)}\n`);
  return NextResponse.json({ ok: true });
}
