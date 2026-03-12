# Entradas — Phase 1 Setup & Deployment Guide

## Overview

Phase 1 includes:
- Admin login (NextAuth credentials)
- Excel workbook upload + import (SheetJS)
- Financial summary dashboard (KPIs, charts, tables)

---

## Tech Stack

| Layer       | Technology                          |
|-------------|-------------------------------------|
| Framework   | Next.js 16 (App Router)             |
| Language    | TypeScript                          |
| Styling     | Tailwind CSS v4                     |
| Database    | PostgreSQL                          |
| ORM         | Prisma v7                           |
| Auth        | NextAuth v4 (Credentials provider)  |
| Excel parse | SheetJS / xlsx                      |
| Charts      | Recharts                            |

---

## Local Development

### 1. Prerequisites

- Node.js 18+
- PostgreSQL 14+ running locally (or a hosted instance)

### 2. Install dependencies

```bash
cd app
npm install
```

### 3. Configure environment

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

Key variables:

```env
DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/entradas?schema=public"
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="<run: openssl rand -base64 32>"
ADMIN_EMAIL="admin@entradas.local"
ADMIN_PASSWORD="your-secure-password"
```

> **Note:** Prisma 7 reads `DATABASE_URL` from the environment directly via `prisma.config.ts`. The schema.prisma file does **not** contain the URL.

### 4. Set up the database

```bash
# Push schema (development — no migration history)
npm run db:push

# OR use migrations (recommended for production)
npm run db:migrate
```

### 5. Seed the admin user

```bash
npm run db:seed
```

This creates the admin account using `ADMIN_EMAIL` and `ADMIN_PASSWORD` from `.env`.

### 6. Start the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — you'll be redirected to `/login`.

---

## Excel Workbook Format

The importer expects an `.xlsx` / `.xls` file with two sheets:

### Sheet: `Ticket Data`

| Column | Description | Required |
|---|---|---|
| Event / Event Name | Name of the event | Yes |
| Date / Event Date | Event date | No |
| Venue / Location | Venue name | No |
| Section / Sec | Seat section | No |
| Row | Seat row | No |
| Seats / Seat | Seat number(s) | No |
| Quantity / Qty | Number of tickets | No |
| **Total Cost** | Purchase cost (spend) | Yes |
| **Income** | Sale proceeds (revenue) | Yes |
| **Profit** | Income minus cost | Yes |
| Platform / Marketplace | Resale platform | No |
| Account | Seller account name | No |
| Status | Sold / Listed / Pending / Cancelled | No |

### Sheet: `Expenses`

| Column | Description | Required |
|---|---|---|
| Date | Expense date | No |
| Description / Note | What the expense is for | No |
| Category / Type | Expense category | No |
| **Amount** | Expense amount | Yes |

> Column matching is **case-insensitive** and whitespace-tolerant. Minor naming variations (e.g. "event name" vs "Event Name") are handled automatically.

---

## Dashboard KPI Definitions

| KPI | Source | Formula |
|---|---|---|
| Total Spend | Ticket Data | `SUM(Total Cost)` |
| Revenue | Ticket Data | `SUM(Income)` |
| Profit on Sales | Ticket Data | `SUM(Profit)` |
| Extra Expenses | Expenses | `SUM(Amount)` |
| Total Expenses | Computed | `Total Spend + Extra Expenses` |
| Net Income | Computed | `Revenue − Total Expenses` |

All KPIs are calculated from raw imported data — **not** from any "Financial Summary" sheet.

---

## Production Deployment (Vercel + Neon / Supabase)

### 1. Provision a PostgreSQL database

- [Neon](https://neon.tech) — serverless Postgres, generous free tier
- [Supabase](https://supabase.com) — Postgres + extras
- [Railway](https://railway.app)

Copy the connection string (format: `postgresql://USER:PASS@HOST/DB?sslmode=require`).

### 2. Push to GitHub

```bash
git add -A
git commit -m "feat: phase 1 reselling dashboard"
git push
```

### 3. Deploy to Vercel

1. Go to [vercel.com/new](https://vercel.com/new)
2. Import the repository
3. Set **Root Directory** to `app`
4. Add environment variables:
   - `DATABASE_URL` — your hosted Postgres URL
   - `NEXTAUTH_URL` — your Vercel deployment URL (e.g. `https://entradas.vercel.app`)
   - `NEXTAUTH_SECRET` — generate with `openssl rand -base64 32`
5. Click **Deploy**

### 4. Run migrations on production

```bash
# From your local machine, targeting production DB:
DATABASE_URL="<production-url>" npx prisma migrate deploy

# Seed admin user:
DATABASE_URL="<production-url>" ADMIN_EMAIL="admin@yourdomain.com" \
  ADMIN_PASSWORD="secure-password" npm run db:seed
```

Or use Vercel's "Run Command" after deploy.

---

## Project Structure

```
app/
├── prisma/
│   ├── schema.prisma          # DB models: User, TicketData, Expense, ImportBatch
│   └── seed.ts                # Creates initial admin user
├── prisma.config.ts           # Prisma 7 datasource config
├── src/
│   ├── app/
│   │   ├── page.tsx           # Root redirect (→ /login or /dashboard)
│   │   ├── login/page.tsx     # Admin login form
│   │   ├── dashboard/
│   │   │   ├── page.tsx       # Server component — fetches initial data
│   │   │   └── DashboardClient.tsx  # Client shell (tabs, refresh)
│   │   └── api/
│   │       ├── auth/[...nextauth]/route.ts
│   │       ├── dashboard/route.ts   # GET — KPI data
│   │       └── import/
│   │           ├── route.ts         # POST (upload), DELETE (remove batch)
│   │           └── batches/route.ts # GET — import history
│   ├── components/
│   │   ├── Providers.tsx            # SessionProvider wrapper
│   │   └── dashboard/
│   │       ├── KPICard.tsx
│   │       ├── ImportPanel.tsx
│   │       ├── PlatformChart.tsx    # Bar chart (Recharts)
│   │       ├── StatusPie.tsx        # Pie chart (Recharts)
│   │       ├── EventTable.tsx       # Best/Worst events
│   │       └── AccountTable.tsx     # Per-account performance
│   └── lib/
│       ├── prisma.ts          # Prisma client singleton
│       ├── auth.ts            # NextAuth config
│       ├── excel.ts           # SheetJS workbook parser
│       └── dashboard.ts       # KPI query logic
└── .env.example
```

---

## Security Notes

- Change `ADMIN_PASSWORD` and `NEXTAUTH_SECRET` before deploying to production.
- The import endpoint and all API routes are protected by session middleware.
- `.env` is git-ignored — never commit it.

---

## Phase 2 (Not Yet Built)

- Public storefront / listing pages
- Per-event inventory management
- Automated pricing tools
