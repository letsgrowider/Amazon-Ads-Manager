import { prisma } from "@/lib/db";
import { refreshAccessToken } from "@/lib/amazon-ads";
import type { AmazonAccount } from "@/app/generated/prisma/client";

const REFRESH_MARGIN_MS = 5 * 60 * 1000;

async function doRefresh(account: AmazonAccount): Promise<string> {
  const tokens = await refreshAccessToken(account.refreshToken);
  const tokenExpiresAt = new Date(Date.now() + tokens.expires_in * 1000);

  await prisma.amazonAccount.update({
    where: { id: account.id },
    data: { accessToken: tokens.access_token, tokenExpiresAt },
  });

  return tokens.access_token;
}

// Returns a usable access token for this account, refreshing via LWA (and
// persisting the new token) if the current one is at or near expiry.
export async function getValidAccessToken(account: AmazonAccount): Promise<string> {
  if (account.tokenExpiresAt.getTime() - Date.now() > REFRESH_MARGIN_MS) {
    return account.accessToken;
  }
  return doRefresh(account);
}

// Unconditional refresh, for when a request already came back 401 mid-flight
// (e.g. a report poll spanning close to the token's ~1hr lifetime) — the
// expiry-margin check above isn't reliable at that point.
export async function forceRefreshAccessToken(accountId: string): Promise<string> {
  const account = await prisma.amazonAccount.findUniqueOrThrow({ where: { id: accountId } });
  return doRefresh(account);
}
