import { NextRequest, NextResponse } from "next/server";

// Basic HTTP auth for the whole app — this is an internal team tool sitting
// in front of real Amazon Ads account data, and had zero access control.
// /api/cron/* is excluded: it's called by a non-interactive scheduler that
// can't complete a Basic Auth prompt, and already has its own bearer-token
// check (see app/api/cron/sync/route.ts).
export function proxy(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/api/cron/")) {
    return NextResponse.next();
  }

  const username = process.env.ADMIN_USERNAME;
  const password = process.env.ADMIN_PASSWORD;
  if (!username || !password) {
    // Not configured — fail open rather than lock everyone out of local
    // dev, but ADMIN_USERNAME/ADMIN_PASSWORD MUST be set before this is
    // hosted anywhere reachable outside your own machine.
    return NextResponse.next();
  }

  const expected = "Basic " + Buffer.from(`${username}:${password}`).toString("base64");
  if (request.headers.get("authorization") === expected) {
    return NextResponse.next();
  }

  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="RankWider"' },
  });
}

export const config = {
  matcher: "/((?!_next/static|_next/image|favicon.ico).*)",
};
