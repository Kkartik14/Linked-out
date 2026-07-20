import { NextResponse } from "next/server";

import { PRIVATE_NO_STORE_HEADERS } from "@/lib/bff/cache-policy";

/** Web-tier liveness only; dependency readiness is probed privately per component. */
export function GET(): NextResponse {
  return NextResponse.json(
    { status: "ok", component: "bff" },
    { status: 200, headers: PRIVATE_NO_STORE_HEADERS },
  );
}
