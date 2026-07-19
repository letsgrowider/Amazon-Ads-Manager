import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { AmazonAdsClient, type AmazonRegion } from "@/lib/amazon-ads";
import { getValidAccessToken } from "@/lib/amazon-account";
import { logChange } from "@/lib/audit";

export async function PATCH(request: NextRequest, ctx: RouteContext<"/api/campaigns/[id]">) {
  const { id } = await ctx.params;
  const { state, dailyBudget } = (await request.json()) as { state?: string; dailyBudget?: number };

  if (state !== undefined && state !== "enabled" && state !== "paused") {
    return NextResponse.json({ error: 'state must be "enabled" or "paused"' }, { status: 400 });
  }
  if (dailyBudget !== undefined && (typeof dailyBudget !== "number" || dailyBudget <= 0)) {
    return NextResponse.json({ error: "dailyBudget must be a positive number" }, { status: 400 });
  }

  const campaign = await prisma.campaign.findUnique({
    where: { id },
    include: { profile: { include: { account: true } } },
  });
  if (!campaign) {
    return NextResponse.json({ error: "campaign not found" }, { status: 404 });
  }

  const nextState = state ?? campaign.state;
  const nextBudget = dailyBudget ?? campaign.dailyBudget;
  const { profile } = campaign;
  const { account } = profile;

  // startDate is required by Amazon's campaign-update schema but not
  // something we ever want to change here — only send it once it's been
  // synced from a real account, rather than fabricate a value.
  if (!campaign.startDate) {
    return NextResponse.json(
      { error: "Campaign hasn't been synced with startDate yet — run a sync first." },
      { status: 400 }
    );
  }

  try {
    const accessToken = await getValidAccessToken(account);
    const client = new AmazonAdsClient(account.region as AmazonRegion, accessToken, profile.profileId);
    await client.updateCampaigns([
      {
        campaignId: campaign.campaignId,
        name: campaign.name,
        targetingType: campaign.targetingType.toUpperCase(),
        state: nextState.toUpperCase(),
        budget: { budget: nextBudget, budgetType: "DAILY" },
        startDate: campaign.startDate.toISOString().slice(0, 10),
      },
    ]);
  } catch (err) {
    return NextResponse.json({ error: `Amazon push failed: ${(err as Error).message}` }, { status: 502 });
  }

  const updated = await prisma.campaign.update({
    where: { id },
    data: { state: nextState, dailyBudget: nextBudget },
  });
  await logChange("campaign", id, "state", campaign.state, nextState);
  await logChange("campaign", id, "dailyBudget", campaign.dailyBudget, nextBudget);
  return NextResponse.json({ campaign: updated });
}
