import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// Pausing sync for a profile is local-only bookkeeping, not an Amazon Ads
// concept -- it just makes syncAllAccounts() skip that profile so a slow
// or unwanted account stops eating time in every run.
export async function PATCH(request: NextRequest, ctx: RouteContext<"/api/profiles/[id]/sync-enabled">) {
  const { id } = await ctx.params;
  const { syncEnabled } = (await request.json()) as { syncEnabled?: unknown };

  if (typeof syncEnabled !== "boolean") {
    return NextResponse.json({ error: "syncEnabled must be a boolean" }, { status: 400 });
  }

  const existing = await prisma.profile.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "profile not found" }, { status: 404 });
  }

  const profile = await prisma.profile.update({ where: { id }, data: { syncEnabled } });
  return NextResponse.json({ profile });
}
