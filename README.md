# vendorverification

In-Sync Vendor Verification — financial due diligence platform for vendor commitments. KYC verification (Credit Score, Bank Statement, GST, PAN, Aadhaar), document upload with AI tampering detection, multi-tenant org workflows, and a public/partner API.

**Production:** https://vendorverification.in-sync.co.in

## Stack

- **Frontend:** Vite + React + TypeScript + Tailwind + shadcn-ui
- **Backend:** Supabase (Postgres + Auth + Edge Functions + Storage)
- **AI:** Groq (Llama 4 Scout for vision, Llama 3.3 70B for text) — document analysis & tamper detection
- **External APIs:** Surepass (KYC), Exotel (WhatsApp), Resend (Email), Razorpay (Billing)

## Local development

```sh
npm install
npm run dev    # http://localhost:8080
```

## Build & test

```sh
npm run build
npm run test
npm run lint
```

## Deploy

Every push to `main` triggers `.github/workflows/deploy.yml`, which:

1. Builds the frontend and publishes `dist/` to Cloudflare Pages (`vendorverification-sync`, domain `vendorverification.in-sync.co.in`).
2. Applies any new SQL migrations via the Supabase Management API (`scripts/deploy-migrations.mjs`).
3. Re-deploys all edge functions via the Supabase Management API (`scripts/deploy-functions.mjs`).

Manual fallback if Actions is unavailable:

```sh
npm run build
npx wrangler pages deploy dist --project-name=vendorverification-sync --branch=main
SUPABASE_ACCESS_TOKEN=… node scripts/deploy-migrations.mjs
SUPABASE_ACCESS_TOKEN=… node scripts/deploy-functions.mjs
```

## Environment

Local development needs a `.env` file (gitignored). `.env.production` (committed) holds only the public Vite keys needed at build time. Secret tokens live only in `.env` locally and in CI secrets — never in source.
