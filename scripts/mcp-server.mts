import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// Resolve .env relative to this file, not process.cwd() — MCP servers are
// launched by the client (Claude Code) with whatever cwd it chooses, which
// may not be this project's root.
// quiet: true matters here, not just cosmetic — dotenv v17 prints "tip"
// banners to stdout by default, and MCP's stdio transport treats every
// stdout line as a JSON-RPC message. Un-silenced, those banners would be
// the first bytes the client reads and corrupt the handshake.
const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
config({ path: join(projectRoot, ".env"), quiet: true });
config({ path: join(projectRoot, ".env.local"), quiet: true });

// Dynamic import: static imports hoist above the config() calls above, so
// lib/db.ts would read process.env.DATABASE_URL before it's set (see
// reference_esm_import_hoisting_dotenv memory — hit this bug twice already).
const { McpServer } = await import("@modelcontextprotocol/sdk/server/mcp.js");
const { StdioServerTransport } = await import("@modelcontextprotocol/sdk/server/stdio.js");
const { z } = await import("zod");
const { prisma } = await import("@/lib/db");
const { resolveDateRange, previousPeriod, percentChange } = await import("@/lib/date-range");
const { getCampaignRows, getAccountSummary, getBudgetConstrainedCampaigns, ALERT_ACOS_THRESHOLD } = await import(
  "@/lib/reporting"
);

const server = new McpServer({ name: "amazon-ppc-manager", version: "1.0.0" });

function textResult(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

server.registerTool(
  "list_campaigns",
  {
    title: "List campaigns",
    description:
      "List all campaigns with spend/sales/ACOS/CTR/orders over a date range, plus % change vs the prior equal-length period.",
    inputSchema: {
      days: z.number().int().positive().optional().describe("Window size in days (default 14)"),
    },
  },
  async ({ days }) => {
    const range = resolveDateRange({ days: days ? String(days) : undefined });
    const rows = await getCampaignRows(range);
    const prevRows = await getCampaignRows(previousPeriod(range));
    const prevAcosByCampaign = new Map(prevRows.map((r) => [r.campaign.id, r.acos]));

    return textResult({
      range: range.label,
      campaigns: rows.map((r) => ({
        name: r.campaign.name,
        state: r.campaign.state,
        targetingType: r.campaign.targetingType,
        dailyBudget: r.campaign.dailyBudget,
        targetAcos: r.campaign.targetAcos,
        tags: r.campaign.tags,
        spend: r.spend,
        sales: r.sales,
        acos: Number(r.acos.toFixed(2)),
        acosChangePct: percentChange(r.acos, prevAcosByCampaign.get(r.campaign.id) ?? 0),
        ctr: Number(r.ctr.toFixed(2)),
        orders: r.orders,
      })),
    });
  }
);

server.registerTool(
  "get_campaign_detail",
  {
    title: "Get campaign detail",
    description: "Get ad groups and keywords for a campaign, matched by name (case-insensitive substring).",
    inputSchema: {
      name: z.string().describe("Campaign name or partial name to search for"),
    },
  },
  async ({ name }) => {
    const campaign = await prisma.campaign.findFirst({
      where: { name: { contains: name, mode: "insensitive" } },
      include: { adGroups: { include: { keywords: true } } },
    });
    if (!campaign) return textResult({ error: `No campaign matching "${name}"` });

    return textResult({
      name: campaign.name,
      state: campaign.state,
      targetingType: campaign.targetingType,
      dailyBudget: campaign.dailyBudget,
      targetAcos: campaign.targetAcos,
      notes: campaign.notes,
      tags: campaign.tags,
      adGroups: campaign.adGroups.map((ag) => ({
        name: ag.name,
        state: ag.state,
        defaultBid: ag.defaultBid,
        keywords: ag.keywords.map((kw) => ({
          text: kw.keywordText,
          matchType: kw.matchType,
          state: kw.state,
          bid: kw.bid,
        })),
      })),
    });
  }
);

server.registerTool(
  "list_alerts",
  {
    title: "List alerts",
    description:
      "List campaigns needing attention: above the ACOS threshold, or budget-constrained on the most recent synced day.",
    inputSchema: {
      days: z.number().int().positive().optional().describe("Window size in days for the ACOS check (default 14)"),
    },
  },
  async ({ days }) => {
    const range = resolveDateRange({ days: days ? String(days) : undefined });
    const summary = await getAccountSummary(range);
    const budgetConstrained = await getBudgetConstrainedCampaigns();

    return textResult({
      range: range.label,
      acosThresholdPct: ALERT_ACOS_THRESHOLD,
      highAcosCampaigns: summary.alerts.map((a) => ({
        name: a.campaign.name,
        acos: Number(a.acos.toFixed(2)),
        spend: a.spend,
      })),
      budgetConstrainedCampaigns: budgetConstrained.map((b) => ({
        name: b.campaign.name,
        date: b.date.toISOString().slice(0, 10),
        spend: b.spend,
        dailyBudget: b.campaign.dailyBudget,
        utilizationPct: Number((b.utilization * 100).toFixed(0)),
      })),
    });
  }
);

server.registerTool(
  "search",
  {
    title: "Search campaigns, keywords, and search terms",
    description: "Search campaigns, keywords, and Amazon search terms by substring (case-insensitive).",
    inputSchema: {
      query: z.string().min(1),
    },
  },
  async ({ query }) => {
    const [campaigns, keywords, searchTerms] = await Promise.all([
      prisma.campaign.findMany({ where: { name: { contains: query, mode: "insensitive" } }, take: 25 }),
      prisma.keyword.findMany({
        where: { keywordText: { contains: query, mode: "insensitive" } },
        include: { adGroup: { include: { campaign: true } } },
        take: 25,
      }),
      prisma.searchTermReport.findMany({
        where: { searchTerm: { contains: query, mode: "insensitive" } },
        distinct: ["searchTerm"],
        take: 25,
      }),
    ]);

    return textResult({
      campaigns: campaigns.map((c) => ({ name: c.name, state: c.state })),
      keywords: keywords.map((k) => ({
        text: k.keywordText,
        matchType: k.matchType,
        campaign: k.adGroup.campaign.name,
      })),
      searchTerms: searchTerms.map((s) => s.searchTerm),
    });
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
