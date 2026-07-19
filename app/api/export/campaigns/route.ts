import { NextRequest } from "next/server";
import { getCampaignRows } from "@/lib/reporting";
import { resolveDateRange } from "@/lib/date-range";
import { toCsv, csvResponse } from "@/lib/csv";

export async function GET(request: NextRequest) {
  const range = resolveDateRange(Object.fromEntries(request.nextUrl.searchParams));
  const rows = await getCampaignRows(range);
  const csv = toCsv(
    ["Campaign", "State", "Targeting Type", "Currency", "Daily Budget", "Spend", "Sales", "ACOS %", "CTR %", "Orders"],
    rows.map((r) => [
      r.campaign.name,
      r.campaign.state,
      r.campaign.targetingType,
      r.campaign.profile.currencyCode,
      r.campaign.dailyBudget.toFixed(2),
      r.spend.toFixed(2),
      r.sales.toFixed(2),
      r.acos.toFixed(2),
      r.ctr.toFixed(2),
      r.orders,
    ])
  );
  return csvResponse(csv, "campaigns.csv");
}
