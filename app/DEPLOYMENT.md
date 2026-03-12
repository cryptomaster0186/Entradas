# Deployment Guide — Entradas

This guide walks you through deploying the app publicly on Vercel so your friends can log in with a normal link.

---

## Overview

| Step | What |
|------|------|
| 1 | Create a PostgreSQL database (Neon — free) |
| 2 | Push the code to GitHub |
| 3 | Import the project into Vercel |
| 4 | Set environment variables |
| 5 | Deploy |
| 6 | Run the database schema migration |
| 7 | Seed the admin account |
| 8 | Add accounts for your friends |
| 9 | Share the link |

---

## Step 1 — Create a PostgreSQL database

**Recommended: [Neon](https://neon.tech)** (free tier, works perfectly with Vercel)

1. Go to [neon.tech](https://neon.tech) and create a free account.
2. Create a new project → choose a region close to you.
3. Copy the **Connection string** from the dashboard. It looks like:
   ```
   postgresql://user:pass@ep-xxx-yyy.us-east-2.aws.neon.tech/neondb?sslmode=require
   ```
4. Keep this string — you'll need it as `DATABASE_URL` in the next steps.

> **Alternative:** Supabase also works. Use the "Direct connection" string (not the pooler) from Project Settings → Database.

---

## Step 2 — Push code to GitHub

If you haven't already:

```bash
git add .
git commit -m "production-ready"
git push origin main
```

---

## Step 3 — Import into Vercel

1. Go to [vercel.com](https://vercel.com) and sign in with GitHub.
2. Click **"Add New Project"** → Import your repository.
3. Vercel will auto-detect Next.js — leave all build settings as-is.
4. **Do not deploy yet** — add environment variables first (next step).

---

## Step 4 — Set environment variables in Vercel

In Vercel → Your project → **Settings → Environment Variables**, add these:

| Variable | Value | Notes |
|----------|-------|-------|
| `DATABASE_URL` | `postgresql://user:pass@host/db?sslmode=require` | From Neon/Supabase |
| `NEXTAUTH_URL` | `https://your-app.vercel.app` | Your exact Vercel URL (set AFTER first deploy) |
| `NEXTAUTH_SECRET` | (random string) | Run: `openssl rand -base64 32` |
| `GOOGLE_SHEET_ID` | `1UxP652ru_KktFQQ08RKcEQOcIj-ybJZA` | Your sheet ID |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | `your-sa@project.iam.gserviceaccount.com` | From Google Cloud |
| `GOOGLE_PRIVATE_KEY` | `"-----BEGIN RSA PRIVATE KEY-----\n..."` | From JSON key file |
| `CRON_SECRET` | (random string) | Optional — protects scheduled sync |

### Generating secrets

```bash
# NEXTAUTH_SECRET
openssl rand -base64 32

# CRON_SECRET
openssl rand -base64 32
```

### About NEXTAUTH_URL

- **First deploy:** Vercel will give you a URL like `https://entradas-abc123.vercel.app`.
- After you see the URL, go back to **Settings → Environment Variables** and set `NEXTAUTH_URL` to that exact URL.
- Redeploy once after setting it (Settings → Deployments → Redeploy).

> If you add a custom domain later, update `NEXTAUTH_URL` to match the custom domain.

---

## Step 5 — Deploy

Click **Deploy** in Vercel. The first build will take ~2 minutes.

---

## Step 6 — Run the database schema migration

After deploying, push the Prisma schema to your production database:

```bash
# From your local machine (with DATABASE_URL set in .env)
cd app
npm run db:push
```

Or use the Vercel CLI if you prefer:
```bash
npx vercel env pull .env.local  # pulls production env vars locally
DATABASE_URL="<your-neon-url>" npm run db:push
```

This creates all tables in Neon. It is safe to run multiple times.

---

## Step 7 — Seed the admin account

Create your admin user:

```bash
# In your .env set:
# ADMIN_EMAIL=your@email.com
# ADMIN_PASSWORD=yourStrongPassword

npm run db:seed
```

Or use the create-user script directly:

```bash
npm run user:create your@email.com yourStrongPassword admin
```

---

## Step 8 — Add accounts for your friends

### Option A — From the dashboard (easiest)

1. Log in to your deployed app.
2. Go to the **Users** tab in the top navigation.
3. Fill in your friend's email, a temporary password, and select role **Viewer**.
4. Click **Create User**.
5. Send them the link and their temporary credentials.

### Option B — From the command line

```bash
# Viewer account (can view dashboard, cannot sync or import)
npm run user:create friend@example.com temporarypass123 viewer

# Admin account (full access)
npm run user:create colleague@example.com temporarypass123 admin
```

### Roles explained

| Role | Can do |
|------|--------|
| **Admin** | View dashboard, trigger sync, upload Excel, manage users |
| **Viewer** | View dashboard only (read-only) |

---

## Step 9 — Share the link

Send your friends:

```
URL:      https://your-app.vercel.app
Email:    the email you set for them
Password: the temporary password you set
```

They open the URL, click through to login, enter the credentials, and they're in.

---

## Environment variables — full list

```env
# Required
DATABASE_URL=postgresql://user:pass@host/db?sslmode=require
NEXTAUTH_URL=https://your-app.vercel.app
NEXTAUTH_SECRET=<run: openssl rand -base64 32>

# For seeding only (not needed in Vercel)
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=your-strong-password

# Google Sheets sync
GOOGLE_SHEET_ID=your-sheet-id
GOOGLE_SERVICE_ACCOUNT_EMAIL=sa@project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----\n"

# Optional
CRON_SECRET=<run: openssl rand -base64 32>
```

---

## Updating the app

```bash
git add .
git commit -m "your change"
git push origin main
```

Vercel auto-deploys on every push to `main`.

---

## Troubleshooting

### Login not working after deploy

Make sure `NEXTAUTH_URL` exactly matches your Vercel deployment URL (including `https://`, no trailing slash).

### Database connection errors

- Confirm `DATABASE_URL` includes `?sslmode=require` (required for Neon/Supabase).
- Run `npm run db:push` again — it's idempotent.

### Google Sheets sync failing

- Ensure the service account has been shared as an Editor on the Google Sheet.
- Make sure `GOOGLE_PRIVATE_KEY` in Vercel has the `\n` literal newlines (not actual newlines).
- In Vercel env vars, paste the key **with** the surrounding quotes.

### Prisma generate errors on Vercel

The `postinstall` script in `package.json` runs `prisma generate` automatically on every Vercel build. No extra action needed.
