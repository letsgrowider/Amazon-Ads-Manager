import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logChange } from "@/lib/audit";
import { currentUser } from "@/lib/current-user";

// Local-only schedule config — no immediate Amazon push. Actually applying
// the schedule happens on the next scheduled run of `npm run dayparting`
// (see lib/dayparting.ts), not synchronously here.
export async function PATCH(request: NextRequest, ctx: RouteContext<"/api/campaigns/[id]/dayparting">) {
  const { id } = await ctx.params;
  const { daypartingEnabled, daypartingHours } = (await request.json()) as {
    daypartingEnabled?: boolean;
    daypartingHours?: number[];
  };

  if (daypartingEnabled !== undefined && typeof daypartingEnabled !== "boolean") {
    return NextResponse.json({ error: "daypartingEnabled must be a boolean" }, { status: 400 });
  }
  if (
    daypartingHours !== undefined &&
    (!Array.isArray(daypartingHours) || !daypartingHours.every((h) => Number.isInteger(h) && h >= 0 && h <= 23))
  ) {
    return NextResponse.json({ error: "daypartingHours must be an array of integers 0-23" }, { status: 400 });
  }

  const existing = await prisma.campaign.findUnique({
    where: { id },
    select: { daypartingEnabled: true, daypartingHours: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "campaign not found" }, { status: 404 });
  }

  const nextEnabled = daypartingEnabled ?? existing.daypartingEnabled;
  const nextHours = daypartingHours ?? existing.daypartingHours;

  const campaign = await prisma.campaign.update({
    where: { id },
    data: { daypartingEnabled: nextEnabled, daypartingHours: nextHours },
  });
  const user = currentUser(request);
  await logChange("campaign", id, "daypartingEnabled", existing.daypartingEnabled, nextEnabled, user);
  await logChange(
    "campaign",
    id,
    "daypartingHours",
    existing.daypartingHours.join(","),
    nextHours.join(","),
    user
  );
  return NextResponse.json({ campaign });
}
