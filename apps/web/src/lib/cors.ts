import { NextResponse } from "next/server";

/**
 * CORS for the PUBLIC /api/v1 surface. The browser SDK runs on customer
 * websites (cross-origin) and POSTs JSON — every such request triggers a
 * preflight, and without ACAO headers subscriptions from real sites silently
 * fail. This API is key/token-authenticated and never uses cookies, so a
 * wildcard origin is safe.
 */
export const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Api-Key, X-PushPanel-Signature, X-PushPanel-Timestamp",
  "Access-Control-Max-Age": "86400",
};

/** Preflight handler for route `OPTIONS` exports. */
export function handlePublicOptions(): NextResponse {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

/** Merge CORS headers into a JSON response's headers. */
export function corsJson(data: unknown, init?: { status?: number; headers?: Record<string, string> }): NextResponse {
  return NextResponse.json(data, {
    status: init?.status,
    headers: { ...CORS_HEADERS, ...(init?.headers ?? {}) },
  });
}
