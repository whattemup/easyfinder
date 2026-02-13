import { createContext, useContext, useMemo, useState } from "react";
import { demoListings } from "@easyfinderai/shared";
import DemoListings from "./Listings";
import DemoListingDetail from "./ListingDetail";
import { DemoWatchlist } from "./Watchlist";
import { useDemoWatchlist } from "../../lib/demoWatchlist";
import { useRuntime } from "../../lib/runtime";

type TourRole = "buyer" | "seller" | "enterprise";

type EnterpriseWeights = {
  price: number;
  hours: number;
  location: number;
};

type EnterpriseUser = {
  id: string;
  name: string;
  email: string;
  role: string;
};

type SellerListing = {
  id: string;
  title: string;
  category: string;
  price: string;
  hours: string;
  state: string;
  images: string[];
  source: "manual" | "csv";
};

type DemoListingLike = {
  id?: string;
  title?: string;
  state?: string;
  category?: string;
  price?: number;
  hours?: number;
};


type DemoTourState = {
  ndaAccepted: boolean;
  contactEmailDraft: { subject: string; body: string };
  lastActionMessage: string;
  sellerListings: SellerListing[];
  enterpriseSources: Record<string, boolean>;
  enterpriseWeights: EnterpriseWeights;
  enterprisePreferredState: string;
  enterpriseUsers: EnterpriseUser[];
  setNdaAccepted: (value: boolean) => void;
  setContactEmailDraft: (value: { subject: string; body: string }) => void;
  setLastActionMessage: (value: string) => void;
  addSellerListing: (listing: SellerListing) => void;
  addSellerListings: (listings: SellerListing[]) => void;
  setEnterpriseSources: (sources: Record<string, boolean>) => void;
  setEnterpriseWeights: (weights: EnterpriseWeights) => void;
  setEnterprisePreferredState: (state: string) => void;
  addEnterpriseUser: (user: EnterpriseUser) => void;
};

const DemoTourContext = createContext<DemoTourState | null>(null);

const useDemoTour = () => {
  const context = useContext(DemoTourContext);
  if (!context) {
    throw new Error("useDemoTour must be used within DemoTourContext");
  }
  return context;
};

const DemoTourProvider = ({ children }: { children: React.ReactNode }) => {
  const [ndaAccepted, setNdaAccepted] = useState(false);
  const [contactEmailDraft, setContactEmailDraft] = useState({
    subject: "Follow-up on Equipment Listing",
    body:
      "Hello EasyFinder team,\n\nWe reviewed the listing and would like to discuss pricing, inspection details, and availability windows. Please share the next steps and a recommended contact time.\n\nThank you,\nBuyer Operations",
  });
  const [lastActionMessage, setLastActionMessage] = useState("");
  const [sellerListings, setSellerListings] = useState<SellerListing[]>([]);
  const [enterpriseSources, setEnterpriseSources] = useState<Record<string, boolean>>({
    AuctionPlanet: true,
    GovPlanet: true,
    IronPlanet: true,
    RitchieBros: true,
    MachineryTrader: false,
    AuctionTime: false,
  });
  const [enterpriseWeights, setEnterpriseWeights] = useState<EnterpriseWeights>({
    price: 40,
    hours: 35,
    location: 25,
  });
  const [enterprisePreferredState, setEnterprisePreferredState] = useState("TX");
  const [enterpriseUsers, setEnterpriseUsers] = useState<EnterpriseUser[]>([
    { id: "user-1", name: "Avery Chen", email: "avery@northwind.com", role: "Admin" },
    { id: "user-2", name: "Jordan Lee", email: "jordan@northwind.com", role: "Analyst" },
  ]);

  const addSellerListing = (listing: SellerListing) => {
    setSellerListings((prev) => [...prev, listing]);
  };

  const addSellerListings = (listings: SellerListing[]) => {
    if (!listings.length) return;
    setSellerListings((prev) => [...prev, ...listings]);
  };

  const addEnterpriseUser = (user: EnterpriseUser) => {
    setEnterpriseUsers((prev) => [...prev, user]);
  };

  const value = useMemo(
    () => ({
      ndaAccepted,
      contactEmailDraft,
      lastActionMessage,
      sellerListings,
      enterpriseSources,
      enterpriseWeights,
      enterprisePreferredState,
      enterpriseUsers,
      setNdaAccepted,
      setContactEmailDraft,
      setLastActionMessage,
      addSellerListing,
      addSellerListings,
      setEnterpriseSources,
      setEnterpriseWeights,
      setEnterprisePreferredState,
      addEnterpriseUser,
    }),
    [
      addSellerListings,
      contactEmailDraft,
      lastActionMessage,
      ndaAccepted,
      sellerListings,
      enterpriseSources,
      enterprisePreferredState,
      enterpriseUsers,
      enterpriseWeights,
    ]
  );

  return <DemoTourContext.Provider value={value}>{children}</DemoTourContext.Provider>;
};

const buyerSteps = [
  {
    id: 1,
    title: "Ranked Listings",
    description:
      "EasyFinder scores every listing using operational fit, hours, location, and price signals. Buyers see the top-ranked inventory first so they can prioritize capital-efficient options. The ranking also highlights data completeness and confidence for each item.",
  },
  {
    id: 2,
    title: "View Details",
    description:
      "Each listing opens a focused detail view with a rich image gallery. Buyers can review specs, condition notes, and scoring rationale in one place. This reduces time-to-decision and keeps teams aligned on why a listing ranks highly.",
  },
  {
    id: 3,
    title: "NDA Requirement",
    description:
      "Sensitive seller data is gated behind an NDA acceptance step. Buyers must agree before they can proceed to outreach or access proprietary documents. This keeps seller relationships protected while still enabling fast buyer workflows.",
  },
  {
    id: 4,
    title: "Contact Seller (via EasyFinder)",
    description:
      "Outreach is routed through EasyFinder for visibility and auditability. Buyers draft a message in-platform so the team can track engagement status, timing, and follow-ups. Everything stays centralized for compliance.",
  },
  {
    id: 5,
    title: "Watchlist + Limits Preview",
    description:
      "Watchlists help buyers organize opportunities and enforce plan-based limits. Live enforcement happens server-side; this demo illustrates the experience without any backend calls. Teams can quickly see what is saved and how plan limits apply.",
  },
  {
    id: 6,
    title: "Upgrade / Enterprise CTA",
    description:
      "When buyers need enterprise controls, plan upgrades unlock advanced sourcing and governance tools. The upgrade path is clear so teams can move from demo to production quickly. Enterprise plans unlock broader access and controls.",
  },
];

const sellerSteps = [
  {
    id: 1,
    title: "Seller Dashboard Overview",
    description:
      "Seller tools are separate from Buyer workflows. This dashboard highlights your owned listings and activity at a glance so you can track active inventory and status updates.",
  },
  {
    id: 2,
    title: "Manual Listing Entry",
    description:
      "Sellers can create listings manually when they have a small number of assets. Key fields and image previews help ensure listings are ready for buyer discovery.",
  },
  {
    id: 3,
    title: "CSV Upload",
    description:
      "Bulk uploads make it easy to onboard inventory. A lightweight CSV parser previews what will be added before import to keep listings consistent.",
  },
  {
    id: 4,
    title: "Seller Listings View",
    description:
      "All listings created in this demo stay local and appear here immediately. This mirrors how sellers would manage their inventory in production.",
  },
  {
    id: 5,
    title: "Offers Preview",
    description:
      "Seller inquiries appear in a unified queue so teams can respond quickly. This demo shows a static preview of incoming offers.",
  },
  {
    id: 6,
    title: "Enterprise Upgrade CTA",
    description:
      "Enterprise sellers unlock advanced controls, analytics, and support. Upgrading ensures larger inventories and compliance needs are covered.",
  },
];

const enterpriseSteps = [
  {
    id: 1,
    title: "Enterprise Overview",
    description:
      "Enterprise access layers compliance, governance, and centralized controls on top of the EasyFinder marketplace. Teams gain secure visibility, policy enforcement, and auditable workflows across business units.",
  },
  {
    id: 2,
    title: "Data Sources Management",
    description:
      "Enterprise admins curate external sources to align with procurement policy. This demo shows mock source toggles to illustrate the experience without any real integrations.",
  },
  {
    id: 3,
    title: "Scoring Configuration",
    description:
      "Weight price, hours, and location to reflect enterprise sourcing policy. Adjusting sliders re-ranks demo listings locally so teams can visualize the scoring impact in real time.",
  },
  {
    id: 4,
    title: "Audit Log Visibility",
    description:
      "Enterprise audit logs keep every action transparent and traceable. Teams can review who changed what, when, and the outcome to satisfy compliance requirements.",
  },
  {
    id: 5,
    title: "Role & Seat Management",
    description:
      "Seat management ensures only approved roles can access sensitive workflows. Admins can add users, assign roles, and review seat allocation centrally.",
  },
  {
    id: 6,
    title: "Enterprise Upgrade / Contact Sales",
    description:
      "Enterprise support includes onboarding, contracts, and SLAs. This CTA guides teams to connect with sales and unlock enterprise-grade tooling.",
  },
];

let listingIdCounter = 0;
const createListingId = () => {
  listingIdCounter += 1;
  return `listing-${listingIdCounter}`;
};

const parseCsvRows = (text: string) => {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  const header = lines[0].split(",").map((value) => value.trim().toLowerCase());
  return lines.slice(1).map((line) => {
    const cells = line.split(",").map((value) => value.trim());
    const row: Record<string, string> = {};
    header.forEach((key, index) => {
      row[key] = cells[index] ?? "";
    });
    return row;
  });
};

export const DemoTour = () => {
  const [started, setStarted] = useState(false);
  const [step, setStep] = useState(1);
  const [role, setRole] = useState<TourRole>("buyer");
  const [selectedListingId, setSelectedListingId] = useState<string | null>(null);

  const steps =
    role === "buyer" ? buyerSteps : role === "seller" ? sellerSteps : enterpriseSteps;
  const currentStep = steps.find((item) => item.id === step) ?? steps[0];

  return (
    <DemoTourProvider>
      <div className="relative min-h-screen bg-slate-950 text-white">
        {!started ? (
          <div className="relative z-0">
            <TourIntro
              role={role}
              onRoleChange={(nextRole) => {
                setRole(nextRole);
                setSelectedListingId(null);
                setStep(1);
              }}
              onStart={() => setStarted(true)}
            />
          </div>
        ) : (
          <div className="flex h-screen overflow-hidden">
            <div className="min-w-0 flex-1 overflow-y-auto">
              <TourStepContent
                step={step}
                role={role}
                onStepChange={setStep}
                selectedListingId={selectedListingId}
                onSelectListingId={setSelectedListingId}
              />
            </div>
            <TourOverlay
              step={step}
              title={currentStep.title}
              description={currentStep.description}
              onBack={() => setStep((prev) => Math.max(1, prev - 1))}
              onNext={() => setStep((prev) => Math.min(steps.length, prev + 1))}
              onExit={() => {
                setStarted(false);
                setStep(1);
                setSelectedListingId(null);
              }}
              role={role}
            />
          </div>
        )}
      </div>
    </DemoTourProvider>
  );
};

const TourIntro = ({
  role,
  onRoleChange,
  onStart,
}: {
  role: TourRole;
  onRoleChange: (role: TourRole) => void;
  onStart: () => void;
}) => {
  const headingRoleLabel =
    role === "buyer" ? "Buyer" : role === "seller" ? "Seller" : "Enterprise";
  const selectedRole = role;
  const roleLabel =
    selectedRole === "buyer"
      ? "buyer"
      : selectedRole === "seller"
      ? "seller"
      : "enterprise";

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-10 md:px-6">
      <div className="rounded-3xl border border-white/10 bg-white/5 p-8">
        <p className="text-xs uppercase tracking-[0.3em] text-amber-200">
          Demo tour
        </p>
        <h1 className="mt-3 text-3xl font-semibold">
          {headingRoleLabel} Experience Walkthrough
        </h1>
        <p className="mt-3 max-w-2xl text-base text-slate-200">
          This guided tour walks through the {roleLabel} workflow using demo-only data. No
          logins, payments, or backend calls are required. Choose a role to begin.
        </p>
        <div className="mt-6 flex flex-col gap-4">
          <div className="flex items-center gap-3 rounded-2xl border border-amber-200/30 bg-slate-900/60 p-4">
            <input
              id="role-buyer"
              type="radio"
              checked={role === "buyer"}
              onChange={() => onRoleChange("buyer")}
              className="h-4 w-4 accent-amber-300"
            />
            <label htmlFor="role-buyer" className="text-sm font-semibold">
              Buyer
            </label>
            <span className="text-xs text-slate-300">Ranked listings to outreach.</span>
          </div>
          <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-slate-900/40 p-4">
            <input
              id="role-seller"
              type="radio"
              checked={role === "seller"}
              onChange={() => onRoleChange("seller")}
              className="h-4 w-4 accent-amber-300"
            />
            <label htmlFor="role-seller" className="text-sm font-semibold">
              Seller
            </label>
            <span className="text-xs text-slate-300">List inventory and manage offers.</span>
          </div>
          <div className="flex items-center gap-3 rounded-2xl border border-emerald-200/20 bg-slate-900/40 p-4">
            <input
              id="role-enterprise"
              type="radio"
              checked={role === "enterprise"}
              onChange={() => onRoleChange("enterprise")}
              className="h-4 w-4 accent-amber-300"
            />
            <label htmlFor="role-enterprise" className="text-sm font-semibold">
              Enterprise
            </label>
            <span className="text-xs text-slate-300">
              Compliance, governance, and admin controls.
            </span>
          </div>
          <button
            type="button"
            onClick={onStart}
            className="w-full rounded-full bg-amber-300 px-5 py-3 text-sm font-semibold text-slate-950 md:w-auto"
          >
            Start {roleLabel} Tour
          </button>
        </div>
      </div>
    </div>
  );
};

const TourOverlay = ({
  step,
  title,
  description,
  onBack,
  onNext,
  onExit,
  role,
}: {
  step: number;
  title: string;
  description: string;
  onBack: () => void;
  onNext: () => void;
  onExit: () => void;
  role: TourRole;
}) => {
  const { ndaAccepted } = useDemoTour();
  const nextDisabled = role === "buyer" && step === 3 && !ndaAccepted;

  return (
    <aside className="pointer-events-auto sticky top-0 h-screen w-[420px] shrink-0 border-l border-white/10 bg-slate-950/95 p-6 backdrop-blur">
      <div className="space-y-3">
        <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
          Step {step} of 6
        </p>
        <h2 className="text-xl font-semibold">{title}</h2>
        <p className="text-sm leading-relaxed text-slate-200">{description}</p>
      </div>
      <div className="mt-6 flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            disabled={step === 1}
            className="rounded-full border border-white/20 px-4 py-2 text-xs font-semibold text-white disabled:opacity-40"
          >
            Back
          </button>
          <button
            type="button"
            onClick={onNext}
            disabled={step === 6 || nextDisabled}
            className="rounded-full bg-amber-300 px-4 py-2 text-xs font-semibold text-slate-950 disabled:opacity-40"
          >
            Next
          </button>
        </div>
        {nextDisabled ? (
          <p className="text-xs text-amber-200">
            Accept the NDA to continue.
          </p>
        ) : null}
        <button
          type="button"
          onClick={onExit}
          className="text-left text-xs font-semibold text-slate-400 hover:text-slate-200"
        >
          Exit tour
        </button>
      </div>
    </aside>
  );
};

const TourStepContent = ({
  step,
  role,
  onStepChange,
  selectedListingId,
  onSelectListingId,
}: {
  step: number;
  role: TourRole;
  onStepChange: (step: number) => void;
  selectedListingId: string | null;
  onSelectListingId: (listingId: string | null) => void;
}) => {
  if (role === "seller") {
    switch (step) {
      case 1:
        return <TourSellerDashboard />;
      case 2:
        return <TourSellerManualEntry />;
      case 3:
        return <TourSellerCsvUpload />;
      case 4:
        return <TourSellerListings />;
      case 5:
        return <TourSellerOffers />;
      case 6:
        return <TourSellerUpgradeCta />;
      default:
        return null;
    }
  }

  if (role === "enterprise") {
    switch (step) {
      case 1:
        return <TourEnterpriseOverview />;
      case 2:
        return <TourEnterpriseSources />;
      case 3:
        return <TourEnterpriseScoring />;
      case 4:
        return <TourEnterpriseAuditLog />;
      case 5:
        return <TourEnterpriseSeats />;
      case 6:
        return <TourEnterpriseUpgradeCta />;
      default:
        return null;
    }
  }

  switch (step) {
    case 1:
      return (
        <div
          onClickCapture={(event) => {
            if (role !== "buyer" || step !== 1) return;
            if (event.button !== 0) return;
            if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

            const target = event.target;
            if (!(target instanceof Element)) return;

            const listingLink = target.closest("a[href^='/demo/listings/']");
            if (!(listingLink instanceof HTMLAnchorElement)) return;

            const dataListingId =
              listingLink.dataset.listingId ||
              target.closest("[data-listing-id]")?.getAttribute("data-listing-id");
            const pathListingId = listingLink.pathname.match(/^\/demo\/listings\/([^/?#]+)/)?.[1] ?? null;
            const listingId = dataListingId || pathListingId;
            if (!listingId) return;

            event.preventDefault();
            onSelectListingId(listingId);
            onStepChange(2);
          }}
        >
          <DemoListings />
        </div>
      );
    case 2:
      return <TourListingDetail selectedListingId={selectedListingId} />;
    case 3:
      return <TourNdaPreview />;
    case 4:
      return <TourEmailComposer />;
    case 5:
      return <TourWatchlistPreview />;
    case 6:
      return <TourUpgradeCta />;
    default:
      return null;
  }
};

const TourListingDetail = ({ selectedListingId }: { selectedListingId: string | null }) => {
  const listing =
    (demoListings as DemoListingLike[]).find((item: DemoListingLike) => item.id === selectedListingId) ??
    (demoListings as DemoListingLike[])[0];

  if (!listing?.id) {
    return (
      <div className="mx-auto w-full max-w-4xl px-4 py-6 md:px-6">
        <div className="rounded-2xl border border-rose-400/40 bg-rose-500/10 p-6 text-sm text-rose-100">
          Demo listing not available.
        </div>
      </div>
    );
  }

  return <DemoListingDetail listingId={listing.id} />;
};

const TourSellerDashboard = () => {
  const { sellerListings } = useDemoTour();
  const manualCount = sellerListings.filter((listing) => listing.source === "manual").length;
  const csvCount = sellerListings.filter((listing) => listing.source === "csv").length;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-4 py-6 md:px-6">
      <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
        <h2 className="text-xl font-semibold">Seller Dashboard</h2>
        <p className="mt-2 text-sm text-slate-200">
          Sellers manage their inventory separately from buyers. This dashboard keeps the focus
          on your listings and activity.
        </p>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-4">
            <p className="text-xs uppercase tracking-wide text-slate-400">Total listings</p>
            <p className="mt-2 text-2xl font-semibold">{sellerListings.length}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-4">
            <p className="text-xs uppercase tracking-wide text-slate-400">Manual entries</p>
            <p className="mt-2 text-2xl font-semibold">{manualCount}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-4">
            <p className="text-xs uppercase tracking-wide text-slate-400">CSV imports</p>
            <p className="mt-2 text-2xl font-semibold">{csvCount}</p>
          </div>
        </div>
      </div>
    </div>
  );
};

const TourSellerManualEntry = () => {
  const { addSellerListing } = useDemoTour();
  const { demoMode } = useRuntime();
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [price, setPrice] = useState("");
  const [hours, setHours] = useState("");
  const [stateValue, setStateValue] = useState("");
  const [images, setImages] = useState<string[]>([]);

  const handleImages = (files: FileList | null) => {
    if (!files) return;
    const nextImages = Array.from(files)
      .slice(0, 5)
      .map((file) => URL.createObjectURL(file));
    setImages(nextImages);
  };

  if (demoMode) {
    return (
      <div className="mx-auto w-full max-w-5xl px-4 py-6 md:px-6">
        <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
          <h2 className="text-xl font-semibold">Manual Listing Entry</h2>
          <p className="mt-2 text-sm text-slate-200">
            Creating or modifying listings is disabled in demo mode.
          </p>
        </div>
      </div>
    );
  }

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    addSellerListing({
      id: createListingId(),
      title: title.trim() || "Untitled listing",
      category: category.trim() || "Uncategorized",
      price: price.trim(),
      hours: hours.trim(),
      state: stateValue.trim() || "—",
      images,
      source: "manual",
    });
    setTitle("");
    setCategory("");
    setPrice("");
    setHours("");
    setStateValue("");
    setImages([]);
  };

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 md:px-6">
      <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
        <h2 className="text-xl font-semibold">Manual Listing Entry</h2>
        <form className="mt-6 grid gap-4 md:grid-cols-2" onSubmit={handleSubmit}>
          <label className="block text-sm">
            Title
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-sm">
            Category
            <input
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-sm">
            Price
            <input
              value={price}
              onChange={(event) => setPrice(event.target.value)}
              className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-sm">
            Hours
            <input
              value={hours}
              onChange={(event) => setHours(event.target.value)}
              className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-sm">
            State
            <input
              value={stateValue}
              onChange={(event) => setStateValue(event.target.value)}
              className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-sm">
            Upload images (1–5)
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={(event) => handleImages(event.target.files)}
              className="mt-2 w-full text-xs text-slate-300"
            />
          </label>
          <div className="md:col-span-2">
            <button
              type="submit"
              className="rounded-full bg-amber-300 px-5 py-2 text-xs font-semibold text-slate-950"
            >
              Add listing
            </button>
          </div>
        </form>
        {images.length ? (
          <div className="mt-4 flex flex-wrap gap-3">
            {images.map((src) => (
              <img key={src} src={src} alt="Preview" className="h-16 w-24 rounded-lg object-cover" />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
};

const TourSellerCsvUpload = () => {
  const { addSellerListings } = useDemoTour();
  const { demoMode } = useRuntime();
  const [previewRows, setPreviewRows] = useState<Record<string, string>[]>([]);
  const [error, setError] = useState("");

  if (demoMode) {
    return (
      <div className="mx-auto w-full max-w-5xl px-4 py-6 md:px-6">
        <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
          <h2 className="text-xl font-semibold">CSV Upload</h2>
          <p className="mt-2 text-sm text-slate-200">
            Uploading listings is disabled in demo mode.
          </p>
        </div>
      </div>
    );
  }

  const handleCsv = (file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === "string" ? reader.result : "";
      const rows = parseCsvRows(text);
      if (!rows.length) {
        setError("No rows found. Use a header row and at least one data row.");
        setPreviewRows([]);
        return;
      }
      setError("");
      setPreviewRows(rows);
    };
    reader.readAsText(file);
  };

  const handleImport = () => {
    const listings = previewRows.map((row) => ({
      id: createListingId(),
      title: row.title || "Untitled listing",
      category: row.category || "Uncategorized",
      price: row.price || "",
      hours: row.hours || "",
      state: row.state || "—",
      images: [],
      source: "csv" as const,
    }));
    addSellerListings(listings);
  };

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 md:px-6">
      <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
        <h2 className="text-xl font-semibold">CSV Upload</h2>
        <p className="mt-2 text-sm text-slate-200">
          Supported columns: title, category, price, hours, state. Simple parsing only (quoted
          commas are not supported).
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(event) => handleCsv(event.target.files?.[0] ?? null)}
            className="text-xs text-slate-300"
          />
          <button
            type="button"
            onClick={handleImport}
            disabled={!previewRows.length}
            className="rounded-full bg-amber-300 px-5 py-2 text-xs font-semibold text-slate-950 disabled:opacity-40"
          >
            Import previewed rows
          </button>
        </div>
        {error ? <p className="mt-3 text-xs text-rose-200">{error}</p> : null}
        {previewRows.length ? (
          <div className="mt-4 overflow-x-auto rounded-2xl border border-white/10">
            <table className="w-full text-left text-xs text-slate-200">
              <thead className="bg-slate-900/70 text-[10px] uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-3 py-2">Title</th>
                  <th className="px-3 py-2">Category</th>
                  <th className="px-3 py-2">Price</th>
                  <th className="px-3 py-2">Hours</th>
                  <th className="px-3 py-2">State</th>
                </tr>
              </thead>
              <tbody>
                {previewRows.map((row, index) => (
                  <tr key={`${row.title}-${index}`} className="border-t border-white/10">
                    <td className="px-3 py-2">{row.title || "—"}</td>
                    <td className="px-3 py-2">{row.category || "—"}</td>
                    <td className="px-3 py-2">{row.price || "—"}</td>
                    <td className="px-3 py-2">{row.hours || "—"}</td>
                    <td className="px-3 py-2">{row.state || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </div>
  );
};

const TourSellerListings = () => {
  const { sellerListings } = useDemoTour();

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 px-4 py-6 md:px-6">
      <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
        <h2 className="text-xl font-semibold">Seller Listings</h2>
        <p className="mt-2 text-sm text-slate-200">
          Listings created in this demo are shown below. No backend calls are made.
        </p>
      </div>
      {sellerListings.length ? (
        <div className="grid gap-4 md:grid-cols-2">
          {sellerListings.map((listing) => (
            <div
              key={listing.id}
              className="rounded-2xl border border-white/10 bg-slate-900/60 p-4"
            >
              <p className="text-xs uppercase tracking-wide text-slate-400">
                {listing.source === "manual" ? "Manual entry" : "CSV import"}
              </p>
              <h3 className="mt-2 text-lg font-semibold">{listing.title ?? "Untitled listing"}</h3>
              <p className="text-sm text-slate-300">{listing.category}</p>
              <div className="mt-3 text-xs text-slate-300">
                <span>Price: {listing.price || "—"}</span>
                <span className="mx-2">•</span>
                <span>Hours: {listing.hours || "—"}</span>
                <span className="mx-2">•</span>
                <span>State: {listing.state || "—"}</span>
              </div>
              {listing.images.length ? (
                <div className="mt-3 flex gap-2">
                  {listing.images.map((src) => (
                    <img
                      key={src}
                      src={src}
                      alt="Listing preview"
                      className="h-12 w-16 rounded-md object-cover"
                    />
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-6 text-sm text-slate-200">
          No demo listings yet. Add a manual listing or import CSV rows to populate this view.
        </div>
      )}
    </div>
  );
};

const TourSellerOffers = () => (
  <div className="mx-auto w-full max-w-5xl space-y-4 px-4 py-6 md:px-6">
    <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
      <h2 className="text-xl font-semibold">Offers Preview</h2>
      <p className="mt-2 text-sm text-slate-200">
        Incoming buyer inquiries appear here. This is a demo-only preview with static data.
      </p>
    </div>
    <div className="grid gap-4 md:grid-cols-2">
      {[
        {
          buyer: "Northwind Materials",
          listing: "2020 CAT 320 Excavator",
          message: "Interested in inspection and availability window.",
        },
        {
          buyer: "Summit Mining Co.",
          listing: "2019 Komatsu D65",
          message: "Can you share maintenance records and pricing guidance?",
        },
      ].map((offer) => (
        <div
          key={offer.buyer}
          className="rounded-2xl border border-white/10 bg-slate-900/60 p-4"
        >
          <p className="text-xs uppercase tracking-wide text-slate-400">New inquiry</p>
          <h3 className="mt-2 text-lg font-semibold">{offer.buyer}</h3>
          <p className="text-sm text-slate-300">{offer.listing}</p>
          <p className="mt-3 text-sm text-slate-200">{offer.message}</p>
        </div>
      ))}
    </div>
  </div>
);

const TourSellerUpgradeCta = () => (
  <div className="mx-auto w-full max-w-4xl px-4 py-10 md:px-6">
    <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-slate-900/80 to-slate-950/80 p-8">
      <p className="text-xs uppercase tracking-[0.3em] text-amber-200">Enterprise</p>
      <h2 className="mt-3 text-2xl font-semibold">Upgrade your seller account</h2>
      <p className="mt-3 text-sm text-slate-200">
        Enterprise sellers get advanced inventory controls, SLA-backed support, and analytics to
        grow distribution. Upgrade to unlock larger catalog limits and governance.
      </p>
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="rounded-full bg-amber-300 px-5 py-2 text-xs font-semibold text-slate-950"
        >
          Request enterprise upgrade
        </button>
        <button
          type="button"
          className="rounded-full border border-white/20 px-5 py-2 text-xs font-semibold text-white"
        >
          Compare seller plans
        </button>
      </div>
    </div>
  </div>
);

const normalizeValue = (value: number, min: number, max: number) => {
  if (max === min) return 1;
  return (value - min) / (max - min);
};

const TourEnterpriseOverview = () => (
  <div className="mx-auto w-full max-w-5xl px-4 py-6 md:px-6">
    <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
      <p className="text-xs uppercase tracking-[0.3em] text-emerald-200">Enterprise</p>
      <h2 className="mt-3 text-2xl font-semibold">Enterprise access + compliance controls</h2>
      <p className="mt-3 text-sm text-slate-200">
        Enterprise plans add governance, centralized visibility, and compliance guardrails to
        the EasyFinder marketplace. Admins can enforce policies, monitor sourcing, and keep
        approvals auditable across regions and business units.
      </p>
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        {[
          {
            title: "Access control",
            description: "Role-based access keeps sensitive sourcing data protected.",
          },
          {
            title: "Compliance",
            description: "Standardized workflows ensure purchases align to policy.",
          },
          {
            title: "Audit readiness",
            description: "Every action is tracked with immutable audit trails.",
          },
        ].map((item) => (
          <div key={item.title} className="rounded-2xl border border-white/10 bg-slate-900/60 p-4">
            <h3 className="text-sm font-semibold">{item.title}</h3>
            <p className="mt-2 text-xs text-slate-300">{item.description}</p>
          </div>
        ))}
      </div>
    </div>
  </div>
);

const TourEnterpriseSources = () => {
  const { enterpriseSources, setEnterpriseSources } = useDemoTour();

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 md:px-6">
      <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
        <h2 className="text-xl font-semibold">Data Sources Management</h2>
        <p className="mt-2 text-sm text-slate-200">
          Enterprise admins can enable or disable approved marketplaces. These demo toggles are
          static and only persist within this tour session.
        </p>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {Object.entries(enterpriseSources).map(([source, enabled]) => (
            <button
              key={source}
              type="button"
              onClick={() =>
                setEnterpriseSources({
                  ...enterpriseSources,
                  [source]: !enabled,
                })
              }
              className="flex items-center justify-between rounded-2xl border border-white/10 bg-slate-900/60 px-4 py-3 text-left"
            >
              <div>
                <p className="text-sm font-semibold">{source}</p>
                <p className="text-xs text-slate-300">Demo-only source toggle</p>
              </div>
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  enabled ? "bg-emerald-400/20 text-emerald-200" : "bg-slate-800 text-slate-400"
                }`}
              >
                {enabled ? "Enabled" : "Disabled"}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

const TourEnterpriseScoring = () => {
  const {
    enterpriseWeights,
    setEnterpriseWeights,
    enterprisePreferredState,
    setEnterprisePreferredState,
  } = useDemoTour();
  const states = useMemo(
    () =>
      Array.from(new Set((demoListings as DemoListingLike[]).map((listing: DemoListingLike) => listing.state ?? ""))).sort(),
    []
  );

  const ranked = useMemo(() => {
    const prices = (demoListings as DemoListingLike[]).map((listing: DemoListingLike) => listing.price ?? 0);
    const hours = (demoListings as DemoListingLike[]).map((listing: DemoListingLike) => listing.hours ?? 0);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const minHours = Math.min(...hours);
    const maxHours = Math.max(...hours);
    const totalWeight = Math.max(
      enterpriseWeights.price + enterpriseWeights.hours + enterpriseWeights.location,
      1
    );

    return (demoListings as DemoListingLike[])
      .map((listing: DemoListingLike) => {
        const priceScore = 1 - normalizeValue(listing.price ?? 0, minPrice, maxPrice);
        const hoursScore = 1 - normalizeValue(listing.hours ?? 0, minHours, maxHours);
        const locationScore =
          enterprisePreferredState === "Any"
            ? 0.5
            : (listing.state ?? "") === enterprisePreferredState
            ? 1
            : 0.1;
        const score =
          (priceScore * enterpriseWeights.price +
            hoursScore * enterpriseWeights.hours +
            locationScore * enterpriseWeights.location) /
          totalWeight;
        return { listing, score };
      })
      .sort(
        (a: { listing: DemoListingLike; score: number }, b: { listing: DemoListingLike; score: number }) =>
          b.score - a.score || (a.listing.id ?? "").localeCompare(b.listing.id ?? "")
      );
  }, [enterprisePreferredState, enterpriseWeights]);

  const updateWeight = (key: keyof EnterpriseWeights, value: number) => {
    setEnterpriseWeights({ ...enterpriseWeights, [key]: value });
  };

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6 md:px-6">
      <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
        <h2 className="text-xl font-semibold">Scoring Configuration</h2>
        <p className="mt-2 text-sm text-slate-200">
          Adjust weights to match enterprise policy. Rankings below update deterministically from
          demo data using price, hours, and location preference.
        </p>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {([
            { key: "price", label: "Price weight" },
            { key: "hours", label: "Hours weight" },
            { key: "location", label: "Location weight" },
          ] as const).map((item) => (
            <label key={item.key} className="rounded-2xl border border-white/10 bg-slate-900/60 p-4">
              <div className="flex items-center justify-between text-xs text-slate-300">
                <span>{item.label}</span>
                <span className="text-sm font-semibold text-slate-100">
                  {enterpriseWeights[item.key]}
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={enterpriseWeights[item.key]}
                onChange={(event) => updateWeight(item.key, Number(event.target.value))}
                className="mt-4 w-full accent-amber-300"
              />
            </label>
          ))}
        </div>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <label className="text-sm text-slate-200">
            Preferred state
            <select
              value={enterprisePreferredState}
              onChange={(event) => setEnterprisePreferredState(event.target.value)}
              className="ml-3 rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm"
            >
              <option value="Any">Any</option>
              {states.map((state) => (
                <option key={state} value={state}>
                  {state}
                </option>
              ))}
            </select>
          </label>
          <span className="text-xs text-slate-400">
            Location weight influences rankings when the preferred state matches.
          </span>
        </div>
      </div>
      <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
        <h3 className="text-lg font-semibold">Ranked demo listings</h3>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {ranked.map(({ listing, score }: { listing: DemoListingLike; score: number }, index: number) => (
            <div
              key={listing.id ?? `ranked-${index}`} 
              className="rounded-2xl border border-white/10 bg-slate-900/60 p-4"
            >
              <p className="text-xs uppercase tracking-wide text-slate-400">
                Rank {index + 1}
              </p>
              <h4 className="mt-2 text-sm font-semibold">{listing.title ?? "Untitled listing"}</h4>
              <p className="text-xs text-slate-300">{listing.state ?? "—"} • {listing.category ?? "—"}</p>
              <div className="mt-3 text-xs text-slate-300">
                <span>Price: {typeof listing.price === "number" ? `$${listing.price.toLocaleString()}` : "—"}</span>
                <span className="mx-2">•</span>
                <span>Hours: {typeof listing.hours === "number" ? listing.hours.toLocaleString() : "—"}</span>
              </div>
              <p className="mt-3 text-xs text-emerald-200">
                Composite score: {(score * 100).toFixed(1)}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const TourEnterpriseAuditLog = () => (
  <div className="mx-auto w-full max-w-5xl px-4 py-6 md:px-6">
    <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
      <h2 className="text-xl font-semibold">Audit Log Visibility</h2>
      <p className="mt-2 text-sm text-slate-200">
        Audit events record every governance action with timestamps, roles, and outcomes for
        complete traceability.
      </p>
      <div className="mt-6 overflow-x-auto rounded-2xl border border-white/10">
        <table className="w-full text-left text-xs text-slate-200">
          <thead className="bg-slate-900/70 text-[10px] uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-3 py-2">Timestamp</th>
              <th className="px-3 py-2">Actor role</th>
              <th className="px-3 py-2">Action type</th>
              <th className="px-3 py-2">Outcome</th>
            </tr>
          </thead>
          <tbody>
            {[
              {
                timestamp: "2025-12-12 09:14:22",
                role: "Admin",
                action: "Source policy updated",
                outcome: "Approved",
              },
              {
                timestamp: "2025-12-12 09:08:05",
                role: "Analyst",
                action: "Scoring weights revised",
                outcome: "Logged",
              },
              {
                timestamp: "2025-12-11 18:42:11",
                role: "Compliance",
                action: "Seat audit exported",
                outcome: "Completed",
              },
            ].map((entry) => (
              <tr key={`${entry.timestamp}-${entry.action}`} className="border-t border-white/10">
                <td className="px-3 py-2">{entry.timestamp}</td>
                <td className="px-3 py-2">{entry.role}</td>
                <td className="px-3 py-2">{entry.action}</td>
                <td className="px-3 py-2">{entry.outcome}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  </div>
);

const TourEnterpriseSeats = () => {
  const { enterpriseUsers, addEnterpriseUser } = useDemoTour();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("Viewer");

  const handleAdd = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmedName = name.trim();
    const trimmedEmail = email.trim();
    if (!trimmedName || !trimmedEmail) return;
    addEnterpriseUser({
      id: `${trimmedEmail}-${enterpriseUsers.length + 1}`,
      name: trimmedName,
      email: trimmedEmail,
      role,
    });
    setName("");
    setEmail("");
    setRole("Viewer");
  };

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-4 py-6 md:px-6">
      <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
        <h2 className="text-xl font-semibold">Role &amp; Seat Management</h2>
        <p className="mt-2 text-sm text-slate-200">
          Add team members, assign roles, and keep seat usage aligned with governance policies.
        </p>
        <form className="mt-6 grid gap-4 md:grid-cols-3" onSubmit={handleAdd}>
          <label className="text-sm">
            Name
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm">
            Email
            <input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm">
            Role
            <select
              value={role}
              onChange={(event) => setRole(event.target.value)}
              className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm"
            >
              {["Admin", "Compliance", "Analyst", "Viewer"].map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <div className="md:col-span-3">
            <button
              type="submit"
              className="rounded-full bg-amber-300 px-5 py-2 text-xs font-semibold text-slate-950"
            >
              Add seat
            </button>
          </div>
        </form>
      </div>
      <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
        <h3 className="text-lg font-semibold">Active seats</h3>
        <div className="mt-4 overflow-x-auto rounded-2xl border border-white/10">
          <table className="w-full text-left text-xs text-slate-200">
            <thead className="bg-slate-900/70 text-[10px] uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Email</th>
                <th className="px-3 py-2">Role</th>
              </tr>
            </thead>
            <tbody>
              {enterpriseUsers.map((user) => (
                <tr key={user.id} className="border-t border-white/10">
                  <td className="px-3 py-2">{user.name}</td>
                  <td className="px-3 py-2">{user.email}</td>
                  <td className="px-3 py-2">{user.role}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

const TourEnterpriseUpgradeCta = () => (
  <div className="mx-auto w-full max-w-4xl px-4 py-10 md:px-6">
    <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-slate-900/80 to-slate-950/80 p-8">
      <p className="text-xs uppercase tracking-[0.3em] text-emerald-200">Enterprise</p>
      <h2 className="mt-3 text-2xl font-semibold">Contact sales for enterprise rollout</h2>
      <p className="mt-3 text-sm text-slate-200">
        Enterprise support covers onboarding, contracts, security reviews, and SLAs. Connect
        with sales to tailor an agreement that matches your procurement and compliance needs.
      </p>
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="rounded-full bg-amber-300 px-5 py-2 text-xs font-semibold text-slate-950"
        >
          Contact enterprise sales
        </button>
        <button
          type="button"
          className="rounded-full border border-white/20 px-5 py-2 text-xs font-semibold text-white"
        >
          Review enterprise support
        </button>
      </div>
    </div>
  </div>
);

const TourNdaPreview = () => {
  const { ndaAccepted, setNdaAccepted } = useDemoTour();
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 md:px-6">
      <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
        <h2 className="text-xl font-semibold">Mutual NDA Preview</h2>
        <div className="mt-4 space-y-3 rounded-2xl border border-white/10 bg-slate-900/70 p-4 text-sm text-slate-200">
          <p className="font-semibold text-slate-100">Section 1: Confidentiality</p>
          <p>
            Buyer agrees to keep seller information confidential and to use it only for
            evaluation purposes. Unauthorized disclosure is prohibited.
          </p>
          <p className="font-semibold text-slate-100">Section 2: Term</p>
          <p>
            The confidentiality term remains in effect for 24 months from the acceptance
            date.
          </p>
          <p className="font-semibold text-slate-100">Section 3: Exclusions</p>
          <p>
            Information already public, independently developed, or obtained lawfully is
            excluded from this NDA.
          </p>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <input
            id="nda-accept"
            type="checkbox"
            checked={ndaAccepted}
            onChange={(event) => setNdaAccepted(event.target.checked)}
            className="h-4 w-4 accent-amber-300"
          />
          <label htmlFor="nda-accept" className="text-sm">
            I Accept
          </label>
        </div>
      </div>
    </div>
  );
};

const TourEmailComposer = () => {
  const { contactEmailDraft, setContactEmailDraft, lastActionMessage, setLastActionMessage } =
    useDemoTour();

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 md:px-6">
      <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
        <h2 className="text-xl font-semibold">Message Seller</h2>
        <div className="mt-4 space-y-4">
          <label className="block">
            <span className="text-xs uppercase tracking-wide text-slate-300">Subject</span>
            <input
              type="text"
              value={contactEmailDraft.subject}
              onChange={(event) =>
                setContactEmailDraft({
                  ...contactEmailDraft,
                  subject: event.target.value,
                })
              }
              className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-slate-100"
            />
          </label>
          <label className="block">
            <span className="text-xs uppercase tracking-wide text-slate-300">Body</span>
            <textarea
              value={contactEmailDraft.body}
              onChange={(event) =>
                setContactEmailDraft({
                  ...contactEmailDraft,
                  body: event.target.value,
                })
              }
              rows={6}
              className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-slate-100"
            />
          </label>
          <button
            type="button"
            onClick={() => setLastActionMessage("Demo: message queued via EasyFinder.")}
            className="rounded-full bg-amber-300 px-5 py-2 text-xs font-semibold text-slate-950"
          >
            Send
          </button>
          {lastActionMessage ? (
            <p className="text-xs text-emerald-200">{lastActionMessage}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
};

const TourWatchlistPreview = () => {
  const watchlist = useDemoWatchlist();
  const listing = demoListings[0];

  return (
    <div className="space-y-6">
      <div className="mx-auto w-full max-w-5xl px-4 pt-6 md:px-6">
        <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
          <h2 className="text-xl font-semibold">Watchlist Preview</h2>
          <p className="mt-2 text-sm text-slate-200">
            Save listings to revisit later and share with procurement teams.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => {
                if (listing?.id) {
                  watchlist.add(listing.id);
                }
              }}
              className="rounded-full border border-amber-200/60 px-4 py-2 text-xs font-semibold text-amber-100"
            >
              Add a listing to watchlist
            </button>
            <span className="text-xs text-slate-300">
              Plan limit: 50 saved listings (demo preview).
            </span>
          </div>
        </div>
      </div>
      <DemoWatchlist />
    </div>
  );
};

const TourUpgradeCta = () => (
  <div className="mx-auto w-full max-w-4xl px-4 py-10 md:px-6">
    <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-slate-900/80 to-slate-950/80 p-8">
      <p className="text-xs uppercase tracking-[0.3em] text-amber-200">Upgrade</p>
      <h2 className="mt-3 text-2xl font-semibold">Unlock enterprise controls</h2>
      <p className="mt-3 text-sm text-slate-200">
        Move from demo to production with enterprise-grade sourcing, approvals, and
        governance. Upgrade plans unlock deeper integrations, higher limits, and dedicated
        support.
      </p>
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="rounded-full bg-amber-300 px-5 py-2 text-xs font-semibold text-slate-950"
        >
          Request upgrade
        </button>
        <button
          type="button"
          className="rounded-full border border-white/20 px-5 py-2 text-xs font-semibold text-white"
        >
          Compare plans
        </button>
      </div>
    </div>
  </div>
);
