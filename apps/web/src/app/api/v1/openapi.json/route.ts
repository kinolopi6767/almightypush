import { corsJson, handlePublicOptions } from "@/lib/cors";
import { OPENAPI_SPEC } from "@/lib/openapi";

export const dynamic = "force-dynamic";

export function GET() {
  // Public spec: allow cross-origin fetch so third-party dev portals and
  // code generators can load it directly in the browser.
  return corsJson(OPENAPI_SPEC, {
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

export function OPTIONS() {
  return handlePublicOptions();
}