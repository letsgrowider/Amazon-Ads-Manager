import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logChange } from "@/lib/audit";
import { currentUser } from "@/lib/current-user";

// Tags are local-only organization, not an Amazon Ads concept — no API push.
export async function PATCH(request: NextRequest, ctx: RouteContext<"/api/campaigns/[id]/tags">) {
  const { id } = await ctx.params;
  const { tags } = (await request.json()) as { tags?: unknown };

  if (!Array.isArray(tags) || !tags.every((t) => typeof t === "string")) {
    return NextResponse.json({ error: "tags must be an array of strings" }, { status: 400 });
  }

  const existing = await prisma.campaign.findUnique({ where: { id }, select: { tags: true } });
  if (!existing) {
    return NextResponse.json({ error: "campaign not found" }, { status: 404 });
  }

  const cleaned = [...new Set(tags.map((t) => t.trim()).filter(Boolean))];
  const campaign = await prisma.campaign.update({ where: { id }, data: { tags: cleaned } });
  await logChange("campaign", id, "tags", existing.tags.join(", "), cleaned.join(", "), currentUser(request));
  return NextResponse.json({ campaign });
}
