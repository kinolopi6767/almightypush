import { NextResponse } from "next/server";
import { OPENAPI_SPEC } from "@/lib/openapi";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(OPENAPI_SPEC, {
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}