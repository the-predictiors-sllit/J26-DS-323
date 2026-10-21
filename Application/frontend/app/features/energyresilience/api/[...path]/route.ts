// Forwards /features/energyresilience/api/* to the backend /api/v1/energyresilience/*
// It runs on the Next.js server, so the browser never makes a cross-origin call (no CORS needed).
import type { NextRequest } from "next/server";

const BACKEND = process.env.BACKEND_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

async function proxy(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const url = `${BACKEND}/api/v1/energyresilience/${path.join("/")}${req.nextUrl.search}`;
  const hasBody = req.method !== "GET" && req.method !== "HEAD";
  try {
    const res = await fetch(url, {
      method: req.method,
      headers: { "content-type": req.headers.get("content-type") ?? "application/json" },
      body: hasBody ? await req.text() : undefined,
      cache: "no-store",
    });
    return new Response(await res.text(), {
      status: res.status,
      headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
    });
  } catch {
    return Response.json({ detail: `Cannot reach the backend at ${BACKEND}` }, { status: 502 });
  }
}

export { proxy as GET, proxy as POST };
