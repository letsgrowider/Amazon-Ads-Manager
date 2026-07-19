import { NextRequest } from "next/server";
import { getKeywordRows } from "@/lib/reporting";
import { resolveDateRange } from "@/lib/date-range";
import { toCsv, csvResponse } from "@/lib/csv";

export async function GET(request: NextRequest) {
  const range = resolveDateRange(Object.fromEntries(request.nextUrl.searchParams));
  const campaignId = request.nextUrl.searchParams.get("campaign") ?? undefined;
  const search = request.nextUrl.searchParams.get("q") ?? undefined;
  const rows = await getKeywordRows(range, { campaignId, search });
  const csv = toCsv(
    ["Keyword", "Match Type", "State", "Currency", "Bid", "Campaign", "Ad Group", "Clicks", "Spend", "Orders", "ACOS", "ROAS"],
    rows.map(({ keyword, campaignName, adGroupName, currencyCode, clicks, spend, orders, acos, roas }) => [
      keyword.keywordText,
      keyword.matchType,
      keyword.state,
      currencyCode,
      keyword.bid.toFixed(2),
      campaignName,
      adGroupName,
      clicks,
      spend.toFixed(2),
      orders,
      acos.toFixed(1),
      roas.toFixed(2),
    ])
  );
  return csvResponse(csv, "keywords.csv");
}
