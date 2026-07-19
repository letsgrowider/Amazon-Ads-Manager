import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getAuthorizeUrl, type AmazonRegion } from "@/lib/amazon-ads";

// Kicks off LWA consent. ?region=NA|EU|FE picks which Ads API region this
// account will be authorized against (default NA).
export async function GET(request: NextRequest) {
  const region = (request.nextUrl.searchParams.get("region") ?? "NA") as AmazonRegion;
  const nonce = randomBytes(16).toString("hex");
  const state = `${region}:${nonce}`;

  const response = NextResponse.redirect(getAuthorizeUrl(state));
  response.cookies.set("amazon_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  return response;
}
