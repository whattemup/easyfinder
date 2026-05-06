import { FormEvent, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { Card } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import {
  ApiError,
  addToWatchlist,
  createInquiry,
  removeFromWatchlist,
  getListing,
  getRequestId,
  getWatchlist,
  evaluateDeal,
  DealResult,
} from "../../lib/api";
import { WatchlistItem } from "@easyfinderai/shared";
import { useAuth } from "../../lib/auth";
import { useRuntime } from "../../lib/runtime";
import {
  formatListingHours,
  formatListingPrice,
  toPlainText,
} from "../../lib/formatters";

export const ListingDetail = () => {
  const { id } = useParams();
  const { user } = useAuth();
  const runtime = useRuntime();
  const [actionError, setActionError] = useState<string | null>(null);
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
  const [inquiryMessage, setInquiryMessage] = useState("");
  const [inquiryError, setInquiryError] = useState<string | null>(null);
  const [inquirySuccess, setInquirySuccess] = useState(false);
  const [isSubmittingInquiry, setIsSubmittingInquiry] = useState(false);
  const [selectedImage, setSelectedImage] = useState(0);
  const [deal, setDeal] = useState<DealResult | null>(null);
  const [dealLoading, setDealLoading] = useState(false);
  const [dealError, setDealError] = useState<string | null>(null);

  const listingQuery = useQuery({
    queryKey: ["listing", id],
    queryFn: () => getListing(id ?? ""),
    enabled: Boolean(id),
  });

  const watchlistQuery = useQuery({
    queryKey: ["watchlist"],
    queryFn: () => getWatchlist(),
  });

  const watchlistIds = new Set(
    (watchlistQuery.data?.items ?? []).map((item: WatchlistItem) => item.listingId),
  );

  if (listingQuery.isLoading) {
    return <p className="text-sm text-slate-400">Loading listing...</p>;
  }

  if (listingQuery.isError) {
    if (listingQuery.error instanceof ApiError) {
      if (listingQuery.error.message.toLowerCase().includes("not found")) {
        return <p className="text-sm text-slate-400">Listing not found.</p>;
      }
    }
    return (
      <Card className="border border-rose-500/40 bg-rose-500/10 p-4 text-sm text-rose-100">
        Could not load listing.
        {getRequestId(listingQuery.error) && (
          <span className="ml-2 text-xs text-rose-200">
            Request ID: {getRequestId(listingQuery.error)}
          </span>
        )}
      </Card>
    );
  }

  const data = listingQuery.data;
  if (!data) {
    return <p className="text-sm text-slate-400">Listing not found.</p>;
  }

  const handleWatchlist = async () => {
    if (!id) return;
    setActionError(null);
    try {
      if (watchlistIds.has(id)) {
        await removeFromWatchlist(id);
      } else {
        await addToWatchlist(id);
      }
      await watchlistQuery.refetch();
    } catch (error) {
      const requestId = getRequestId(error);
      setActionError(
        requestId
          ? `Could not update watchlist. Request ID: ${requestId}`
          : "Could not update watchlist.",
      );
    }
  };

  const images = data.images?.length
    ? data.images
    : data.imageUrl
      ? [data.imageUrl]
      : [];

  const activeImage = images[selectedImage] ?? images[0];
  const displayPrice = formatListingPrice(data.price);
  const displayHours = formatListingHours(data.hours);
  const score = data.score;
  const scores = score?.breakdown ?? {};
  const rationale = score?.reasons ?? [];
  const listingId = data.id ?? "";
  const isSellerListing = data.source?.startsWith("seller:");
  const canRequestInfo =
    !runtime.demoMode && (user?.role === "buyer" || user?.role === "admin");

  const handleDealAnalysis = async () => {
    if (!data) return;
    setDealLoading(true);
    setDealError(null);
    try {
      const result = await evaluateDeal({
        listing_id:   data.id,
        asking_price: data.price ?? 0,
        category:     (data as any).category ?? "equipment",
        hours:        data.hours ?? undefined,
        operable:     data.operable !== false && (data as any).is_operable !== false,
      });
      setDeal(result);
    } catch (e: any) {
      setDealError(e.message ?? "Deal analysis failed.");
    } finally {
      setDealLoading(false);
    }
  };

  const handleSubmitInquiry = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!id || !inquiryMessage.trim()) return;
    setInquiryError(null);
    setIsSubmittingInquiry(true);
    try {
      await createInquiry({ listingId: id, message: inquiryMessage.trim() });
      setInquirySuccess(true);
      setIsRequestModalOpen(false);
    } catch (error) {
      if (error instanceof ApiError && error.code === "INQUIRY_EXISTS") {
        setInquiryError("You already requested info for this listing.");
      } else {
        setInquiryError("Unable to send request right now.");
      }
    } finally {
      setIsSubmittingInquiry(false);
    }
  };

  return (
    <div className="flex flex-1 min-w-0 gap-6">
      <Card className="flex-1 min-w-0 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold">{data.title}</h2>
            <Badge className="mt-1">
              {isSellerListing ? "Seller Listing" : "External Listing"}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            {canRequestInfo &&
              (inquirySuccess ? (
                <Button variant="secondary" disabled>
                  Request sent
                </Button>
              ) : (
                <>
                <Button variant="secondary" onClick={() => setIsRequestModalOpen(true)}>
                  Request Info
                </Button>
                <Button variant="outline" onClick={handleDealAnalysis} disabled={dealLoading}>
                  {dealLoading ? "Analyzing…" : "Run Deal Analysis"}
                </Button>
                </>
              ))}
            <Badge
              className="bg-accent text-slate-900"
              title={`Confidence ${((score?.confidence ?? 0) * 100).toFixed(0)}%`}
            >
              Score {score?.total ?? data.totalScore ?? 0}
            </Badge>
          </div>
        </div>

        {images.length > 0 && activeImage && (
          <div className="grid gap-4 md:grid-cols-[96px_1fr]">
            <div className="hidden md:flex md:flex-col md:gap-3 md:max-h-[520px] md:overflow-y-auto pr-1">
              {images.map((src, index) => (
                <button
                  key={`${src}-${index}`}
                  type="button"
                  className={`aspect-square w-24 rounded-md overflow-hidden bg-slate-950/40 ${
                    selectedImage === index ? "ring-2 ring-emerald-400" : ""
                  }`}
                  onClick={() => setSelectedImage(index)}
                >
                  <img
                    src={src}
                    alt={`${data.title ?? "Listing image"} thumbnail ${index + 1}`}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                </button>
              ))}
            </div>

            <div className="w-full aspect-[16/9] bg-slate-950/40 rounded-xl overflow-hidden flex items-center justify-center">
              <img
                src={activeImage}
                alt={data.title ?? "Listing image"}
                className="w-full h-full object-contain"
                loading="lazy"
              />
            </div>
          </div>
        )}

        {images.length > 0 && (
          <div className="flex md:hidden gap-3 overflow-x-auto py-2">
            {images.map((src, index) => (
              <button
                key={`mobile-${src}-${index}`}
                type="button"
                className={`aspect-square w-24 shrink-0 rounded-md overflow-hidden bg-slate-950/40 ${
                  selectedImage === index ? "ring-2 ring-emerald-400" : ""
                }`}
                onClick={() => setSelectedImage(index)}
              >
                <img
                  src={src}
                  alt={`${data.title ?? "Listing image"} thumbnail mobile ${index + 1}`}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              </button>
            ))}
          </div>
        )}

        <p className="text-sm text-slate-300">{toPlainText(data.description)}</p>
        <div className="flex flex-wrap gap-4 text-xs text-slate-400">
          <span>{displayPrice}</span>
          {displayHours && <span>{displayHours}</span>}
          <span>{data.state ?? "—"}</span>
          <span>{data.category ?? "—"}</span>
          <span>{data.source ?? "—"}</span>
        </div>
        <div>
          <Button variant="secondary" onClick={handleWatchlist}>
            {listingId && watchlistIds.has(listingId)
              ? "Remove from watchlist"
              : "Add to watchlist"}
          </Button>
        </div>
        {actionError && <div className="text-xs text-rose-200">{actionError}</div>}
        {inquirySuccess && (
          <div className="text-xs text-emerald-200">
            Request sent. EasyFinder will route your inquiry.
          </div>
        )}
        {inquiryError && <div className="text-xs text-rose-200">{inquiryError}</div>}

        <div className="grid gap-3 text-xs text-slate-300">
          {Object.entries(scores).map(([key, value]) => (
            <div key={key} className="flex items-center justify-between">
              <span className="capitalize">{key}</span>
              <span>{value}</span>
            </div>
          ))}
          <div className="flex items-center justify-between">
            <span className="capitalize">Confidence</span>
            <span>{((score?.confidence ?? 0) * 100).toFixed(0)}%</span>
          </div>
        </div>
      </Card>

      <aside className="w-[360px] shrink-0 border-l border-slate-800/60 h-screen overflow-hidden p-6">
        <h3 className="text-lg font-semibold">Score explanation</h3>
        <ul className="mt-3 space-y-2 text-sm text-slate-300">
          {rationale.map((item, index) => (
            <li key={`${index}-${typeof item === "string" ? item : item.message}`}>
              - {typeof item === "string" ? item : item.message}
            </li>
          ))}
        </ul>
      </aside>

      {dealError && (
        <div className="mt-4 rounded border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-200">{dealError}</div>
      )}

      {deal && (
        <div className="mt-4 space-y-4 rounded-lg border border-slate-700 bg-slate-900 p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Deal Analysis</h3>
            <span className={`rounded-md px-3 py-1 text-sm font-bold ${{ BUY: "bg-green-500/20 text-green-300 border border-green-500/40", NEGOTIATE: "bg-yellow-500/20 text-yellow-300 border border-yellow-500/40", WALK: "bg-rose-500/20 text-rose-300 border border-rose-500/40" }[deal.decision]}`}>{deal.decision}</span>
          </div>
          <div className="grid grid-cols-3 gap-3 text-center text-xs">
            <div className="rounded-lg bg-slate-800 p-3"><div className="text-slate-400 mb-1">Fair Value</div><div className="font-semibold">${Math.round(deal.fair_value).toLocaleString()}</div></div>
            <div className="rounded-lg bg-slate-800 p-3"><div className="text-slate-400 mb-1">ROI at Ask</div><div className="font-semibold">{(deal.roi_at_ask*100).toFixed(1)}%</div></div>
            <div className="rounded-lg bg-slate-800 p-3"><div className="text-slate-400 mb-1">Confidence</div><div className="font-semibold">{(deal.confidence*100).toFixed(0)}%</div></div>
          </div>
          <div className="space-y-1 text-xs text-slate-300">
            <div className="flex justify-between"><span>Asking</span><span>${deal.costs.asking_price.toLocaleString()}</span></div>
            {deal.costs.transport_cost > 0 && <div className="flex justify-between"><span>Transport</span><span>${Math.round(deal.costs.transport_cost).toLocaleString()}</span></div>}
            <div className="flex justify-between"><span>Repair est.</span><span>${Math.round(deal.costs.repair_estimate).toLocaleString()}</span></div>
            {deal.costs.wear_penalty > 0 && <div className="flex justify-between"><span>Wear penalty</span><span>${Math.round(deal.costs.wear_penalty).toLocaleString()}</span></div>}
            <div className="flex justify-between border-t border-slate-700 pt-1 font-semibold text-white"><span>Total acquisition</span><span>${Math.round(deal.costs.total_acquisition).toLocaleString()}</span></div>
          </div>
          {deal.negotiation.length > 0 && <div className="space-y-1 text-xs text-slate-300">{deal.negotiation.map(r => <div key={r.round_number} className="flex justify-between"><span>Round {r.round_number}: ${r.counter_price.toLocaleString()}</span><span className={r.accept ? "text-green-400" : "text-slate-500"}>{r.accept ? "✓ accept" : "✗ reject"}</span></div>)}</div>}
          {deal.flags.length > 0 && <div className="flex flex-wrap gap-2">{deal.flags.map(f => <span key={f} className="rounded bg-rose-500/20 px-2 py-0.5 text-xs text-rose-300 border border-rose-500/30">{f}</span>)}</div>}
          <ul className="space-y-1 text-xs text-slate-300">{deal.rationale.map((r,i) => <li key={i} className="flex gap-2"><span className="text-accent">→</span>{r}</li>)}</ul>
        </div>
      )}

      {isRequestModalOpen && canRequestInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4">
          <div className="w-full max-w-lg rounded-lg border border-slate-700 bg-slate-900 p-4">
            <h3 className="text-lg font-semibold">Request Info</h3>
            <form className="mt-3 space-y-3" onSubmit={handleSubmitInquiry}>
              <textarea
                className="min-h-28 w-full rounded-md border border-slate-700 bg-slate-950 p-2 text-sm text-slate-100"
                value={inquiryMessage}
                onChange={(event) => setInquiryMessage(event.target.value)}
                required
                maxLength={2000}
              />
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsRequestModalOpen(false)}
                  disabled={isSubmittingInquiry}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmittingInquiry || !inquiryMessage.trim()}>
                  {isSubmittingInquiry ? "Sending..." : "Submit"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
