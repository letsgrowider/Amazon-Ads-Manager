import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logChange } from "@/lib/audit";

export async function PATCH(request: NextRequest, ctx: RouteContext<"/api/campaigns/[id]/target-acos">) {
  const { id } = await ctx.params;
  const { targetAcos } = (await request.json()) as { targetAcos?: number | null };

  if (targetAcos !== null && (typeof targetAcos !== "number" || targetAcos <= 0)) {
    return NextResponse.json({ error: "targetAcos must be a positive number or null" }, { status: 400 });
  }

  const existing = await prisma.campaign.findUnique({ where: { id }, select: { targetAcos: true } });
  if (!existing) {
    return NextResponse.json({ error: "campaign not found" }, { status: 404 });
  }

  const campaign = await prisma.campaign.update({ where: { id }, data: { targetAcos } });
  await logChange("campaign", id, "targetAcos", existing.targetAcos, targetAcos);
  return NextResponse.json({ campaign });
}
