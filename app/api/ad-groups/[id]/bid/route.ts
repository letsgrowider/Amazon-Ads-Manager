import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { AmazonAdsClient, type AmazonRegion } from "@/lib/amazon-ads";
import { getValidAccessToken } from "@/lib/amazon-account";
import { logChange } from "@/lib/audit";

export async function PUT(request: NextRequest, ctx: RouteContext<"/api/ad-groups/[id]/bid">) {
  const { id } = await ctx.params;
  const { defaultBid } = (await request.json()) as { defaultBid?: number };

  if (typeof defaultBid !== "number" || defaultBid <= 0) {
    return NextResponse.json({ error: "defaultBid must be a positive number" }, { status: 400 });
  }

  const adGroup = await prisma.adGroup.findUnique({
    where: { id },
    include: { campaign: { include: { profile: { include: { account: true } } } } },
  });
  if (!adGroup) {
    return NextResponse.json({ error: "ad group not found" }, { status: 404 });
  }

  const { profile } = adGroup.campaign;
  const { account } = profile;

  try {
    const accessToken = await getValidAccessToken(account);
    const client = new AmazonAdsClient(account.region as AmazonRegion, accessToken, profile.profileId);
    await client.updateAdGroups([
      { adGroupId: adGroup.adGroupId, name: adGroup.name, state: adGroup.state.toUpperCase(), defaultBid },
    ]);
  } catch (err) {
    return NextResponse.json({ error: `Amazon push failed: ${(err as Error).message}` }, { status: 502 });
  }

  const updated = await prisma.adGroup.update({ where: { id }, data: { defaultBid } });
  await logChange("adGroup", id, "defaultBid", adGroup.defaultBid, defaultBid);
  return NextResponse.json({ adGroup: updated });
}
