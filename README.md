# vendorverification

In-Sync Vendor Verification — financial due diligence platform for vendor commitments. KYC verification (Credit Score, Bank Statement, GST, PAN), document upload with AI tampering detection, multi-tenant org workflows, and a public/partner API.

**Production:** https://vendor.in-sync.co.in

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

1. Builds the frontend and publishes `dist/` to Cloudflare Pages (`vendorverification-sync`, domain `vendor.in-sync.co.in` (old `vendorverification.` URL 301-redirects)).
2. Applies any new SQL migrations via the Supabase Management API (`scripts/deploy-migrations.mjs`).
3. Re-deploys all edge functions via the Supabase Management API (`scripts/deploy-functions.mjs`).

All deploys go through Actions on push to `main` — there is no manual Wrangler/CLI fallback.

## Environment

Local development needs a `.env` file (gitignored). `.env.production` (committed) holds only the public Vite keys needed at build time. Secret tokens live only in `.env` locally and in CI secrets — never in source.
