// POST /api/process?sid=<session_id>
//
// Proxies to {VIGNETTE_ORCHESTRATOR_URL}/process/<session_id> with the X-API-Key
// header. Keeps the orchestrator URL and API key off the public client.
//
// Vercel env vars (set per env via `vercel env add`):
//   VIGNETTE_ORCHESTRATOR_URL   e.g. https://my-orchestrator.example.com
//   VIGNETTE_API_KEY            must match the orchestrator's key (optional)

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "POST only" });
  }
  const sid = (req.query.sid || "").toString();
  if (!sid || !/^[0-9_\-]+$/.test(sid)) {
    return res.status(400).json({ error: "missing or invalid sid" });
  }

  const baseUrl = process.env.VIGNETTE_ORCHESTRATOR_URL;
  if (!baseUrl) {
    return res.status(500).json({
      error: "VIGNETTE_ORCHESTRATOR_URL is not set on Vercel. Run: vercel env add VIGNETTE_ORCHESTRATOR_URL",
    });
  }
  const apiKey = process.env.VIGNETTE_API_KEY;

  const url = `${baseUrl.replace(/\/$/, "")}/process/${encodeURIComponent(sid)}`;
  const headers = apiKey ? { "X-API-Key": apiKey } : {};

  try {
    const upstream = await fetch(url, { method: "POST", headers });
    const text = await upstream.text();
    const contentType = upstream.headers.get("content-type") || "text/plain";
    res.status(upstream.status);
    res.setHeader("content-type", contentType);
    return res.send(text);
  } catch (e) {
    return res.status(502).json({ error: `upstream fetch failed: ${e.message}` });
  }
}
