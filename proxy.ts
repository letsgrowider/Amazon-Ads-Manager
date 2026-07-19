import { NextRequest, NextResponse } from "next/server";

// Basic HTTP auth for the whole app — this is an internal team tool sitting
// in front of real Amazon Ads account data, and had zero access control.
// /api/cron/* is excluded: it's called by a non-interactive scheduler that
// can't complete a Basic Auth prompt, and already has its own bearer-token
// check (see app/api/cron/sync/route.ts).
//
// ADMIN_CREDENTIALS holds every team member's login as "user:pass" pairs,
// comma-separated — there's no per-user data scoping in this app (everyone
// who authenticates sees every linked account), so this is purely a gate,
// not an authorization system.
// Maps the base64-encoded "Basic ..." header value back to the plain
// username, so a matched request can be attributed to who's logged in
// (see lib/current-user.ts) without storing the password anywhere further.
function validCredentials(): Map<string, string> {
  const raw = process.env.ADMIN_CREDENTIALS;
  const map = new Map<string, string>();
  if (!raw) return map;
  for (const pair of raw.split(",").map((p) => p.trim()).filter(Boolean)) {
    const username = pair.split(":")[0];
    map.set("Basic " + Buffer.from(pair).toString("base64"), username);
  }
  return map;
}

export function proxy(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/api/cron/")) {
    return NextResponse.next();
  }

  const credentials = validCredentials();
  if (credentials.size === 0) {
    // Not configured — fail open rather than lock everyone out of local
    // dev, but ADMIN_CREDENTIALS MUST be set before this is hosted
    // anywhere reachable outside your own machine.
    return NextResponse.next();
  }

  const provided = request.headers.get("authorization");
  const username = provided ? credentials.get(provided) : undefined;
  if (username) {
    const headers = new Headers(request.headers);
    headers.set("x-rankwider-user", username);
    return NextResponse.next({ request: { headers } });
  }

  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="RankWider"' },
  });
}

export const config = {
  matcher: "/((?!_next/static|_next/image|favicon.ico).*)",
};
