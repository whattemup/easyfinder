import {
  Listing,
  ScoreBreakdown,
  ScoringConfig,
  WatchlistItem,
} from "@easyfinderai/shared";
import { requireApiBaseUrl } from "../env";
import { clearStoredSession, getStoredAuthToken } from "./auth";
import { Billing } from "./billing";

type ApiEnvelope<T> = {
  data?: T;
  error?: { code: string; message: string; details?: unknown };
  requestId?: string;
};

export type ListingWithScore = Listing & {
  totalScore: number;
  scoreV2?: ScoreBreakdown["scoreV2"];
  confidenceScore?: number;
  reasons?: ScoreBreakdown["reasons"];
  flags?: string[];
  bestOptionEligible?: boolean;
  score: ScoreBreakdown;
};

export type NdaStatus = {
  accepted: boolean;
  acceptedAt?: string;
  ndaVersion?: string;
};


export type InquiryDto = {
  id: string;
  listingId: string;
  listingTitle?: string | null;
  buyerId?: string;
  buyerName?: string;
  buyerEmail?: string;
  message?: string;
  messagePreview?: string;
  status: "new" | "reviewing" | "contacted" | "closed" | "open" | "spam";
  createdAt: string;
};

export type InquiryThreadMessage = {
  id: string;
  senderRole: "buyer" | "seller";
  body: string;
  createdAt: string;
};

export type SellerInquiryThread = {
  id: string;
  listingId: string;
  listingTitle: string | null;
  buyerId: string;
  status: string;
  createdAt: string;
  messages: InquiryThreadMessage[];
};

export type SellerInquiriesResponse = InquiryDto[];

export type MeResponse = {
  id: string;
  email: string;
  name: string;
  role: "demo" | "buyer" | "seller" | "enterprise" | "admin" | null;
  ndaAccepted: boolean;
  ndaAcceptedAt: string | null;
  billing?: Billing;
};

export class ApiError extends Error {
  requestId?: string;
  status?: number;
  code?: string;
  retryAfter?: number;
  details?: unknown;
  url?: string;
  method?: string;

  constructor(
    message: string,
    requestId?: string,
    status?: number,
    code?: string,
    retryAfter?: number,
    details?: unknown,
    url?: string,
    method?: string
  ) {
    super(message);
    this.name = "ApiError";
    this.requestId = requestId;
    this.status = status;
    this.code = code;
    this.retryAfter = retryAfter;
    this.details = details;
    this.url = url;
    this.method = method;
  }
}

/**
 * Normalizes API paths so callers can pass either:
 * - "/auth/login"
 * - "/api/auth/login"
 * without producing ".../api/api/..."
 */
function normalizeApiPath(path: string) {
  let p = path.trim();

  // Ensure leading slash
  if (!p.startsWith("/")) p = `/${p}`;
  if (p === "/") return "";

  return p;
}

function baseHasApiPrefix(baseUrl: string) {
  const normalizedBase = baseUrl.trim().replace(/\/+$/, "");
  if (!normalizedBase) {
    return false;
  }

  if (normalizedBase === "/api" || normalizedBase.startsWith("/api?")) {
    return true;
  }

  if (normalizedBase.startsWith("/")) {
    return normalizedBase === "/api" || normalizedBase.startsWith("/api/");
  }

  if (normalizedBase.endsWith("/api")) {
    return true;
  }

  let hasApiPrefix = false;
  try {
    const parsed = new URL(baseUrl);
    const normalizedPathname = parsed.pathname.replace(/\/+$/, "");
    hasApiPrefix = normalizedPathname === "/api";
  } catch {
    hasApiPrefix = false;
  }
  return hasApiPrefix;
}

export function buildApiUrl(path: string, baseUrl = requireApiBaseUrl()) {
  const base = baseUrl.replace(/\/+$/, "");
  const hasApiPrefix = baseHasApiPrefix(baseUrl);
  let normalizedPath = normalizeApiPath(path);

  if (import.meta.env.DEV && hasApiPrefix && normalizedPath.startsWith("/api/")) {
    console.warn(
      "[api] base URL already includes /api; stripping duplicate /api from path."
    );
  }

  if (hasApiPrefix) {
    if (normalizedPath === "/api") {
      normalizedPath = "";
    } else if (normalizedPath.startsWith("/api/")) {
      normalizedPath = normalizedPath.slice("/api".length);
    }
    return normalizedPath ? `${base}${normalizedPath}` : base;
  }

  if (normalizedPath === "") {
    return `${base}/api`;
  }
  if (!normalizedPath.startsWith("/api/")) {
    normalizedPath = `/api${normalizedPath}`;
  }

  return `${base}${normalizedPath}`;
}

type ApiRequestOptions = RequestInit & {
  timeoutMs?: number;
};

const apiRequest = async <T>(
  path: string,
  options: ApiRequestOptions = {}
): Promise<T> => {
  const baseUrl = requireApiBaseUrl();
  const token = getStoredAuthToken();
  const { timeoutMs, signal, ...fetchOptions } = options;

  const headers = new Headers(fetchOptions.headers ?? {});
  if (!(fetchOptions.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const url = buildApiUrl(path, baseUrl);
  const method = (fetchOptions.method ?? "GET").toUpperCase();
  const controller = new AbortController();
  if (signal) {
    signal.addEventListener("abort", () => controller.abort(), { once: true });
  }
  const timeoutId =
    typeof timeoutMs === "number" && timeoutMs > 0
      ? setTimeout(() => controller.abort(), timeoutMs)
      : null;

  let res: Response;
  try {
    res = await fetch(url, {
      ...fetchOptions,
      headers,
      signal: controller.signal,
    });
  } catch (error) {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new ApiError("Request timed out. Please try again.", undefined, undefined, undefined, undefined, undefined, url, method);
    }
    throw error;
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }

  let payload: ApiEnvelope<T> | null = null;
  try {
    payload = (await res.json()) as ApiEnvelope<T>;
  } catch {
    payload = null;
  }

  if (res.status === 401) {
    clearStoredSession();
    if (typeof window !== "undefined") {
      const path = window.location.pathname;
      const isAuthRoute =
        path.startsWith("/login") ||
        path.startsWith("/register") ||
        path.startsWith("/app/login") ||
        path.startsWith("/app/register");
      if (!isAuthRoute) {
        window.location.assign("/login");
      }
    }
  }

  if (!res.ok) {
    const message =
      payload?.error?.message ??
      `Request failed (${res.status}${res.statusText ? ` ${res.statusText}` : ""}) for ${url}`;
    const retryAfterHeader = res.headers.get("retry-after");
    const retryAfter = retryAfterHeader ? Number.parseInt(retryAfterHeader, 10) : undefined;
    const details = payload?.error?.details ?? payload ?? { statusText: res.statusText };
    throw new ApiError(
      message,
      payload?.requestId,
      res.status,
      payload?.error?.code,
      Number.isFinite(retryAfter) ? retryAfter : undefined,
      details,
      url,
      method
    );
  }

  if (!payload || payload.data === undefined) {
    throw new ApiError(
      "Malformed response from server.",
      payload?.requestId,
      res.status,
      undefined,
      undefined,
      undefined,
      url,
      method
    );
  }

  return payload.data;
};

export const getRequestId = (error: unknown) =>
  error instanceof ApiError ? error.requestId : undefined;

export type ListingFilters = {
  state?: string;
  maxHours?: number;
  maxPrice?: number;
  operable?: boolean;
};

export type HealthResponse = {
  ok: boolean;
  demoMode: boolean;
  billingEnabled: boolean;
};

const buildHealthUrl = (baseUrl = requireApiBaseUrl()) => {
  try {
    const url = new URL(baseUrl);
    const withoutTrailingSlash = url.pathname.replace(/\/+$/, "");
    if (withoutTrailingSlash === "/api") {
      url.pathname = "/health";
    } else {
      url.pathname = `${withoutTrailingSlash || ""}/health`;
    }
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    const normalized = baseUrl.replace(/\/+$/, "");
    if (normalized.endsWith("/api")) {
      return `${normalized.slice(0, -4)}/health`;
    }
    return `${normalized}/health`;
  }
};

export const getHealth = async (): Promise<HealthResponse> => {
  const res = await fetch(buildHealthUrl(), {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    throw new ApiError("Unable to load backend health.", undefined, res.status);
  }

  const payload = (await res.json()) as HealthResponse;
  return payload;
};

export const getListings = (filters: ListingFilters) => {
  const params = new URLSearchParams();
  if (filters.state) params.set("state", filters.state);
  if (filters.maxHours) params.set("maxHours", String(filters.maxHours));
  if (filters.maxPrice) params.set("maxPrice", String(filters.maxPrice));
  if (filters.operable) params.set("operable", "true");
  const query = params.toString();
  return apiRequest<ListingWithScore[]>(
    `/listings${query ? `?${query}` : ""}`
  );
};

export const getListing = (id: string) =>
  apiRequest<ListingWithScore>(`/listings/${id}`);

export const getScoringConfig = () =>
  apiRequest<{ config: ScoringConfig }>("/scoring-configs");

export const getWatchlist = () =>
  apiRequest<{ items: WatchlistItem[] }>("/watchlist");

export const addToWatchlist = (listingId: string) =>
  apiRequest<{ item: WatchlistItem }>(`/watchlist/${listingId}`, {
    method: "POST",
  });

export const removeFromWatchlist = (listingId: string) =>
  apiRequest<{ removed: boolean }>(`/watchlist/${listingId}`, {
    method: "DELETE",
  });

export const getNdaStatus = () =>
  apiFetch<NdaStatus>("/nda/status", { timeoutMs: 10000 });

export const acceptNda = () =>
  apiFetch<NdaStatus>("/nda/accept", {
    method: "POST",
    body: JSON.stringify({ accepted: true }),
    timeoutMs: 10000,
  });

export const getMe = () => apiRequest<MeResponse>("/me");

export const createCheckoutSession = (plan: "pro" | "enterprise") =>
  apiRequest<{ url: string }>("/billing/create-checkout-session", {
    method: "POST",
    body: JSON.stringify({ plan }),
  });

export const activateProPromo = () =>
  apiRequest<{ success: boolean }>("/billing/activate-pro-promo", {
    method: "POST",
    body: JSON.stringify({}),
  });


export const importSellerListings = (rows: unknown[]) =>
  apiRequest<{ created: number; failed: number; errors: Array<{ row: number; field?: string; code: string; message: string }> }>(
    "/seller/listings/import",
    {
      method: "POST",
      body: JSON.stringify({ rows }),
    }
  );

export type SellerListingCreateResponse = {
  id: string;
  [key: string]: unknown;
};

export const createSellerListing = (payload: unknown) =>
  apiRequest<SellerListingCreateResponse>("/seller/listings", { method: "POST", body: JSON.stringify(payload) });


export type SellerListingPayload = {
  title: string;
  description: string;
  location: string;
  condition?: string;
  price?: number | null;
  hours?: number | null;
  year?: number;
  make?: string;
  model?: string;
  category?: string;
  images?: string[];
};

export const getSellerListing = (id: string) => apiRequest<SellerListingCreateResponse>(`/seller/listings/${id}`);

export const updateSellerListing = (id: string, payload: Partial<SellerListingPayload>) =>
  apiRequest<SellerListingCreateResponse>(`/seller/listings/${id}`, { method: "PUT", body: JSON.stringify(payload) });

export const uploadListingImage = async (file: File) => {
  const token = getStoredAuthToken();
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(buildApiUrl("/uploads/images"), {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: formData,
  });

  const payload = (await res.json()) as ApiEnvelope<{ id: string; url: string }>;
  if (!res.ok || !payload.data) {
    throw new ApiError(payload.error?.message ?? "Upload failed.", payload.requestId, res.status, payload.error?.code, undefined, payload.error?.details);
  }

  return payload.data;
};

export async function uploadSellerImages(files: File[]): Promise<string[]> {
  if (files.length === 0) {
    return [];
  }

  const token = getStoredAuthToken();
  const formData = new FormData();
  for (const file of files) {
    formData.append("images", file);
  }

  const res = await fetch(buildApiUrl("/seller/images"), {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: formData,
  });

  const payload = (await res.json()) as ApiEnvelope<string[] | { urls?: string[]; images?: string[] }>;
  const urls = Array.isArray(payload?.data)
    ? payload.data
    : Array.isArray(payload?.data?.urls)
      ? payload.data.urls
      : Array.isArray(payload?.data?.images)
        ? payload.data.images
        : null;

  if (!res.ok || !urls) {
    throw new ApiError(
      payload?.error?.message ?? "Upload failed.",
      payload?.requestId,
      res.status,
      payload?.error?.code,
      undefined,
      payload?.error?.details
    );
  }

  return urls;
}



export type SellerZipValidationResponse = {
  rowsDetected: number;
  validRows: number;
  invalidRows: number;
  totalValidationErrors: number;
  topErrors: string[];
};

export const validateSellerZipBundle = (bundleZip: File) => {
  const body = new FormData();
  body.append("zip", bundleZip);
  return apiRequest<SellerZipValidationResponse>("/seller/upload/validate-zip", {
    method: "POST",
    body,
  });
};

export const uploadSellerZipBundle = (bundleZip: File) => {
  const body = new FormData();
  body.append("zip", bundleZip);
  return apiRequest<{
    created: number;
    failed: number;
    errors: Array<{ row: number; field?: string; code: string; message: string }>;
  }>("/seller/upload/upload-zip", {
    method: "POST",
    body,
  });
};

export const uploadSellerCsv = importSellerListings;
export const createInquiry = (input: { listingId: string; message: string }) =>
  apiFetch<InquiryDto>("/inquiries", {
    method: "POST",
    body: JSON.stringify(input),
  });

// Legacy helper for internal usage
export const apiFetch = <T>(path: string, options: ApiRequestOptions = {}) =>
  apiRequest<T>(path, options);

export const getSellerInquiryThread = (id: string) => apiFetch<SellerInquiryThread>(`/seller/inquiries/${id}`);

export const sendSellerInquiryMessage = (id: string, input: { body: string }) =>
  apiFetch<{ id: string; messages: InquiryThreadMessage[] }>(`/seller/inquiries/${id}/messages`, {
    method: "POST",
    body: JSON.stringify(input),
  });


export type AdminOverview = {
  counts: { users: number; listings: number; inquiries: number };
  listings: { active: number; paused: number; removed: number; pending_review: number };
  inquiries: { open: number; closed: number };
  recentActivity: Array<{ timestamp: string; userId: string; event: string; requestId: string; resource: string }>;
  lastIngestion: Record<string, string | null>;
  demoMode: boolean;
  billingEnabled: boolean;
};

export type AdminUser = {
  id: string;
  email: string;
  name: string;
  role: "buyer" | "seller" | "enterprise" | "admin" | null;
  plan: string;
  created: string | null;
  lastLogin: string | null;
  status: "active" | "disabled";
};

export type AdminUsersResponse = {
  items: AdminUser[];
  total: number;
};

export type AdminListingsResponse = {
  items: Array<{
    id: string;
    title: string;
    seller: string | null;
    source: string | null;
    score: number | null;
    state: string | null;
    created: string | null;
    status: "active" | "paused" | "removed" | "pending_review";
    imagesCount: number;
    isPublished: boolean;
    price: number;
  }>;
  total: number;
  page: number;
  pageSize: number;
};


export type AdminListingDetail = {
  listing: Listing & { status?: "active" | "paused" | "removed" | "pending_review" };
  inquiries: Array<InquiryDto & { id: string; sellerId: string | null; buyerId: string; updatedAt: string }>;
  audit: Array<{ id: string; actorUserId: string; actorEmail: string; action: string; targetType: string; targetId: string; reason?: string; requestId: string; createdAt: string }>;
};

export type AdminInquiriesResponse = {
  items: Array<{ id: string; listingId: string; buyerId: string; sellerId: string | null; createdAt: string; status: string }>;
  total: number;
  page: number;
  pageSize: number;
};

export type AdminAuditResponse = {
  items: Array<{ timestamp: string; userId: string; event: string; requestId: string; resource: string }>;
  total: number;
  page: number;
  pageSize: number;
};

export const getAdminOverview = () => apiRequest<AdminOverview>("/admin/overview");

export const getAdminListings = (params: {
  q?: string;
  status?: "active" | "paused" | "removed" | "pending_review";
  source?: string;
  page?: number;
  pageSize?: number;
}) => {
  const search = new URLSearchParams();
  if (params.q) search.set("q", params.q);
  if (params.status) search.set("status", params.status);
  if (params.source) search.set("source", params.source);
  if (params.page) search.set("page", String(params.page));
  if (params.pageSize) search.set("pageSize", String(params.pageSize));
  const query = search.toString();
  return apiRequest<AdminListingsResponse>(`/admin/listings${query ? `?${query}` : ""}`);
};

export const patchAdminListing = (
  id: string,
  input: { status?: "active" | "paused" | "removed"; isPublished?: boolean; title?: string; price?: number; state?: string; reason?: string }
) => apiRequest<{ listing: Listing }>(`/admin/listings/${id}`, { method: "PATCH", body: JSON.stringify(input) });

export const getAdminListingDetail = (id: string) => apiRequest<AdminListingDetail>(`/admin/listings/${id}`);

export const deleteAdminListing = (
  id: string,
  input: { confirmation: string; reason: string }
) => apiRequest<{ deleted: boolean }>(`/admin/listings/${id}`, { method: "DELETE", body: JSON.stringify(input) });

export const runAdminIronPlanetScrape = (input: { url: string }) =>
  apiRequest<{ scraped: number; upserted: number; modified: number; matched: number }>("/admin/scrape/ironplanet", {
    method: "POST",
    body: JSON.stringify(input),
  });

export const getAdminInquiries = (params: { page?: number; pageSize?: number; status?: "open" | "closed" | "spam" }) => {
  const search = new URLSearchParams();
  if (params.page) search.set("page", String(params.page));
  if (params.pageSize) search.set("pageSize", String(params.pageSize));
  if (params.status) search.set("status", params.status);
  const query = search.toString();
  return apiRequest<AdminInquiriesResponse>(`/admin/inquiries${query ? `?${query}` : ""}`);
};

export const getAdminUsers = (params: { q?: string } = {}) => {
  const search = new URLSearchParams();
  if (params.q) search.set("q", params.q);
  const query = search.toString();
  return apiRequest<AdminUsersResponse>(`/admin/users${query ? `?${query}` : ""}`);
};

export const patchAdminUser = (
  id: string,
  input: { role?: "buyer" | "seller" | "enterprise" | "admin"; disabled?: boolean }
) => apiRequest<{ user: MeResponse }>(`/admin/users/${id}`, { method: "PATCH", body: JSON.stringify(input) });

export const patchAdminInquiry = (id: string, input: { status: "open" | "closed" | "spam" }) =>
  apiRequest<{ inquiry: InquiryDto }>(`/admin/inquiries/${id}`, { method: "PATCH", body: JSON.stringify(input) });

export const getAdminAuditLogs = (params: { event?: string; userId?: string; resource?: string; action?: string; targetId?: string; page?: number; pageSize?: number }) => {
  const search = new URLSearchParams();
  if (params.event ?? params.action) search.set("event", params.event ?? params.action as string);
  if (params.userId) search.set("userId", params.userId);
  if (params.resource ?? params.targetId) search.set("resource", params.resource ?? params.targetId as string);
  if (params.page) search.set("page", String(params.page));
  if (params.pageSize) search.set("pageSize", String(params.pageSize));
  const query = search.toString();
  return apiRequest<AdminAuditResponse>(`/admin/audit${query ? `?${query}` : ""}`);
};

export type DealInput = {
  listing_id: string;
  asking_price: number;
  category?: string;
  hours?: number;
  condition?: string;
  operable?: boolean;
  distance_miles?: number;
  is_auction?: boolean;
  market_p50?: number;
  market_p90?: number;
};

export type DealResult = {
  decision: "BUY" | "NEGOTIATE" | "WALK";
  asking_price: number;
  fair_value: number;
  roi_at_ask: number;
  final_offer: number | null;
  final_roi: number | null;
  confidence: number;
  costs: {
    asking_price: number;
    auction_premium: number;
    transport_cost: number;
    repair_estimate: number;
    wear_penalty: number;
    total_acquisition: number;
  };
  negotiation: Array<{
    round_number: number;
    counter_price: number;
    achieved_roi: number;
    accept: boolean;
  }>;
  rationale: string[];
  flags: string[];
  version: string;
};

export const evaluateDeal = (input: DealInput) =>
  apiRequest<DealResult>("/deal/evaluate", {
    method: "POST",
    body: JSON.stringify(input),
  });
