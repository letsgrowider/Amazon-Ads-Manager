import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// Queues a positive-keyword harvest candidate locally. Does not push to
// Amazon yet — see the comment on KeywordHarvestSuggestion in schema.prisma.
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { searchTerm, adGroupAmazonId, spend, clicks } = body as {
    searchTerm?: string;
    adGroupAmazonId?: string;
    spend?: number;
    clicks?: number;
  };

  if (!searchTerm || !adGroupAmazonId) {
    return NextResponse.json({ error: "searchTerm and adGroupAmazonId are required" }, { status: 400 });
  }

  const adGroup = await prisma.adGroup.findUnique({ where: { adGroupId: adGroupAmazonId } });
  if (!adGroup) {
    return NextResponse.json({ error: `No ad group found for ${adGroupAmazonId}` }, { status: 404 });
  }

  const suggestedBid =
    typeof spend === "number" && typeof clicks === "number" && clicks > 0
      ? Number((spend / clicks).toFixed(2))
      : undefined;

  const suggestion = await prisma.keywordHarvestSuggestion.upsert({
    where: { keywordText_adGroupId: { keywordText: searchTerm, adGroupId: adGroup.id } },
    create: { keywordText: searchTerm, adGroupId: adGroup.id, suggestedBid },
    update: {},
  });

  return NextResponse.json({ suggestion });
}
