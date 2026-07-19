// Every money value in this app was hardcoded to "$" regardless of the
// profile's actual currencyCode (synced from Amazon's /v2/profiles) —
// an India profile's real spend in INR was being labelled as if it were
// USD. Central symbol lookup so every display site can show the real
// currency instead of assuming USD.
const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: "$",
  CAD: "$",
  MXN: "$",
  AUD: "$",
  SGD: "$",
  NZD: "$",
  INR: "₹",
  EUR: "€",
  GBP: "£",
  JPY: "¥",
  TRY: "₺",
  ZAR: "R",
  SEK: "kr",
  PLN: "zł",
  BRL: "R$",
  AED: "AED ",
  SAR: "SAR ",
  EGP: "EGP ",
};

export function currencySymbol(code?: string | null): string {
  if (!code) return "$";
  return CURRENCY_SYMBOLS[code] ?? `${code} `;
}

export function formatMoney(amount: number, code?: string | null): string {
  return `${currencySymbol(code)}${amount.toFixed(2)}`;
}

// For a set of rows that may span multiple profiles/currencies (an
// unfiltered list, or "All accounts") — only returns a code if every row
// agrees, since summing/labelling mixed currencies as one symbol would be
// actively wrong, not just imprecise.
export function uniformCurrency(codes: (string | null | undefined)[]): string | undefined {
  const distinct = new Set(codes.filter((c): c is string => Boolean(c)));
  return distinct.size === 1 ? [...distinct][0] : undefined;
}
