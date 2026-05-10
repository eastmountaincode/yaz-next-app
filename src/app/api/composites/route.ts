import { promises as fs } from "fs";
import path from "path";
import { NextResponse } from "next/server";

const compositesPath = path.join(process.cwd(), "src/content/composites.json");

export async function GET() {
  const file = await fs.readFile(compositesPath, "utf8");
  return NextResponse.json(JSON.parse(file));
}

export async function POST(request: Request) {
  const composites = await request.json();

  if (!Array.isArray(composites)) {
    return NextResponse.json({ error: "Expected an array of composites." }, { status: 400 });
  }

  await fs.writeFile(compositesPath, `${JSON.stringify(composites, null, 2)}\n`);
  return NextResponse.json({ ok: true });
}
