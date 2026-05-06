# EasyFinder — Heavy Equipment Deal Scoring Platform

> B2B SaaS — REST API + React Frontend for heavy equipment deal evaluation.
> BUY / NEGOTIATE / WALK decisions with full TCO math, negotiation simulation, and HMAC-secured scoring.

---

## What It Does

EasyFinder evaluates heavy equipment listings and tells buyers exactly what to do:

- **BUY** — ROI >= 20% after all acquisition costs
- **NEGOTIATE** — ROI 8-20%, with 3-round counter-offer simulation
- **WALK** — Negative ROI or non-operable below threshold

Every decision includes full cost breakdown: auction premiums, transport, condition-based repair estimates, wear penalties, and fair value derivation from market benchmarks.

---

## Stack

| Layer | Tech |
|---|---|
| API | Fastify + TypeScript (Node.js) |
| Database | PostgreSQL |
| Frontend | React + Vite + TanStack Query |
| Auth | JWT + role-based rate limiting |
| Billing | Stripe (scaffolded) |
| Monorepo | pnpm workspaces |
| Tests | Vitest — 15 passing |

---

## Architecture

```
EasyFinder/
├── apps/
│   ├── api/                  # Fastify REST API (port 8080)
│   │   └── src/
│   │       ├── server.ts     # App bootstrap, plugins, routes
│   │       ├── config.ts     # Env config
│   │       ├── db.ts         # PostgreSQL pool + queries
│   │       ├── lib/
│   │       │   ├── dealEngine.ts   # Core TCO + decision engine
│   │       │   └── verifyHmac.ts   # HMAC anti-cheat
│   │       └── routes/
│   │           ├── deal.ts         # POST /api/deal/evaluate
│   │           ├── listings.ts     # GET /api/listings
│   │           ├── auth.ts         # JWT auth
│   │           ├── payments.ts     # Stripe billing
│   │           └── ...
│   └── web/                  # React frontend (Vite)
│       └── src/
│           ├── pages/        # Dashboard, Demo, Listings, Watchlist...
│           └── components/
└── packages/
    └── shared/               # Scoring engine, types, Zod schemas
        └── src/
            ├── scoring.ts    # scoreListing() — locked policy weights
            └── types.ts
```

---

## API Reference

### POST /api/deal/evaluate

Evaluate a listing. Returns BUY/NEGOTIATE/WALK decision with full cost breakdown.

Request:
```json
{
  "listing_id": "demo-bd-001",
  "asking_price": 142000,
  "category": "bulldozer",
  "hours": 2100,
  "condition": "good",
  "operable": true,
  "distance_miles": 150,
  "market_p50": 155000,
  "market_p90": 200000,
  "is_auction": false
}
```

HMAC Protection (optional):
Pass x-hmac-token header with HMAC-SHA256(listing_id:asking_price, HMAC_SECRET).

### GET /api/listings

Returns scored listings. Query params: state, maxPrice, maxHours, operable.

### GET /api/status

Full subsystem health: DB, scoring config, sources, env vars.

### GET /api/deal/health

Liveness probe for deal engine.

---

## Scoring Model

Weights are locked policy:

| Component | Weight |
|---|---|
| Price vs benchmark | 0.35 |
| Hours vs benchmark | 0.35 |
| Location preference | 0.20 |
| Risk signals | 0.10 |

Per-category benchmarks:

| Category | Price p50 | Price p90 | Hours p50 | Hours p90 |
|---|---|---|---|---|
| Excavator | $90,000 | $160,000 | 3,000 | 7,000 |
| Wheel Loader | $75,000 | $140,000 | 3,500 | 7,500 |
| Bulldozer | $100,000 | $180,000 | 3,000 | 7,000 |
| Crane | $150,000 | $300,000 | 2,500 | 6,000 |
| Forklift | $18,000 | $40,000 | 4,000 | 9,000 |
| Skid Steer | $25,000 | $55,000 | 2,500 | 6,000 |

---

## Setup

Requirements: Node.js 18+, pnpm 9+, PostgreSQL 14+

Install:
```bash
git clone <repo>
cd EasyFinder
pnpm install
```

Environment — edit apps/api/.env:
```
DATABASE_URL=postgresql://postgres@localhost/easyfinder
JWT_SECRET=<32 byte hex>
HMAC_SECRET=<32 byte hex>
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PRICE_ID=price_...
STRIPE_WEBHOOK_SECRET=whsec_...
CORS_ORIGINS=http://localhost:5173
DEMO_MODE=true
```

Generate secrets:
```bash
node -e "const {randomBytes}=require('crypto');console.log(randomBytes(32).toString('hex'));"
```

Database:
```bash
psql -U postgres -c "CREATE DATABASE easyfinder;"
node apps/api/seed.cjs
```

Run:
```bash
pnpm --filter @easyfinderai/api dev   # port 8080
pnpm --filter @easyfinderai/web dev   # port 5173
```

Build:
```bash
pnpm --filter @easyfinderai/shared build
pnpm --filter @easyfinderai/api build
pnpm --filter @easyfinderai/web build
```

Test:
```bash
pnpm --filter @easyfinderai/shared test
# 15/15 passing
```

---

## Frontend Routes

| Path | Description |
|---|---|
| / | Landing page |
| /demo | Live demo — no login required |
| /demo/listings/:id | Listing detail + deal eval |
| /demo/watchlist | Demo watchlist |
| /demo/broker | Broker chat |
| /listings | Authenticated listing feed |
| /scoring | Scoring config editor |
| /seller | Seller dashboard |
| /upgrade | Stripe billing |

---

## Revenue Model

- Buyer SaaS: $49-149/mo per seat
- Seller tier: $99/mo — listing analytics + lead insights
- Enterprise: Custom white-label scoring API

Stripe billing scaffolded in /api/payments. Add price ID and webhook secret to activate.

---

## Built vs Opportunity

Built:
- Deal engine (TCO, negotiation, BUY/NEGOTIATE/WALK)
- HMAC anti-cheat token validation
- JWT auth with role-based rate limiting
- PostgreSQL with 30 seeded listings
- React frontend with demo mode
- 15 passing tests
- Stripe billing scaffold

Opportunity for buyer:
- Live data feeds (MachineryTrader, IronPlanet, RitchieBros)
- Email alerts on watchlisted listings
- Mobile app (API-first architecture ready)
- White-label dealer portal

---

## ARM64 / Termux Note

Built and runs on Android (Termux, aarch64). Turborepo is configured but non-functional on ARM64 — use pnpm --filter directly. All crypto uses Node.js crypto module.
