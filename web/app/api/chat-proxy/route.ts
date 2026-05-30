import { type NextRequest, NextResponse } from "next/server";

const BACKEND = process.env.INTERNAL_API_URL || "http://localhost:8000";

/**
 * Long-timeout proxy for AI chat endpoints.
 * Next.js rewrite-based proxy drops connections after ~30s.
 * Route handlers have no such limit — they wait as long as fetch does.
 */
export async function POST(request: NextRequest) {
  const target = request.nextUrl.searchParams.get("path");
  if (!target) return NextResponse.json({ error: "missing path" }, { status: 400 });

  const body = await request.text();

  // Forward auth header
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const auth = request.headers.get("authorization");
  if (auth) headers["Authorization"] = auth;

  let backendRes: Response;
  try {
    backendRes = await fetch(`${BACKEND}${target}`, {
      method: "POST",
      headers,
      body,
      // Node.js fetch has no default timeout — this waits up to 5 minutes
      signal: AbortSignal.timeout(300_000),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Backend unreachable: ${msg}` }, { status: 502 });
  }

  const data = await backendRes.json().catch(() => null);
  return NextResponse.json(data, { status: backendRes.status });
}
