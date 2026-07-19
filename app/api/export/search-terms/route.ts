import { NextRequest } from "next/server";
import { getSearchTermRows } from "@/lib/reporting";
import { resolveDateRange } from "@/lib/date-range";
import { toCsv, csvResponse } from "@/lib/csv";

export async function GET(request: NextRequest) {
  const range = resolveDateRange(Object.fromEntries(request.nextUrl.searchParams));
  const campaignId = request.nextUrl.searchParams.get("campaign") ?? undefined;
  const rows = await getSearchTermRows(range, { campaignId });
  const csv = toCsv(
    ["Search Term", "Campaign", "Ad Group", "Currency", "Clicks", "Spend", "Orders", "ACOS", "ROAS", "Wasted Spend Candidate"],
    rows.map(({ row, campaignName, adGroupName, currencyCode, acos, roas, isWastedSpend }) => [
      row.searchTerm,
      campaignName,
      adGroupName,
      currencyCode,
      row.clicks,
      row.spend.toFixed(2),
      row.orders,
      acos.toFixed(1),
      roas.toFixed(2),
      isWastedSpend ? "yes" : "no",
    ])
  );
  return csvResponse(csv, "search-terms.csv");
}
