"use client";

import { useRouter } from "next/navigation";

// Amazon marketplace country codes worth naming — falls back to the raw
// code for anything not listed rather than guessing.
const COUNTRY_NAMES: Record<string, string> = {
  US: "United States",
  CA: "Canada",
  MX: "Mexico",
  BR: "Brazil",
  UK: "United Kingdom",
  GB: "United Kingdom",
  DE: "Germany",
  FR: "France",
  IT: "Italy",
  ES: "Spain",
  NL: "Netherlands",
  SE: "Sweden",
  PL: "Poland",
  BE: "Belgium",
  TR: "Turkey",
  AE: "United Arab Emirates",
  EG: "Egypt",
  SA: "Saudi Arabia",
  IN: "India",
  ZA: "South Africa",
  JP: "Japan",
  AU: "Australia",
  SG: "Singapore",
};

export interface ProfileOption {
  id: string; // Profile.id (what filtering is keyed on)
  countryCode: string;
  accountName: string;
  // The actual seller/vendor business name (Amazon's accountInfo.name) —
  // countryCode alone doesn't distinguish multiple entities in the same
  // marketplace (e.g. several separate India sellers under one login).
  entityName: string | null;
}

// A dropdown of individual marketplaces/profiles, not just accounts — an
// account can hold many country profiles (e.g. one EU-region login covering
// UK/DE/FR/.../India), which used to only be filterable as one blended
// group with no way to isolate a single country.
export function AccountSwitcher({
  profiles,
  activeProfileId,
  basePath,
  extraQuery = "",
}: {
  profiles: ProfileOption[];
  activeProfileId?: string;
  basePath: string;
  extraQuery?: string;
}) {
  const router = useRouter();

  if (profiles.length <= 1) return null;

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const value = e.target.value;
    const sep = extraQuery ? "&" : "";
    const qs = value ? `${extraQuery}${sep}profile=${value}` : extraQuery;
    router.push(`${basePath}?${qs}`);
  }

  return (
    <select
      value={activeProfileId ?? ""}
      onChange={onChange}
      className="rounded-full border border-zinc-300 bg-transparent px-3 py-1.5 text-sm dark:border-zinc-700"
    >
      <option value="">All accounts</option>
      {profiles.map((p) => (
        <option key={p.id} value={p.id}>
          {p.entityName ?? `${COUNTRY_NAMES[p.countryCode] ?? p.countryCode} — ${p.accountName}`} (
          {COUNTRY_NAMES[p.countryCode] ?? p.countryCode})
        </option>
      ))}
    </select>
  );
}
