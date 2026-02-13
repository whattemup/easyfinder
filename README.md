# 🚜 EasyFinder

## Intelligent Equipment Discovery & Scoring Platform

*Find the best heavy equipment — faster, smarter, and without middlemen.*

## 🌍 What Is EasyFinder?

EasyFinder is a full-stack platform designed to help buyers and sellers of heavy-duty equipment (construction, industrial, agricultural) connect efficiently.

Instead of bouncing between dealers, auctions, and third-party marketplaces, EasyFinder provides a single destination where:

- Buyers instantly discover the best equipment for their budget.
- Sellers list equipment and reach serious buyers faster.
- The platform intelligently scores and ranks listings.
- Every recommendation is explainable, transparent, and data-driven.

## 🎯 Core Value Proposition

### For Buyers

- One place to search across inventory.
- Instant ranking of best options.
- Price vs condition vs usage scored automatically.
- No dealer pressure or auction friction.

### For Sellers

- Faster exposure to qualified buyers.
- Intelligent positioning of listings.
- Reduced time-to-sale.

### For the Platform

- Commission-based transaction model.
- High-value equipment → meaningful margins.
- Scalable intelligence layer.

## 🧠 What Makes EasyFinder Different?

- ✔ Scoring, not sorting.
- ✔ Explainable rankings.
- ✔ Config-driven intelligence.
- ✔ Built for scale, not MVP hacks.

EasyFinder doesn’t just list equipment — it tells you what’s worth buying and why.

## 🏗️ System Architecture (High Level)

```text
User Browser
     │
     ▼
Frontend (Vercel / Vite + React)
     │
     ▼
Backend API (Fly.io / Fastify)
     │
     ▼
Scoring Engine + Database (MongoDB)
```

## 📁 Repository Structure

```text
easyfinder/
├── apps/
│   ├── api/                # Backend API (Fastify + TypeScript)
│   │   ├── src/
│   │   │   ├── routes/     # API endpoints
│   │   │   ├── scoring/    # Scoring engine
│   │   │   ├── services/   # Business logic
│   │   │   ├── plugins/    # Fastify plugins (JWT, auth)
│   │   │   └── index.ts    # API entry point
│   │   └── tests/
│   └── web/                # Frontend (Vite + React)
│       ├── src/
│       └── dist/
├── packages/
│   └── shared/             # Shared types & utilities
├── .github/workflows/      # CI pipelines
├── Dockerfile              # API container
├── fly.toml                # Fly.io config
├── pnpm-workspace.yaml
└── README.md
```

## Local development (Windows / PowerShell)

### Prerequisites

- Node.js 20.x (matches the Dockerfile runtime)
- pnpm 9.6.0 (`corepack enable` if needed)

### Environment setup

Copy the example files and fill in real values locally:

```powershell
Copy-Item apps/api/.env.example apps/api/.env
Copy-Item apps/web/.env.example apps/web/.env
```

Notes:

- Copy `apps/api/.env.example` to `apps/api/.env` for local development, then fill in your local values (`JWT_SECRET`, `MONGO_URL`, `DB_NAME`).
- `apps/web/.env` should set `VITE_API_BASE_URL` (recommended: `http://127.0.0.1:8080`).
- **Never commit `.env` files.** Use `.env.example` templates and keep real secrets in your platform secret manager.

### Clean install + build

```powershell
pnpm clean
pnpm install
pnpm -r build
```

### Run dev (API + Web)

Single command (turbo runs both in parallel):

```powershell
pnpm dev
```

Two terminals (if you prefer separate logs):

```powershell
pnpm --filter @easyfinderai/api dev
pnpm --filter @easyfinderai/web dev
```

### Verify locally

- Web: http://127.0.0.1:5173
- API health: http://127.0.0.1:8080/api/health

Vercel note: set `VITE_API_BASE_URL` as the host-only API origin (e.g. `https://easyfinder.fly.dev`) without `/api`.

## ⚙️ Tech Stack

### Backend

- Node.js
- Fastify
- TypeScript
- JWT Authentication
- MongoDB
- Docker
- Fly.io

### Frontend

- React
- Vite
- TypeScript
- Vercel

### Tooling

- pnpm workspaces
- ESLint
- TypeScript strict mode
- GitHub Actions (CI)

## 🔌 Live Endpoints (Current)

### Health

- **GET** `/api/health`
- ✔ API up
- ✔ Database connected

### Listings (Core Feature)

- **GET** `/api/listings`

Returns:

- Equipment listings
- Total score
- Score breakdown
- Human-readable rationale

### Scoring Configuration

- **GET** `/api/scoring-configs`

Shows:

- Active weights
- Preferred states
- Price & hour thresholds

### Watchlist

- **GET** `/api/watchlist`

(Currently stubbed for future expansion)

## 🧮 Scoring Engine

The scoring engine is the heart of EasyFinder.

### What It Does

- Evaluates each listing.
- Applies configurable weights.
- Produces:
  - `totalScore`
  - Component scores
  - Clear explanations

### Why It Matters

- No black boxes.
- Buyers understand recommendations.
- Admins can tune behavior without redeploying code.

## 🔐 Authentication (Planned, Partially Wired)

Role system exists:

- `demo`
- `buyer`
- `seller`
- `admin`

JWT infrastructure is in place.
Routes will be enabled after product vision is finalized.

## 🚀 Deployment

### Backend (Fly.io)

- Dockerized
- Internal port: 8080
- HTTPS via Fly proxy

## 🔐 Environment Variables

EasyFinder uses environment variables for configuration.

**Never commit real secrets** to the repository.
Use `.env` files locally and **Fly/Vercel secrets** in production.

### Backend (Fly.io / `apps/api`)

Required:

| Variable | Description | Example |
|---|---|---|
| `MONGO_URL` | Mongo connection string | `mongodb+srv://user:pass@cluster...` |
| `DB_NAME` | Database name | `easyfinder` |
| `JWT_SECRET` | JWT signing secret (**min 16 chars**) | `a-very-long-random-string` |
| `CORS_ORIGINS` | Comma-separated allowed origins | `https://easyfinderai.vercel.app,http://localhost:5173` |
| `PORT` | API port (default 8080) | `8080` |

Set Fly secrets:

```bash
fly secrets set \
  MONGO_URL="..." \
  DB_NAME="easyfinder" \
  JWT_SECRET="..." \
  CORS_ORIGINS="https://easyfinderai.vercel.app"
```

### Frontend (Vercel)

- Root directory: `apps/web`
- Build output: `dist`
- Variable: `VITE_API_BASE_URL`
- Description: API base URL (host-only, no `/api`)
- Example: `https://easyfinder.fly.dev`

## 🧪 CI / Quality Gates

CI runs on every PR and main branch push.

Checks include:

- Linting
- Type checking
- Build validation

The goal: keep the codebase clean and predictable.

## 📌 Current Project Status

- ✅ Backend live
- ✅ Frontend live
- ✅ Scoring engine operational
- ✅ CI configured
- ⚠️ Auth & transactions intentionally deferred

This is a stable foundation, not a prototype.

## 🛣️ Roadmap (High Level)

### Phase 1 — Vision Lock

- Finalize buyer/seller flows
- Define commission model
- Lock scoring philosophy

### Phase 2 — Core Expansion

- Seller onboarding
- Auth flows
- Admin dashboards

### Phase 3 — Intelligence

- Smarter scoring
- Market trend analysis
- Deal recommendations

## 📄 Documentation Index

- `README.md` → This file
- `PRODUCT_VISION.md` → Product direction & goals
- `SYSTEM_OVERVIEW.md` → Architecture & internals
- (Planned) `SCORING_MODEL.md`
- (Planned) `API_REFERENCE.md`

## 🤝 Contribution Philosophy

- Clean code > fast hacks
- Explainability > cleverness
- Architecture before scale
- No noise, no bloat

## 🧠 Final Note

EasyFinder is built to become the intelligent layer between buyers, sellers, and the heavy-equipment market.

Not a listing site.
Not an auction clone.
A decision engine.
