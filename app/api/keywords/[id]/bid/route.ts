import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { AmazonAdsClient, type AmazonRegion } from "@/lib/amazon-ads";
import { getValidAccessToken } from "@/lib/amazon-account";
import { logChange } from "@/lib/audit";
import { currentUser } from "@/lib/current-user";

export async function PUT(request: NextRequest, ctx: RouteContext<"/api/keywords/[id]/bid">) {
  const { id } = await ctx.params;
  const { bid } = (await request.json()) as { bid?: number };

  if (typeof bid !== "number" || bid <= 0) {
    return NextResponse.json({ error: "bid must be a positive number" }, { status: 400 });
  }

  const keyword = await prisma.keyword.findUnique({
    where: { id },
    include: { adGroup: { include: { campaign: { include: { profile: { include: { account: true } } } } } } },
  });
  if (!keyword) {
    return NextResponse.json({ error: "keyword not found" }, { status: 404 });
  }

  const { profile } = keyword.adGroup.campaign;
  const { account } = profile;

  try {
    const accessToken = await getValidAccessToken(account);
    const client = new AmazonAdsClient(account.region as AmazonRegion, accessToken, profile.profileId);
    await client.updateKeywordBids([{ keywordId: keyword.keywordId, bid }]);
  } catch (err) {
    // Don't touch the DB bid if the push to Amazon failed — keep them in sync.
    return NextResponse.json({ error: `Amazon push failed: ${(err as Error).message}` }, { status: 502 });
  }

  const updated = await prisma.keyword.update({ where: { id }, data: { bid } });
  await logChange("keyword", id, "bid", keyword.bid, bid, currentUser(request));
  return NextResponse.json({ keyword: updated });
}
