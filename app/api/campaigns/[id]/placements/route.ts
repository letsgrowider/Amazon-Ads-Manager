import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import type { Prisma } from "@/app/generated/prisma/client";
import { AmazonAdsClient, type AmazonRegion, type PlacementBiddingInput } from "@/lib/amazon-ads";
import { getValidAccessToken } from "@/lib/amazon-account";
import { logChange } from "@/lib/audit";
import { currentUser } from "@/lib/current-user";

const VALID_PLACEMENTS = ["PLACEMENT_TOP", "PLACEMENT_PRODUCT_PAGE", "PLACEMENT_REST_OF_SEARCH"];

export async function PATCH(request: NextRequest, ctx: RouteContext<"/api/campaigns/[id]/placements">) {
  const { id } = await ctx.params;
  const { placementBidding } = (await request.json()) as { placementBidding?: PlacementBiddingInput[] };

  if (!Array.isArray(placementBidding)) {
    return NextResponse.json({ error: "placementBidding must be an array" }, { status: 400 });
  }
  for (const p of placementBidding) {
    if (!VALID_PLACEMENTS.includes(p.placement) || typeof p.percentage !== "number" || p.percentage < 0) {
      return NextResponse.json({ error: `invalid placement entry: ${JSON.stringify(p)}` }, { status: 400 });
    }
  }

  const campaign = await prisma.campaign.findUnique({
    where: { id },
    include: { profile: { include: { account: true } } },
  });
  if (!campaign) {
    return NextResponse.json({ error: "campaign not found" }, { status: 404 });
  }
  if (!campaign.startDate) {
    return NextResponse.json(
      { error: "Campaign hasn't been synced with startDate yet — run a sync first." },
      { status: 400 }
    );
  }

  const { profile } = campaign;
  const { account } = profile;

  try {
    const accessToken = await getValidAccessToken(account);
    const client = new AmazonAdsClient(account.region as AmazonRegion, accessToken, profile.profileId);
    await client.updateCampaigns([
      {
        campaignId: campaign.campaignId,
        name: campaign.name,
        targetingType: campaign.targetingType.toUpperCase(),
        state: campaign.state.toUpperCase(),
        budget: { budget: campaign.dailyBudget, budgetType: "DAILY" },
        startDate: campaign.startDate.toISOString().slice(0, 10),
        dynamicBidding: { strategy: campaign.biddingStrategy.toUpperCase(), placementBidding },
      },
    ]);
  } catch (err) {
    return NextResponse.json({ error: `Amazon push failed: ${(err as Error).message}` }, { status: 502 });
  }

  const updated = await prisma.campaign.update({
    where: { id },
    data: { placementBidding: placementBidding as unknown as Prisma.InputJsonValue },
  });
  await logChange(
    "campaign",
    id,
    "placementBidding",
    JSON.stringify(campaign.placementBidding),
    JSON.stringify(placementBidding),
    currentUser(request)
  );
  return NextResponse.json({ campaign: updated });
}
