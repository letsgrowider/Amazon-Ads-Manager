import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { AmazonAdsClient, type AmazonRegion } from "@/lib/amazon-ads";
import { getValidAccessToken } from "@/lib/amazon-account";
import { logChange } from "@/lib/audit";
import { currentUser } from "@/lib/current-user";

export async function PUT(request: NextRequest, ctx: RouteContext<"/api/targets/[id]/bid">) {
  const { id } = await ctx.params;
  const { bid } = (await request.json()) as { bid?: number };

  if (typeof bid !== "number" || bid <= 0) {
    return NextResponse.json({ error: "bid must be a positive number" }, { status: 400 });
  }

  const target = await prisma.target.findUnique({
    where: { id },
    include: { adGroup: { include: { campaign: { include: { profile: { include: { account: true } } } } } } },
  });
  if (!target) {
    return NextResponse.json({ error: "target not found" }, { status: 404 });
  }

  const { profile } = target.adGroup.campaign;
  const { account } = profile;

  try {
    const accessToken = await getValidAccessToken(account);
    const client = new AmazonAdsClient(account.region as AmazonRegion, accessToken, profile.profileId);
    await client.updateTargetBids([{ targetId: target.targetId, bid }]);
  } catch (err) {
    return NextResponse.json({ error: `Amazon push failed: ${(err as Error).message}` }, { status: 502 });
  }

  const updated = await prisma.target.update({ where: { id }, data: { bid } });
  await logChange("target", id, "bid", target.bid, bid, currentUser(request));
  return NextResponse.json({ target: updated });
}
