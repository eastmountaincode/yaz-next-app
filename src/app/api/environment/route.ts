import { promises as fs } from "fs";
import path from "path";
import { NextResponse } from "next/server";

const environmentPath = path.join(process.cwd(), "src/content/environment.json");

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function GET() {
  try {
    const file = await fs.readFile(environmentPath, "utf8");
    return NextResponse.json(JSON.parse(file));
  } catch (error) {
    if (isRecord(error) && error.code === "ENOENT") {
      return NextResponse.json({ error: "Environment JSON has not been saved yet." }, { status: 404 });
    }

    throw error;
  }
}

export async function POST(request: Request) {
  const environment = await request.json();

  if (!isRecord(environment) || !Array.isArray(environment.objects) || !isRecord(environment.lighting)) {
    return NextResponse.json(
      { error: "Expected an environment object with objects[] and lighting." },
      { status: 400 },
    );
  }

  const hostname = request.headers.get("host")?.split(":")[0]?.toLowerCase();
  const isLocalRequest =
    hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";

  if (process.env.VERCEL && !isLocalRequest) {
    return NextResponse.json({ ok: true, persisted: false, storage: "browser" });
  }

  await fs.mkdir(path.dirname(environmentPath), { recursive: true });
  await fs.writeFile(environmentPath, `${JSON.stringify(environment, null, 2)}\n`);
  return NextResponse.json({ ok: true });
}
