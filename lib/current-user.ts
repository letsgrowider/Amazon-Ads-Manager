// proxy.ts resolves Basic Auth to a username and forwards it on this header.
// Falls back to null outside a request context (scripts, dayparting cron)
// or when auth isn't configured (local dev). Takes a plain Request so it
// works with both NextRequest and the untyped Request some route handlers use.
export function currentUser(request: Request): string | null {
  return request.headers.get("x-rankwider-user");
}
