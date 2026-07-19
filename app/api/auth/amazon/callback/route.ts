import { NextRequest, NextResponse } from "next/server";
import { AmazonAdsClient, exchangeCodeForTokens, type AmazonRegion } from "@/lib/amazon-ads";
import { prisma } from "@/lib/db";

export async function GET(request: NextRequest) {
  const error = request.nextUrl.searchParams.get("error");
  if (error) {
    return NextResponse.json({ error: `Amazon denied authorization: ${error}` }, { status: 400 });
  }

  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const expectedState = request.cookies.get("amazon_oauth_state")?.value;

  // state must round-trip unchanged from the authorize step (CSRF check).
  if (!code || !state || state !== expectedState) {
    return NextResponse.json({ error: "Invalid OAuth state or missing code" }, { status: 400 });
  }

  const [region] = state.split(":") as [AmazonRegion, string];

  const tokens = await exchangeCodeForTokens(code);
  const tokenExpiresAt = new Date(Date.now() + tokens.expires_in * 1000);

  const client = new AmazonAdsClient(region, tokens.access_token);
  const profiles = await client.listProfiles();

  // Re-authorizing an already-connected account (token expired, or just a
  // stray click) shouldn't crash on the profileId unique constraint —
  // refresh that account's tokens instead of trying to create a duplicate.
  const existingProfile = await prisma.profile.findFirst({
    where: { profileId: { in: profiles.map((p) => String(p.profileId)) } },
  });

  if (existingProfile) {
    await prisma.amazonAccount.update({
      where: { id: existingProfile.accountId },
      data: { accessToken: tokens.access_token, refreshToken: tokens.refresh_token, tokenExpiresAt },
    });
  } else {
    await prisma.amazonAccount.create({
      data: {
        name: `Amazon Ads (${region})`,
        region,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        tokenExpiresAt,
        profiles: {
          create: profiles.map((p) => ({
            profileId: String(p.profileId),
            countryCode: p.countryCode,
            currencyCode: p.currencyCode,
            marketplaceId: p.accountInfo.marketplaceStringId,
            entityName: p.accountInfo.name,
          })),
        },
      },
    });
  }

  const response = NextResponse.redirect(new URL("/", request.url));
  response.cookies.delete("amazon_oauth_state");
  return response;
}
