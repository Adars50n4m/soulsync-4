/**
 * SoulSync Supabase Proxy Worker
 *
 * Proxies all Supabase traffic (REST API, Auth, Storage, Realtime WebSocket)
 * through Cloudflare to bypass ISP-level blocks on *.supabase.co in India.
 */

export interface Env {
  SUPABASE_HOST: string;
}

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Expose-Headers': '*',
  'Access-Control-Max-Age': '86400',
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const supabaseHost = env.SUPABASE_HOST;

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);

    // Health check
    if (url.pathname === '/health') {
      return new Response(
        JSON.stringify({ status: 'ok', proxy_for: supabaseHost }),
        { headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } }
      );
    }

    // WebSocket upgrade (Supabase Realtime)
    if (request.headers.get('Upgrade')?.toLowerCase() === 'websocket') {
      return handleWebSocket(request, url, supabaseHost);
    }

    // Proxy all other HTTP requests (REST, Auth, Storage, Functions)
    return handleHTTP(request, url, supabaseHost);
  },
};

/**
 * Proxy HTTP requests to Supabase
 */
async function handleHTTP(
  request: Request,
  url: URL,
  supabaseHost: string
): Promise<Response> {
  const targetUrl = `https://${supabaseHost}${url.pathname}${url.search}`;

  // Clone headers, swap the Host
  const headers = new Headers(request.headers);
  headers.set('Host', supabaseHost);

  const response = await fetch(targetUrl, {
    method: request.method,
    headers,
    body: request.body,
    redirect: 'follow',
  });

  // Return response with CORS headers
  const responseHeaders = new Headers(response.headers);
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    responseHeaders.set(key, value);
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
  });
}

/**
 * Proxy WebSocket connections for Supabase Realtime
 */
async function handleWebSocket(
  request: Request,
  url: URL,
  supabaseHost: string
): Promise<Response> {
  const targetUrl = `https://${supabaseHost}${url.pathname}${url.search}`;

  // Forward the upgrade request to Supabase
  const headers = new Headers(request.headers);
  headers.set('Host', supabaseHost);

  const response = await fetch(targetUrl, {
    headers,
    body: request.body,
  });

  return response;
}
