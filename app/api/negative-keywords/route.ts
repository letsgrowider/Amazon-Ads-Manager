import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// Queues a negative-keyword candidate locally. Does not push to Amazon yet —
// see the comment on NegativeKeywordSuggestion in schema.prisma for why.
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { searchTerm, adGroupAmazonId } = body as { searchTerm?: string; adGroupAmazonId?: string };

  if (!searchTerm || !adGroupAmazonId) {
    return NextResponse.json({ error: "searchTerm and adGroupAmazonId are required" }, { status: 400 });
  }

  const adGroup = await prisma.adGroup.findUnique({ where: { adGroupId: adGroupAmazonId } });
  if (!adGroup) {
    return NextResponse.json({ error: `No ad group found for ${adGroupAmazonId}` }, { status: 404 });
  }

  const suggestion = await prisma.negativeKeywordSuggestion.upsert({
    where: { keywordText_adGroupId: { keywordText: searchTerm, adGroupId: adGroup.id } },
    create: { keywordText: searchTerm, adGroupId: adGroup.id },
    update: {},
  });

  return NextResponse.json({ suggestion });
}
