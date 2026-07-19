import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logChange } from "@/lib/audit";
import { currentUser } from "@/lib/current-user";

export async function PATCH(request: NextRequest, ctx: RouteContext<"/api/negative-keywords/[id]">) {
  const { id } = await ctx.params;
  const { status } = (await request.json()) as { status?: string };

  if (status !== "queued" && status !== "dismissed") {
    return NextResponse.json({ error: 'status must be "queued" or "dismissed"' }, { status: 400 });
  }

  const existing = await prisma.negativeKeywordSuggestion.findUnique({ where: { id }, select: { status: true } });
  if (!existing) {
    return NextResponse.json({ error: "suggestion not found" }, { status: 404 });
  }

  const suggestion = await prisma.negativeKeywordSuggestion.update({ where: { id }, data: { status } });
  await logChange("negativeKeywordSuggestion", id, "status", existing.status, status, currentUser(request));
  return NextResponse.json({ suggestion });
}
