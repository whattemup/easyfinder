import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { formatListingHours, formatListingPrice, toPlainText } from "../../lib/formatters";
import { Input } from "../../components/ui/input";
import { Badge } from "../../components/ui/badge";
import {
  ListingWithScore,
  addToWatchlist,
  removeFromWatchlist,
  getListings,
  getMe,
  getRequestId,
  getWatchlist,
} from "../../lib/api";
import { WatchlistItem } from "@easyfinderai/shared";
import { useAuth } from "../../lib/auth";
import { useRuntime } from "../../lib/runtime";

const FREE_BUYER_LISTING_LIMIT = 25;

export const Listings = () => {
  const { token, user } = useAuth();
  const runtime = useRuntime();
  const [search, setSearch] = useState("");
  const [state, setState] = useState("");
  const [maxHours, setMaxHours] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [operableOnly, setOperableOnly] = useState(true);
  const [sellerOnly, setSellerOnly] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showUpgradeToast, setShowUpgradeToast] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasInitializedSellerOnly = useRef(false);

  const meQuery = useQuery({
    queryKey: ["me"],
    enabled: Boolean(token),
    queryFn: getMe,
  });

  const plan = meQuery.data?.billing?.plan ?? "free";
  const isFreeBuyerLive = !runtime.demoMode && user?.role === "buyer" && plan === "free";

  const triggerUpgradeToast = () => {
    setShowUpgradeToast(true);
    if (toastTimer.current !== null) {
      clearTimeout(toastTimer.current);
    }
    toastTimer.current = setTimeout(() => {
      setShowUpgradeToast(false);
    }, 2500);
  };

  useEffect(() => {
    return () => {
      if (toastTimer.current !== null) {
        clearTimeout(toastTimer.current);
      }
    };
  }, []);

  const listingsQuery = useQuery<ListingWithScore[]>({
    queryKey: ["listings", state, maxHours, maxPrice, operableOnly, isFreeBuyerLive],
    queryFn: () =>
      getListings(
        isFreeBuyerLive
          ? {}
          : {
              state: state || undefined,
              maxHours: maxHours ? Number(maxHours) : undefined,
              maxPrice: maxPrice ? Number(maxPrice) : undefined,
              operable: operableOnly,
            }
      ),
  });

  const watchlistQuery = useQuery<{ items: WatchlistItem[] }>({
    queryKey: ["watchlist"],
    queryFn: () => getWatchlist(),
  });

  const watchlistIds = useMemo(() => {
    const items = watchlistQuery.data?.items ?? [];
    return new Set(items.map((item: WatchlistItem) => item.listingId));
  }, [watchlistQuery.data]);

  const handleToggleWatchlist = async (listingId: string) => {
    setActionError(null);
    try {
      if (watchlistIds.has(listingId)) {
        await removeFromWatchlist(listingId);
      } else {
        await addToWatchlist(listingId);
      }
      await watchlistQuery.refetch();
    } catch (error) {
      const requestId = getRequestId(error);
      setActionError(
        requestId
          ? `Could not update watchlist. Request ID: ${requestId}`
          : "Could not update watchlist."
      );
    }
  };

  const data = listingsQuery.data;
  const listings = Array.isArray(data) ? data : [];
  const sellerCount = listings.filter((listing) => listing.source?.startsWith("seller:")).length;

  useEffect(() => {
    if (!Array.isArray(data) || hasInitializedSellerOnly.current) {
      return;
    }
    if (sellerCount > 0) {
      setSellerOnly(true);
    }
    hasInitializedSellerOnly.current = true;
  }, [data, sellerCount]);

  const visibleListings = isFreeBuyerLive
    ? listings.slice(0, FREE_BUYER_LISTING_LIMIT)
    : listings;
  const visibleSellerCount = visibleListings.filter((listing) =>
    listing.source?.startsWith("seller:")
  ).length;
  const visibleExternalCount = visibleListings.length - visibleSellerCount;
  const searchFiltered = search.trim()
    ? visibleListings.filter((l) => `${l.title} ${l.description ?? ""}`.toLowerCase().includes(search.toLowerCase()))
    : visibleListings;
  const filteredListings = sellerOnly
    ? searchFiltered.filter((listing) => listing.source?.startsWith("seller:"))
    : searchFiltered;
  const hasInvalidData = data !== undefined && !Array.isArray(data);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          type="text"
          placeholder="Search equipment..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-48"
        />
        <select
          className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm"
          value={state}
          onChange={(event) => {
            if (isFreeBuyerLive) {
              triggerUpgradeToast();
              return;
            }
            setState(event.target.value);
          }}
        >
          <option value="">All states</option>
          <option value="CA">CA</option>
          <option value="AZ">AZ</option>
          <option value="TX">TX</option>
          <option value="IA">IA</option>
        </select>
        <Input
          type="number"
          min="0"
          placeholder="Max hours"
          value={maxHours}
          onChange={(event) => {
            if (isFreeBuyerLive) {
              triggerUpgradeToast();
              return;
            }
            setMaxHours(event.target.value);
          }}
          onFocus={() => {
            if (isFreeBuyerLive) {
              triggerUpgradeToast();
            }
          }}
          onKeyDown={() => {
            if (isFreeBuyerLive) {
              triggerUpgradeToast();
            }
          }}
        />
        <Input
          type="number"
          min="0"
          placeholder="Max price"
          value={maxPrice}
          onChange={(event) => {
            if (isFreeBuyerLive) {
              triggerUpgradeToast();
              return;
            }
            setMaxPrice(event.target.value);
          }}
          onFocus={() => {
            if (isFreeBuyerLive) {
              triggerUpgradeToast();
            }
          }}
          onKeyDown={() => {
            if (isFreeBuyerLive) {
              triggerUpgradeToast();
            }
          }}
        />
        <label className="flex items-center gap-2 text-xs text-slate-300">
          <input
            type="checkbox"
            checked={operableOnly}
            onChange={(event) => {
              if (isFreeBuyerLive) {
                triggerUpgradeToast();
                return;
              }
              setOperableOnly(event.target.checked);
            }}
          />
          Operable only
        </label>
        <label className="flex items-center gap-2 text-xs text-slate-300">
          <input
            type="checkbox"
            checked={sellerOnly}
            onChange={(event) => {
              if (isFreeBuyerLive) {
                triggerUpgradeToast();
                return;
              }
              setSellerOnly(event.target.checked);
            }}
          />
          Seller listings only
        </label>
      </div>

      <p className="text-xs text-slate-300">
        {visibleSellerCount} seller listing{visibleSellerCount === 1 ? "" : "s"} · {visibleExternalCount} external
      </p>

      {isFreeBuyerLive ? (
        <Card className="border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-100">
          Upgrade to filter and view more listings.
        </Card>
      ) : null}

      {actionError && (
        <Card className="border border-rose-500/40 bg-rose-500/10 p-4 text-sm text-rose-100">
          {actionError}
        </Card>
      )}
      {showUpgradeToast && (
        <div className="fixed bottom-6 right-6 z-50 rounded-lg border border-white/10 bg-slate-900/95 px-4 py-2 text-xs text-slate-100 shadow-lg">
          Upgrade to use filters.
        </div>
      )}
      {listingsQuery.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Card key={index} className="h-40 animate-pulse" />
          ))}
        </div>
      ) : listingsQuery.isError || hasInvalidData ? (
        <Card className="border border-slate-800 bg-slate-900/40 p-6 text-sm text-slate-300">
          Marketplace integrations available in Production accounts.
        </Card>
      ) : sellerOnly && visibleSellerCount === 0 ? (
        <Card className="border border-slate-800 bg-slate-900/40 p-6 text-sm text-slate-300">
          <p>No seller listings yet. Turn off the filter to view external listings.</p>
          <Button
            className="mt-3"
            variant="secondary"
            onClick={() => setSellerOnly(false)}
          >
            Show all listings
          </Button>
        </Card>
      ) : filteredListings.length === 0 ? (
        <Card className="border border-slate-800 bg-slate-900/40 p-6 text-sm text-slate-300">
          No live listings available yet. Once ingestion starts, they will appear here.
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {filteredListings.map((listing) => {
            const listingId = listing.id ?? "";
            const score = listing.score;
            const isSellerListing = listing.source?.startsWith("seller:");
            const sourceLabel = listing.source?.startsWith("seller:") ? "Private seller" : listing.source;
            return (
              <Card key={listingId || listing.title || "listing"} className="space-y-4">
                <div className="flex flex-col gap-2 overflow-hidden sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-lg font-semibold">{listing.title}</h3>
                    <Badge className="mt-1">
                      {isSellerListing ? "Seller Listing" : "External Listing"}
                    </Badge>
                    <p className="truncate text-xs text-slate-300">{sourceLabel}</p>
                  </div>
                  <div className="flex w-full max-w-full flex-col gap-1 text-left sm:w-[8.5rem] sm:shrink-0 sm:items-end sm:text-right">
                    <Badge className="w-fit max-w-full justify-center border border-emerald-200/80 bg-emerald-200 px-2 font-semibold text-emerald-950 sm:w-full">
                      Score {score?.total ?? listing.totalScore ?? 0}
                    </Badge>
                    <span
                      className="block w-full max-w-full truncate text-[11px] font-semibold text-slate-200"
                      title="Confidence reflects data completeness."
                    >
                      {((score?.confidence ?? 0) * 100).toFixed(0)}% confidence
                    </span>
                  </div>
                </div>
                <img
                  src={(listing.images ?? [])[0] || listing.imageUrl || "/demo-images/other/1.jpg"}
                  alt={listing.title}
                  className="h-48 w-full rounded-lg bg-slate-900/20 object-contain"
                />
                <p className="text-sm text-slate-300">{toPlainText(listing.description)}</p>
                <div className="flex flex-wrap gap-3 text-xs text-slate-300">
                  <span>
                    {formatListingPrice(listing.price)}
                  </span>
                  {formatListingHours(listing.hours) && <span>{formatListingHours(listing.hours)}</span>}
                  <span>{listing.state ?? "—"}</span>
                  <span>
                    {listing.operable === undefined
                      ? "—"
                      : listing.operable
                      ? "Operable"
                      : "Not operable"}
                  </span>
                </div>
                <ul className="list-disc space-y-1 pl-4 text-xs text-slate-300">
                  {(score?.reasons ?? []).slice(0, 3).map((reason, index) => (
                    <li key={`${index}-${typeof reason === "string" ? reason : reason.message}`}>{typeof reason === "string" ? reason : reason.message}</li>
                  ))}
                </ul>
                <div className="flex flex-wrap gap-3">
                  <Link to={`/app/listings/${listingId}`}>
                    <Button variant="secondary">View details</Button>
                  </Link>
                  <Button
                    variant="outline"
                    onClick={() => {
                      if (!listingId) return;
                      handleToggleWatchlist(listingId);
                    }}
                    disabled={watchlistQuery.isLoading}
                  >
                    {listingId && watchlistIds.has(listingId)
                      ? "Remove from watchlist"
                      : "Add to watchlist"}
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};
