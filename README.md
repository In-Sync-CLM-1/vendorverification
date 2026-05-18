# vendor-empanelment

In-Sync Vendor Empanelment — financial due diligence platform for vendor commitments. KYC verification (Credit Score, Bank Statement, GST, PAN, Aadhaar), document upload with AI tampering detection, multi-tenant org workflows, and a public/partner API.

**Production:** https://vendorverification.in-sync.co.in

## Stack

- **Frontend:** Vite + React + TypeScript + Tailwind + shadcn-ui
- **Backend:** Supabase (Postgres + Auth + Edge Functions + Storage)
- **AI:** Anthropic Claude Haiku 4.5 (document analysis & tamper detection)
- **External APIs:** Surepass (KYC), Exotel (WhatsApp), Resend (Email)

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

Frontend deploys to Cloudflare Pages (project `vendorverification-sync`, domain `vendorverification.in-sync.co.in`):

```sh
npm run build
npx wrangler pages deploy dist --project-name=vendorverification-sync --branch=main
```

Backend (Supabase edge functions and migrations) is deployed separately via the Supabase Management API.

## Environment

Local development needs a `.env` file (gitignored). `.env.production` (committed) holds only the public Vite keys needed at build time. Secret tokens live only in `.env` locally and in CI secrets — never in source.
