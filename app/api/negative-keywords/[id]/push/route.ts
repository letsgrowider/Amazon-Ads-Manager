import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { AmazonAdsClient, type AmazonRegion } from "@/lib/amazon-ads";
import { getValidAccessToken } from "@/lib/amazon-account";
import { logChange } from "@/lib/audit";
import { currentUser } from "@/lib/current-user";

const MATCH_TYPE_MAP: Record<string, "NEGATIVE_EXACT" | "NEGATIVE_PHRASE"> = {
  negativeExact: "NEGATIVE_EXACT",
  negativePhrase: "NEGATIVE_PHRASE",
};

// Pushes a locally-queued negative-keyword suggestion to Amazon for real —
// these were previously local-only (see the model's doc comment), so
// "queued" suggestions never actually did anything to the live account.
export async function POST(request: Request, ctx: RouteContext<"/api/negative-keywords/[id]/push">) {
  const { id } = await ctx.params;

  const suggestion = await prisma.negativeKeywordSuggestion.findUnique({
    where: { id },
    include: { adGroup: { include: { campaign: { include: { profile: { include: { account: true } } } } } } },
  });
  if (!suggestion) {
    return NextResponse.json({ error: "suggestion not found" }, { status: 404 });
  }
  if (suggestion.status === "pushed") {
    return NextResponse.json({ error: "already pushed" }, { status: 400 });
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
    const result = await client.createNegativeKeywords([
      {
        campaignId: campaign.campaignId,
        adGroupId: adGroup.adGroupId,
        keywordText: suggestion.keywordText,
        matchType,
      },
    ]);

    const failure = result.negativeKeywords.error[0];
    if (failure) {
      return NextResponse.json({ error: JSON.stringify(failure.errors ?? failure) }, { status: 422 });
    }

    await prisma.negativeKeywordSuggestion.update({ where: { id }, data: { status: "pushed" } });
    await logChange("negativeKeywordSuggestion", id, "status", suggestion.status, "pushed", currentUser(request));
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
