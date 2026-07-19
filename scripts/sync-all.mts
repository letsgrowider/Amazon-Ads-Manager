import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local" });

// Dynamic import: static imports hoist above the config() calls above,
// so lib/sync.ts (via lib/db.ts) would read process.env.DATABASE_URL
// before it's set.
const { syncAllAccounts } = await import("@/lib/sync");

syncAllAccounts()
  .then((results) => {
    console.log(JSON.stringify(results, null, 2));
    process.exit(0);
  })
  .catch((err) => {
    console.error("Sync failed:", err);
    process.exit(1);
  });
