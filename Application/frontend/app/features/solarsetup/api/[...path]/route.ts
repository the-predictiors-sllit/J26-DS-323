/** Same-origin, feature-scoped proxy. Never accepts arbitrary upstream URLs. */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ path: string[] }> };
async function proxy(request: Request, context: Context) {
  const { path } = await context.params;
  const route = path.join('/');
  const allowed = request.method === 'GET' ? ['health', 'solar/weather-template'] : ['segment', 'solar/analyze'];
  if (!allowed.includes(route)) return Response.json({ detail: 'Unknown Solar Setup endpoint.' }, { status: 404 });
  const base = (process.env.SOLARSETUP_BACKEND_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');
  const target = `${base}/api/v1/solarsetup/${route}${new URL(request.url).search}`;
  try {
    let body: ArrayBuffer | undefined;
    if (request.method === 'POST') {
      const limit = 32 * 1024 * 1024;
      if (Number(request.headers.get('content-length') || 0) > limit) return Response.json({ detail: 'Upload exceeds 32 MB.' }, { status: 413 });
      const reader = request.body?.getReader();
      const chunks: Uint8Array[] = []; let size = 0;
      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > limit) { await reader.cancel(); return Response.json({ detail: 'Upload exceeds 32 MB.' }, { status: 413 }); }
          chunks.push(value);
        }
      }
      const bytes = new Uint8Array(size); let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      body = bytes.buffer;
    }
    const upstream = await fetch(target, {
      method: request.method, body, cache: 'no-store', signal: AbortSignal.timeout(280000),
      headers: request.headers.has('content-type') ? { 'content-type': request.headers.get('content-type')! } : {},
    });
    const headers = new Headers({ 'Cache-Control': 'no-store' });
    for (const name of ['content-type', 'content-disposition']) {
      const value = upstream.headers.get(name); if (value) headers.set(name, value);
    }
    return new Response(upstream.body, { status: upstream.status, headers });
  } catch {
    return Response.json({ detail: 'Solar Setup backend unavailable or timed out. Start the group Python backend and retry.' }, { status: 502 });
  }
}
export const GET = proxy;
export const POST = proxy;
