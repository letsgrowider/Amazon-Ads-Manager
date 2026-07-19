import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logChange } from "@/lib/audit";
import { currentUser } from "@/lib/current-user";

// Notes are local-only context, not an Amazon Ads concept — no API push.
export async function PATCH(request: NextRequest, ctx: RouteContext<"/api/campaigns/[id]/notes">) {
  const { id } = await ctx.params;
  const { notes } = (await request.json()) as { notes?: string | null };

  if (notes !== null && notes !== undefined && typeof notes !== "string") {
    return NextResponse.json({ error: "notes must be a string or null" }, { status: 400 });
  }

  const existing = await prisma.campaign.findUnique({ where: { id }, select: { notes: true } });
  if (!existing) {
    return NextResponse.json({ error: "campaign not found" }, { status: 404 });
  }

  const cleaned = notes?.trim() || null;
  const campaign = await prisma.campaign.update({ where: { id }, data: { notes: cleaned } });
  await logChange("campaign", id, "notes", existing.notes, cleaned, currentUser(request));
  return NextResponse.json({ campaign });
}
