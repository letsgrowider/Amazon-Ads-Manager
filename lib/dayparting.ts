import { prisma } from "@/lib/db";
import { AmazonAdsClient, type AmazonRegion } from "@/lib/amazon-ads";
import { getValidAccessToken } from "@/lib/amazon-account";
import { logChange } from "@/lib/audit";

export interface DaypartingResult {
  campaignId: string;
  campaignName: string;
  from: string;
  to: string;
  error?: string;
}

// Sets each dayparting-enabled campaign to enabled/paused based on whether
// the current UTC hour is in its schedule. Meant to run on a schedule (e.g.
// hourly via cron calling `npm run dayparting`) — nothing in this app
// invokes it automatically. Note: hours are UTC, not the campaign's
// marketplace timezone, since we don't track that — a real limitation,
// documented rather than silently wrong.
export async function applyDaypartingSchedule(): Promise<DaypartingResult[]> {
  const campaigns = await prisma.campaign.findMany({
    where: { daypartingEnabled: true },
    include: { profile: { include: { account: true } } },
  });

  const currentHour = new Date().getUTCHours();
  const results: DaypartingResult[] = [];

  for (const campaign of campaigns) {
    const shouldBeEnabled = campaign.daypartingHours.includes(currentHour);
    const desiredState = shouldBeEnabled ? "enabled" : "paused";
    if (campaign.state === desiredState) continue; // already correct, nothing to do

    const result: DaypartingResult = {
      campaignId: campaign.id,
      campaignName: campaign.name,
      from: campaign.state,
      to: desiredState,
    };

    if (!campaign.startDate) {
      result.error = "no startDate synced yet — skipped";
      results.push(result);
      continue;
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
          state: desiredState.toUpperCase(),
          budget: { budget: campaign.dailyBudget, budgetType: "DAILY" },
          startDate: campaign.startDate.toISOString().slice(0, 10),
        },
      ]);
      await prisma.campaign.update({ where: { id: campaign.id }, data: { state: desiredState } });
      await logChange("campaign", campaign.id, "state", campaign.state, desiredState);
    } catch (err) {
      result.error = (err as Error).message;
    }

    results.push(result);
  }

  return results;
}
