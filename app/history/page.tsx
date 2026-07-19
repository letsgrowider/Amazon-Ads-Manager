import Link from "next/link";
import { getChangeHistory } from "@/lib/audit";
import { formatMoney } from "@/lib/currency";

const FIELD_LABELS: Record<string, string> = {
  bid: "Bid",
  state: "State",
  dailyBudget: "Daily budget",
  targetAcos: "Target ACOS",
  tags: "Tags",
  status: "Status",
};

function formatValue(field: string, value: string | null, currencyCode: string | null) {
  if (value === null || value === "") return "—";
  if (field === "bid" || field === "dailyBudget") return formatMoney(Number(value), currencyCode);
  if (field === "targetAcos") return `${Number(value).toFixed(1)}%`;
  return value;
}

export default async function HistoryPage() {
  const logs = await getChangeHistory();

  return (
    <div className="flex flex-col flex-1 items-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-4xl flex-col gap-6 py-16 px-8">
        <div>
          <Link href="/" className="text-sm text-zinc-500 hover:underline">
            &larr; Dashboard
          </Link>
          <h1 className="mt-1 text-2xl font-semibold text-black dark:text-zinc-50">Change History</h1>
        </div>

        {logs.length === 0 ? (
          <p className="text-zinc-600 dark:text-zinc-400">
            No changes yet. Bid edits, budget/state changes, target ACOS, tags, and negative-keyword
            status changes all show up here.
          </p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-zinc-500 dark:border-zinc-800">
                <th className="py-2">When</th>
                <th className="py-2">Entity</th>
                <th className="py-2">Field</th>
                <th className="py-2">Change</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} className="border-b border-zinc-100 dark:border-zinc-900">
                  <td className="py-2 text-zinc-500">
                    {log.createdAt.toISOString().slice(0, 16).replace("T", " ")}
                  </td>
                  <td className="py-2 text-black dark:text-zinc-50">
                    {log.href ? (
                      <Link href={log.href} className="hover:underline">
                        {log.label}
                      </Link>
                    ) : (
                      log.label
                    )}
                  </td>
                  <td className="py-2 text-zinc-600 dark:text-zinc-400">
                    {FIELD_LABELS[log.field] ?? log.field}
                  </td>
                  <td className="py-2 text-zinc-600 dark:text-zinc-400">
                    {formatValue(log.field, log.oldValue, log.currencyCode)}{" "}
                    <span className="text-zinc-400">&rarr;</span>{" "}
                    {formatValue(log.field, log.newValue, log.currencyCode)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </main>
    </div>
  );
}
