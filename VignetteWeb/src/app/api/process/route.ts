// POST /api/process?sid=<session_id>
//
// Proxies to {VIGNETTE_ORCHESTRATOR_URL}/process/<session_id> with the
// X-API-Key header. Mirrors the original Vignette Vercel function so the
// embedded /vignette/ web UI can trigger video generation from inside
// CrossTube.

export const dynamic = "force-dynamic";

export const POST = async (request: Request) => {
  const sid = new URL(request.url).searchParams.get("sid") || "";
  if (!sid || !/^[0-9_\-]+$/.test(sid)) {
    return new Response(JSON.stringify({ error: "missing or invalid sid" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const baseUrl = process.env.VIGNETTE_ORCHESTRATOR_URL;
  if (!baseUrl) {
    return new Response(
      JSON.stringify({
        error:
          "VIGNETTE_ORCHESTRATOR_URL is not set. Add it to .env.local (and your Vercel env).",
      }),
      { status: 500, headers: { "content-type": "application/json" } },
    );
  }
  const apiKey = process.env.VIGNETTE_API_KEY;

  const url = `${baseUrl.replace(/\/$/, "")}/process/${encodeURIComponent(sid)}`;
  const headers: Record<string, string> = {};
  if (apiKey) headers["X-API-Key"] = apiKey;

  try {
    const upstream = await fetch(url, { method: "POST", headers });
    const text = await upstream.text();
    return new Response(text, {
      status: upstream.status,
      headers: {
        "content-type": upstream.headers.get("content-type") || "text/plain",
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: `upstream fetch failed: ${msg}` }), {
      status: 502,
      headers: { "content-type": "application/json" },
    });
  }
};
