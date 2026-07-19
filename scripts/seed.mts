import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local" });

// Dynamic import: static imports hoist above the config() calls above,
// so lib/db.ts would read process.env.DATABASE_URL before it's set.
const { prisma } = await import("@/lib/db");

// Fake data for local UI development while real Amazon API access is
// pending approval. Safe to re-run — clears and recreates.
async function main() {
  await prisma.searchTermReport.deleteMany();
  await prisma.metricSnapshot.deleteMany();
  await prisma.negativeKeywordSuggestion.deleteMany();
  await prisma.keywordHarvestSuggestion.deleteMany();
  await prisma.keyword.deleteMany();
  await prisma.adGroup.deleteMany();
  await prisma.campaign.deleteMany();
  await prisma.profile.deleteMany();
  await prisma.amazonAccount.deleteMany();

  const account = await prisma.amazonAccount.create({
    data: {
      name: "Demo Account (seeded)",
      region: "NA",
      accessToken: "demo",
      refreshToken: "demo",
      tokenExpiresAt: new Date(Date.now() + 3600_000),
    },
  });

  const profile = await prisma.profile.create({
    data: {
      profileId: "1111111111",
      countryCode: "US",
      currencyCode: "USD",
      marketplaceId: "ATVPDKIKX0DER",
      accountId: account.id,
    },
  });

  const campaignDefs = [
    { name: "Auto - Wireless Chargers", targetingType: "auto", dailyBudget: 25 },
    { name: "Manual Exact - Wireless Chargers", targetingType: "manual", dailyBudget: 40 },
    { name: "Manual Phrase - Phone Stands", targetingType: "manual", dailyBudget: 15 },
  ];

  // UTC midnight, not local — matches how sync.ts stores report dates
  // (new Date("YYYY-MM-DD") is UTC per the ECMAScript spec), so seeded
  // data lines up with date-range filtering the same way real synced
  // data would.
  const today = new Date(new Date().toISOString().slice(0, 10));

  for (let ci = 0; ci < campaignDefs.length; ci++) {
    const def = campaignDefs[ci];
    const campaign = await prisma.campaign.create({
      data: {
        campaignId: `demo-campaign-${ci}`,
        name: def.name,
        state: "enabled",
        targetingType: def.targetingType,
        dailyBudget: def.dailyBudget,
        startDate: today,
        profileId: profile.id,
      },
    });

    const adGroup = await prisma.adGroup.create({
      data: {
        adGroupId: `demo-adgroup-${ci}`,
        name: `${def.name} - Ad Group 1`,
        state: "enabled",
        defaultBid: 0.75,
        campaignId: campaign.id,
      },
    });

    const keywordDefs = [
      { text: "wireless charger", matchType: "exact", bid: 0.85 },
      { text: "fast charging pad", matchType: "phrase", bid: 0.65 },
      { text: "phone stand desk", matchType: "broad", bid: 0.45 },
    ];

    const keywords = [];
    for (let ki = 0; ki < keywordDefs.length; ki++) {
      const kd = keywordDefs[ki];
      const keyword = await prisma.keyword.create({
        data: {
          keywordId: `demo-keyword-${ci}-${ki}`,
          keywordText: kd.text,
          matchType: kd.matchType,
          state: "enabled",
          bid: kd.bid,
          adGroupId: adGroup.id,
        },
      });
      keywords.push(keyword);
    }

    // 14 days of campaign + ad group metrics with some randomness.
    for (let d = 0; d < 14; d++) {
      const date = new Date(today);
      date.setUTCDate(date.getUTCDate() - d);

      const impressions = Math.floor(800 + Math.random() * 1200);
      const clicks = Math.floor(impressions * (0.02 + Math.random() * 0.03));
      const spend = Number((clicks * (0.5 + Math.random() * 0.6)).toFixed(2));
      const orders = Math.floor(clicks * (0.05 + Math.random() * 0.1));
      const sales = Number((orders * (20 + Math.random() * 15)).toFixed(2));

      const metricValues = {
        impressions,
        clicks,
        spend,
        sales,
        orders,
        acos: sales > 0 ? Number(((spend / sales) * 100).toFixed(2)) : 0,
        ctr: impressions > 0 ? Number(((clicks / impressions) * 100).toFixed(2)) : 0,
      };

      await prisma.metricSnapshot.create({
        data: { date, entityType: "campaign", campaignId: campaign.id, ...metricValues },
      });
      await prisma.metricSnapshot.create({
        data: {
          date,
          entityType: "adGroup",
          adGroupId: adGroup.id,
          impressions: Math.floor(impressions * 0.9),
          clicks: Math.floor(clicks * 0.9),
          spend: Number((spend * 0.9).toFixed(2)),
          sales: Number((sales * 0.9).toFixed(2)),
          orders: Math.floor(orders * 0.9),
          acos: metricValues.acos,
          ctr: metricValues.ctr,
        },
      });
    }

    // Search terms: mix of good performers and wasted-spend candidates for
    // the negative-keyword harvesting page.
    const searchTermDefs = [
      { term: "wireless charger fast", clicks: 40, spend: 28, orders: 6, sales: 180 },
      { term: "charging pad for iphone", clicks: 25, spend: 18, orders: 3, sales: 90 },
      { term: "free wireless charger giveaway", clicks: 15, spend: 11, orders: 0, sales: 0 },
      { term: "cheap phone accessories bulk", clicks: 22, spend: 16, orders: 0, sales: 0 },
      { term: "wireless charger repair parts", clicks: 9, spend: 7, orders: 0, sales: 0 },
    ];

    for (const st of searchTermDefs) {
      await prisma.searchTermReport.create({
        data: {
          date: today,
          searchTerm: st.term,
          keywordId: keywords[0]?.keywordId,
          campaignId: campaign.campaignId,
          adGroupId: adGroup.adGroupId,
          impressions: st.clicks * 15,
          clicks: st.clicks,
          spend: st.spend,
          sales: st.sales,
          orders: st.orders,
        },
      });
    }
  }

  console.log("Seeded demo data.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
