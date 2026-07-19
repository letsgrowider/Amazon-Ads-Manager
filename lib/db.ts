import { PrismaClient } from "@/app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// Avoid exhausting DB connections from hot-reload in dev.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// The generated DATABASE_URL has a `connection_limit=10` query param, but
// that's a Prisma-engine convention the raw `pg.Pool` underneath
// @prisma/adapter-pg doesn't understand (it's silently ignored, falling
// back to pg's own default of 10). Sync's new profile+report concurrency
// (see lib/sync.ts) pushes real concurrent DB load past that — observed
// live as "bind message supplies N parameters, but prepared statement
// requires M" errors, a symptom of connections being checked out/in faster
// than the pool was sized for. Passing `max` explicitly actually sizes it.
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL, max: 20 });

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
