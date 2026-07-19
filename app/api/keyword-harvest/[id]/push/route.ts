import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { AmazonAdsClient, type AmazonRegion } from "@/lib/amazon-ads";
import { getValidAccessToken } from "@/lib/amazon-account";
import { logChange } from "@/lib/audit";

const MATCH_TYPE_MAP: Record<string, "EXACT" | "PHRASE" | "BROAD"> = {
  exact: "EXACT",
  phrase: "PHRASE",
  broad: "BROAD",
};

const DEFAULT_BID = 0.5; // Amazon rejects a $0 bid; used only if no suggestedBid was recorded.

// Pushes a locally-queued keyword-harvest suggestion to Amazon for real —
// these were previously local-only (see the model's doc comment), so
// "queued" suggestions never actually became a live keyword.
export async function POST(_request: Request, ctx: RouteContext<"/api/keyword-harvest/[id]/push">) {
  const { id } = await ctx.params;

  const suggestion = await prisma.keywordHarvestSuggestion.findUnique({
    where: { id },
    include: { adGroup: { include: { campaign: { include: { profile: { include: { account: true } } } } } } },
  });
  if (!suggestion) {
    return NextResponse.json({ error: "suggestion not found" }, { status: 404 });
  }
  if (suggestion.status === "added") {
    return NextResponse.json({ error: "already added" }, { status: 400 });
  }

  const matchType = MATCH_TYPE_MAP[suggestion.matchType];
  if (!matchType) {
    return NextResponse.json({ error: `unsupported matchType: ${suggestion.matchType}` }, { status: 400 });
  }

  const { adGroup } = suggestion;
  const { campaign } = adGroup;
  const { profile } = campaign;
  const { account } = profile;

  try {
    const accessToken = await getValidAccessToken(account);
    const client = new AmazonAdsClient(account.region as AmazonRegion, accessToken, profile.profileId);
    const result = await client.createKeywords([
      {
        campaignId: campaign.campaignId,
        adGroupId: adGroup.adGroupId,
        keywordText: suggestion.keywordText,
        matchType,
        bid: suggestion.suggestedBid ?? DEFAULT_BID,
      },
    ]);

    const failure = result.keywords.error[0];
    if (failure) {
      return NextResponse.json({ error: JSON.stringify(failure.errors ?? failure) }, { status: 422 });
    }

    await prisma.keywordHarvestSuggestion.update({ where: { id }, data: { status: "added" } });
    await logChange("keywordHarvestSuggestion", id, "status", suggestion.status, "added");
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
