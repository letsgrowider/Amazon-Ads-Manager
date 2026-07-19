import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local" });

// Dynamic import: static imports hoist above the config() calls above,
// so lib/dayparting.ts (via lib/db.ts) would read process.env.DATABASE_URL
// before it's set.
const { applyDaypartingSchedule } = await import("@/lib/dayparting");

// Run this on a schedule (e.g. hourly cron) — nothing in the app calls it
// automatically. See lib/dayparting.ts for the UTC-hour caveat.
applyDaypartingSchedule()
  .then((results) => {
    console.log(JSON.stringify(results, null, 2));
    process.exit(0);
  })
  .catch((err) => {
    console.error("Dayparting run failed:", err);
    process.exit(1);
  });
