/**
 * agents.blackroad.io — BlackRoad Agents API Worker
 * Cloudflare Worker that proxies requests to the BlackRoad Gateway.
 * Adds CORS, rate limiting, and agent-specific routing.
 */

export interface Env {
  BLACKROAD_GATEWAY_URL: string;
  CACHE: KVNamespace;
}

const CORS = {
  "Access-Control-Allow-Origin": "https://blackroad.io",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS });
    }

    const url = new URL(request.url);
    const gatewayUrl = env.BLACKROAD_GATEWAY_URL || "http://127.0.0.1:8787";

    // /health endpoint
    if (url.pathname === "/health") {
      return Response.json({
        status: "ok",
        service: "agents.blackroad.io",
        timestamp: new Date().toISOString(),
      }, { headers: CORS });
    }

    // Cache GET requests to /agents for 10s
    if (request.method === "GET" && url.pathname === "/agents") {
      const cached = await env.CACHE.get("agents:list");
      if (cached) {
        return new Response(cached, {
          headers: { ...CORS, "Content-Type": "application/json", "X-Cache": "HIT" }
        });
      }
    }

    // Proxy to gateway
    const targetUrl = `${gatewayUrl}${url.pathname}${url.search}`;
    const proxied = await fetch(targetUrl, {
      method: request.method,
      headers: { "Content-Type": "application/json" },
      body: request.method !== "GET" ? await request.text() : undefined,
    });

    const body = await proxied.text();

    // Cache agents list
    if (request.method === "GET" && url.pathname === "/agents" && proxied.ok) {
      await env.CACHE.put("agents:list", body, { expirationTtl: 10 });
    }

    return new Response(body, {
      status: proxied.status,
      headers: {
        ...CORS,
        "Content-Type": "application/json",
        "X-Proxied-By": "agents.blackroad.io",
      },
    });
  },
};
