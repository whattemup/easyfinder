import { useParams } from "react-router-dom";
import { defaultScoringConfig, demoListings as rawListings, scoreListing } from "@easyfinderai/shared";
import ImageGallery from "../../components/ImageGallery";
import { useDemoWatchlist } from "../../lib/demoWatchlist";
import { formatCategory } from "../../lib/formatters";

type Props = {
  listingId?: string;
};

type DemoListing = {
  id: string;
  title: string;
  description: string;
  state: string;
  price: number;
  hours: number;
  operable: boolean;
  is_operable?: boolean;
  year?: number;
  condition?: number;
  category: string;
  imageUrl?: string;
  images?: string[];
  source: string;
  createdAt: string;
};

type RawDemoListing = Omit<DemoListing, "id"> & { id?: string };

export default function DemoListingDetail({ listingId }: Props) {
  const params = useParams();
  const effectiveId = listingId ?? params.id;

  const demoListings: DemoListing[] = (rawListings as RawDemoListing[]).map((l: RawDemoListing, idx: number) => ({
    ...l,
    id: l.id ?? `demo-${idx}`,
  }));
  const listing: DemoListing | undefined = demoListings.find((item: DemoListing) => item.id === effectiveId);
  const watchlist = useDemoWatchlist();

  if (!listing) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-10 text-center text-sm text-slate-400">
        Unable to load listing details.
      </div>
    );
  }

  const imageUrl = listing.imageUrl ?? listing.images?.[0] ?? "";
  const listingForScoring: DemoListing & { imageUrl: string } = {
    ...listing,
    imageUrl,
  };

  const breakdown = scoreListing(listingForScoring, defaultScoringConfig);
  const components = breakdown.breakdown ?? {};
  const rationale = breakdown.reasons ?? [];
  const confidence = breakdown.confidence ?? 0;

  const currentListingId = listing.id;
  const isSaved = currentListingId
    ? watchlist.isInWatchlist(currentListingId)
    : false;

  const displayPrice = typeof listing.price === "number"
    ? `$${listing.price.toLocaleString()}`
    : "—";

  const displayHours = typeof listing.hours === "number"
    ? `${listing.hours.toLocaleString()} hrs`
    : "—";

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-8 md:px-6">
      <div className="grid gap-8 md:grid-cols-2">
        <ImageGallery images={listing.images ?? []} alt={listing.title || "Listing image"} />

        <div className="space-y-6">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-400">
              {formatCategory(listing.category)}
            </p>
            <h1 className="mt-2 text-2xl font-semibold">{listing.title}</h1>
            <p className="mt-2 text-sm text-slate-300">
              {listing.state} • {listing.source}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4 rounded-2xl border border-white/10 bg-slate-900/60 p-4 text-sm">
            <div>
              <p className="text-xs text-slate-400">Price</p>
              <p className="mt-1 font-semibold">{displayPrice}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Hours</p>
              <p className="mt-1 font-semibold">{displayHours}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              if (!currentListingId) return;
              watchlist.toggle(currentListingId);
            }}
            className="rounded-full border border-white/20 px-5 py-2 text-xs font-semibold text-white"
          >
            {isSaved ? "Remove from Watchlist" : "Add to Watchlist"}
          </button>

          <div className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-4">
            <h2 className="text-sm font-semibold">Scoring breakdown</h2>

            <div className="space-y-2 text-xs text-slate-300">
              {Object.entries(components).map(([key, value]: [string, unknown]) => (
                <div key={key} className="flex items-center justify-between">
                  <span>{key}</span>
                  <span>{String(value)}</span>
                </div>
              ))}
            </div>

            {rationale.length > 0 && (
              <div className="space-y-1 text-xs text-slate-400">
                {rationale.map((reason: string, index: number) => (
                  <p key={index}>• {reason}</p>
                ))}
              </div>
            )}

            <p className="text-xs text-emerald-300">
              Confidence: {(confidence * 100).toFixed(0)}%
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
