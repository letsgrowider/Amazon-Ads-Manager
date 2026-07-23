// Amazon Advertising API client: LWA OAuth + region-aware fetch wrapper.
// Docs: https://advertising.amazon.com/API/docs/en-us/setting-up/overview

export type AmazonRegion = "NA" | "EU" | "FE";

const LWA_AUTHORIZE_URL = "https://www.amazon.com/ap/oa";
const LWA_TOKEN_URL = "https://api.amazon.com/auth/o2/token";

// Ads API is region-scoped: each region has its own base URL and requires
// its own LWA-authorized access token (same client id/secret, different
// authorization per marketplace group).
const ADS_API_BASE_URL: Record<AmazonRegion, string> = {
  NA: "https://advertising-api.amazon.com",
  EU: "https://advertising-api-eu.amazon.com",
  FE: "https://advertising-api-fe.amazon.com",
};

const SCOPE = "advertising::campaign_management";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

// A sync run can span hours (structure sync + long report polls); over that
// span, transient DNS/network blips (observed live: "getaddrinfo ENOTFOUND")
// have repeatedly killed whole report steps outright. Retry a few times
// before giving up — this only covers fetch() itself throwing (a network-
// layer failure), not HTTP error statuses, which the caller already handles.
export async function fetchWithRetry(url: string, init: RequestInit, attempts = 3): Promise<Response> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fetch(url, init);
    } catch (err) {
      if (attempt >= attempts) throw err;
      await new Promise((resolve) => setTimeout(resolve, attempt * 2000));
    }
  }
}

export function getAuthorizeUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: requireEnv("AMAZON_CLIENT_ID"),
    scope: SCOPE,
    response_type: "code",
    redirect_uri: requireEnv("AMAZON_REDIRECT_URI"),
    state,
  });
  return `${LWA_AUTHORIZE_URL}?${params.toString()}`;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}

export async function exchangeCodeForTokens(code: string): Promise<TokenResponse> {
  const res = await fetch(LWA_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: requireEnv("AMAZON_REDIRECT_URI"),
      client_id: requireEnv("AMAZON_CLIENT_ID"),
      client_secret: requireEnv("AMAZON_CLIENT_SECRET"),
    }),
  });
  if (!res.ok) {
    throw new Error(`LWA token exchange failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

export async function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  const res = await fetch(LWA_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: requireEnv("AMAZON_CLIENT_ID"),
      client_secret: requireEnv("AMAZON_CLIENT_SECRET"),
    }),
  });
  if (!res.ok) {
    throw new Error(`LWA token refresh failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

export interface AdsProfile {
  profileId: number;
  countryCode: string;
  currencyCode: string;
  // Real /v2/profiles responses nest this under accountInfo, not top-level
  // — verified against an actual API response (see reference memory).
  accountInfo: {
    marketplaceStringId: string;
    id: string;
    type: string;
    name: string;
  };
}

export interface AdsCampaign {
  campaignId: string;
  name: string;
  state: string;
  targetingType: string;
  budget: { budget: number };
  startDate: string; // YYYY-MM-DD
  dynamicBidding?: {
    strategy?: string;
    placementBidding?: { placement: string; percentage: number }[];
  };
}

export interface PlacementBiddingInput {
  placement: string; // "PLACEMENT_TOP" | "PLACEMENT_PRODUCT_PAGE" | "PLACEMENT_REST_OF_SEARCH"
  percentage: number;
}

// Per Amazon's generated SDK models (SponsoredProductsUpdateCampaign),
// campaignId/name/targetingType/state/budget/startDate have no "optional"
// annotation and are required — send them all back (using existing DB
// values for anything not being changed) rather than a partial patch.
// dynamicBidding is the one field explicitly documented as optional for
// both create and update, despite the generator's non-nullable PHP type.
export interface UpdateCampaignInput {
  campaignId: string;
  name: string;
  targetingType: string; // "MANUAL" | "AUTO"
  state: string; // "ENABLED" | "PAUSED" | "ARCHIVED"
  budget: { budget: number; budgetType: "DAILY" };
  startDate: string; // YYYY-MM-DD, echo back the existing value — required field, but changing it is not the intent of any current write path
  dynamicBidding?: {
    strategy: string; // "LEGACY_FOR_SALES" | "AUTO_FOR_SALES"
    placementBidding: PlacementBiddingInput[];
  };
}

export interface AdsAdGroup {
  adGroupId: string;
  campaignId: string;
  name: string;
  state: string;
  defaultBid: number;
}

export interface AdsKeyword {
  keywordId: string;
  adGroupId: string;
  campaignId: string;
  keywordText: string;
  matchType: string;
  state: string;
  bid: number;
}

export interface CreateReportRequest {
  name: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  configuration: {
    adProduct: "SPONSORED_PRODUCTS";
    groupBy: string[];
    columns: string[];
    reportTypeId: string;
    timeUnit: "SUMMARY" | "DAILY";
    format: "GZIP_JSON";
    filters?: { field: string; values: string[] }[];
  };
}

export interface ReportStatus {
  reportId: string;
  // Verified against a real API response (2026-07): PENDING is a real status
  // seen live; IN_PROGRESS is assumed to exist but unconfirmed.
  status: "PENDING" | "IN_PROGRESS" | "COMPLETED" | "FAILED";
  // Verified field name (not "statusDetails" as originally guessed).
  failureReason?: string | null;
  // Verified: real responses use "url" (not "location" — that guess was wrong).
  url?: string | null;
  location?: string | null;
  fileSize?: number | null;
}

// Amazon's v3 list endpoints (campaigns/adGroups/keywords) use a resource-
// specific vendor media type for both Accept and Content-Type, and paginate
// via a nextToken in the response.
const MEDIA_TYPE = {
  campaign: "application/vnd.spCampaign.v3+json",
  adGroup: "application/vnd.spAdGroup.v3+json",
  keyword: "application/vnd.spKeyword.v3+json",
  negativeKeyword: "application/vnd.spNegativeKeyword.v3+json",
  createReport: "application/vnd.createasyncreportrequest.v3+json",
  sbCampaign: "application/vnd.sbcampaignresource.v4+json",
  target: "application/vnd.spTargetingClause.v3+json",
} as const;

// Product/category/auto targeting — verified against Amazon's own
// ads-advanced-tools-docs Postman examples for /sp/targets/list. `bid` is
// absent on some AUTO rows in Amazon's own sample responses (ad-group
// default bid applies instead), hence optional here.
export interface AdsTargetExpression {
  type: string; // e.g. ASIN_SAME_AS, ASIN_CATEGORY_SAME_AS, QUERY_HIGH_REL_MATCHES (close-match), QUERY_BROAD_REL_MATCHES, ASIN_ACCESSORY_RELATED, ASIN_SUBSTITUTE_RELATED
  value?: string;
}

export interface AdsTarget {
  targetId: string;
  campaignId: string;
  adGroupId: string;
  expressionType: string; // AUTO | MANUAL
  expression: AdsTargetExpression[];
  resolvedExpression: AdsTargetExpression[];
  state: string;
  bid?: number;
}

// Sponsored Brands campaign shape — verified against Amazon's own
// ads-advanced-tools-docs Postman collection sample responses for
// POST /sb/v4/campaigns/list. Notably no targetingType (that's an SP-only
// concept) and budget is a bare number, not the {budget} wrapper SP uses.
export interface SbCampaign {
  campaignId: string;
  name: string;
  state: string;
  budget: number;
  budgetType: string; // "DAILY" | "LIFETIME"
  startDate: string; // YYYY-MM-DD
}

export interface CreateKeywordInput {
  campaignId: string;
  adGroupId: string;
  keywordText: string;
  matchType: "EXACT" | "PHRASE" | "BROAD";
  bid: number;
}

export interface CreateNegativeKeywordInput {
  campaignId: string;
  adGroupId: string;
  keywordText: string;
  matchType: "NEGATIVE_EXACT" | "NEGATIVE_PHRASE";
}

// Verified against Amazon's own Postman collection examples: bulk-create
// endpoints return { <resource>: { error: [...], success: [{ index, ...Id }] } }
// — per-item results keyed by the input array's index, not one all-or-nothing
// response.
interface BulkCreateResponse {
  error: { index: number; errors?: { errorType?: string; errorValue?: unknown }[] }[];
  success: { index: number }[];
}

// Thin wrapper around the Ads API. Every request needs a valid access token
// plus the Amazon-Advertising-API-ClientId header; profile-scoped endpoints
// also need Amazon-Advertising-API-Scope (the profileId).
export class AmazonAdsClient {
  private accessToken: string;

  constructor(
    private readonly region: AmazonRegion,
    accessToken: string,
    private readonly profileId?: string,
    // Access tokens live ~1hr, but a single report poll can itself run up to
    // an hour (see pollReport) — pass a refresher so a 401 mid-poll can be
    // recovered from instead of failing that report entirely.
    private readonly onTokenExpired?: () => Promise<string>
  ) {
    this.accessToken = accessToken;
  }

  private async request<T>(path: string, init: RequestInit = {}, retriedAfter401 = false): Promise<T> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.accessToken}`,
      "Amazon-Advertising-API-ClientId": requireEnv("AMAZON_CLIENT_ID"),
      "Content-Type": "application/json",
      ...(init.headers as Record<string, string> | undefined),
    };
    if (this.profileId) {
      headers["Amazon-Advertising-API-Scope"] = this.profileId;
    }

    const res = await fetchWithRetry(`${ADS_API_BASE_URL[this.region]}${path}`, {
      ...init,
      headers,
    });
    if (res.status === 401 && this.onTokenExpired && !retriedAfter401) {
      this.accessToken = await this.onTokenExpired();
      return this.request<T>(path, init, true);
    }
    if (res.status === 425 && path.startsWith("/reporting/reports")) {
      // Amazon dedupes report requests by account/date/config, not by name —
      // asking for a report that's already in flight returns 425 with the
      // existing reportId in the detail string, not a fresh reportId. Reuse
      // it (verified against a real 425 response) instead of failing the sync.
      const body = await res.json().catch(() => null);
      const existingId = typeof body?.detail === "string" ? body.detail.match(/duplicate of\s*:\s*(\S+)/i)?.[1] : undefined;
      if (existingId) {
        return { reportId: existingId, status: "PENDING" } as T;
      }
    }
    if (!res.ok) {
      throw new Error(`Ads API request failed: ${init.method ?? "GET"} ${path} -> ${res.status} ${await res.text()}`);
    }
    return res.json();
  }

  // Profiles are account-level, not profile-scoped, so no Scope header needed.
  listProfiles() {
    return this.request<AdsProfile[]>("/v2/profiles");
  }

  async listCampaigns(): Promise<AdsCampaign[]> {
    const results: AdsCampaign[] = [];
    let nextToken: string | undefined;
    do {
      const page = await this.request<{ campaigns: AdsCampaign[]; nextToken?: string }>("/sp/campaigns/list", {
        method: "POST",
        headers: { Accept: MEDIA_TYPE.campaign, "Content-Type": MEDIA_TYPE.campaign },
        body: JSON.stringify(nextToken ? { nextToken } : {}),
      });
      results.push(...page.campaigns);
      nextToken = page.nextToken;
    } while (nextToken);
    return results;
  }

  async listSbCampaigns(): Promise<SbCampaign[]> {
    const results: SbCampaign[] = [];
    let nextToken: string | undefined;
    do {
      const page = await this.request<{ campaigns: SbCampaign[]; nextToken?: string }>("/sb/v4/campaigns/list", {
        method: "POST",
        headers: { Accept: MEDIA_TYPE.sbCampaign, "Content-Type": MEDIA_TYPE.sbCampaign },
        body: JSON.stringify(nextToken ? { nextToken } : {}),
      });
      results.push(...page.campaigns);
      nextToken = page.nextToken;
    } while (nextToken);
    return results;
  }

  async listAdGroups(): Promise<AdsAdGroup[]> {
    const results: AdsAdGroup[] = [];
    let nextToken: string | undefined;
    do {
      const page = await this.request<{ adGroups: AdsAdGroup[]; nextToken?: string }>("/sp/adGroups/list", {
        method: "POST",
        headers: { Accept: MEDIA_TYPE.adGroup, "Content-Type": MEDIA_TYPE.adGroup },
        body: JSON.stringify(nextToken ? { nextToken } : {}),
      });
      results.push(...page.adGroups);
      nextToken = page.nextToken;
    } while (nextToken);
    return results;
  }

  async listKeywords(): Promise<AdsKeyword[]> {
    const results: AdsKeyword[] = [];
    let nextToken: string | undefined;
    do {
      const page = await this.request<{ keywords: AdsKeyword[]; nextToken?: string }>("/sp/keywords/list", {
        method: "POST",
        headers: { Accept: MEDIA_TYPE.keyword, "Content-Type": MEDIA_TYPE.keyword },
        body: JSON.stringify(nextToken ? { nextToken } : {}),
      });
      results.push(...page.keywords);
      nextToken = page.nextToken;
    } while (nextToken);
    return results;
  }

  // Bulk bid update (v3, same media-type family as the list endpoints —
  // keyword IDs here must be the v3 string IDs from listKeywords(), not
  // the numeric IDs from the legacy v2 API).
  async updateKeywordBids(updates: { keywordId: string; bid: number }[]): Promise<void> {
    await this.request("/sp/keywords", {
      method: "PUT",
      headers: { Accept: MEDIA_TYPE.keyword, "Content-Type": MEDIA_TYPE.keyword },
      body: JSON.stringify({ keywords: updates }),
    });
  }

  async listTargets(): Promise<AdsTarget[]> {
    const results: AdsTarget[] = [];
    let nextToken: string | undefined;
    do {
      const page = await this.request<{ targetingClauses: AdsTarget[]; nextToken?: string }>("/sp/targets/list", {
        method: "POST",
        headers: { Accept: MEDIA_TYPE.target, "Content-Type": MEDIA_TYPE.target },
        body: JSON.stringify(nextToken ? { nextToken } : {}),
      });
      results.push(...page.targetingClauses);
      nextToken = page.nextToken;
    } while (nextToken);
    return results;
  }

  // Verified request shape: {targetingClauses: [{targetId, bid}]}, same
  // wrapper key the list response uses (not "targets").
  async updateTargetBids(updates: { targetId: string; bid: number }[]): Promise<void> {
    await this.request("/sp/targets", {
      method: "PUT",
      headers: { Accept: MEDIA_TYPE.target, "Content-Type": MEDIA_TYPE.target },
      body: JSON.stringify({ targetingClauses: updates }),
    });
  }

  // Pushes locally-queued keyword-harvest suggestions live. Verified request
  // shape against Amazon's own Postman examples (state must be sent
  // explicitly — no default). Returns the raw per-item result so the caller
  // can tell which specific suggestion succeeded vs failed in a batch.
  async createKeywords(keywords: CreateKeywordInput[]): Promise<{ keywords: BulkCreateResponse }> {
    return this.request("/sp/keywords", {
      method: "POST",
      headers: { Accept: MEDIA_TYPE.keyword, "Content-Type": MEDIA_TYPE.keyword },
      body: JSON.stringify({ keywords: keywords.map((k) => ({ ...k, state: "ENABLED" })) }),
    });
  }

  // Pushes locally-queued negative-keyword suggestions live. Negative
  // keywords are a distinct resource from positive keywords in the v3 API
  // (different endpoint + media type), and — unlike positive keywords —
  // creation requires campaignId in the same request, not just adGroupId.
  async createNegativeKeywords(
    negatives: CreateNegativeKeywordInput[]
  ): Promise<{ negativeKeywords: BulkCreateResponse }> {
    return this.request("/sp/negativeKeywords", {
      method: "POST",
      headers: { Accept: MEDIA_TYPE.negativeKeyword, "Content-Type": MEDIA_TYPE.negativeKeyword },
      body: JSON.stringify({ negativeKeywords: negatives.map((n) => ({ ...n, state: "ENABLED" })) }),
    });
  }

  // Bulk campaign update (state pause/enable, budget). See UpdateCampaignInput
  // doc comment — sends full required field set, not a sparse patch.
  async updateCampaigns(updates: UpdateCampaignInput[]): Promise<void> {
    await this.request("/sp/campaigns", {
      method: "PUT",
      headers: { Accept: MEDIA_TYPE.campaign, "Content-Type": MEDIA_TYPE.campaign },
      body: JSON.stringify({ campaigns: updates }),
    });
  }

  // Bulk ad group update (default bid, state). Verified against Amazon's
  // generated PHP SDK (SponsoredProductsUpdateAdGroup): adGroupId/name/state/
  // defaultBid are all required — full replace, not a sparse patch.
  async updateAdGroups(updates: { adGroupId: string; name: string; state: string; defaultBid: number }[]): Promise<void> {
    await this.request("/sp/adGroups", {
      method: "PUT",
      headers: { Accept: MEDIA_TYPE.adGroup, "Content-Type": MEDIA_TYPE.adGroup },
      body: JSON.stringify({ adGroups: updates }),
    });
  }

  createReport(body: CreateReportRequest) {
    return this.request<{ reportId: string; status: string }>("/reporting/reports", {
      method: "POST",
      headers: { Accept: MEDIA_TYPE.createReport, "Content-Type": MEDIA_TYPE.createReport },
      body: JSON.stringify(body),
    });
  }

  getReport(reportId: string) {
    return this.request<ReportStatus>(`/reporting/reports/${reportId}`);
  }
}
