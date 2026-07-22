# Yaslynn Rivera portfolio

The gallery scene is stored in `src/content/environment.json`. Production 3D models are served from Cloudflare R2; `NEXT_PUBLIC_R2_ASSET_BASE_URL` selects the immutable release at build time.

## Getting Started

First, run the development server:

```bash
npm run dev
```

Open [http://localhost:3001](http://localhost:3001).

## Production 3D assets

Only models referenced by the saved scene and their two dependent textures are included. The prepare step writes a content-addressed, Meshopt-compressed release under the gitignored `.r2-assets` directory.

```bash
npm run assets:r2:prepare

YASLYNN_CLOUDFLARE_ACCOUNT_ID=... \
YASLYNN_R2_BUCKET=... \
npm run assets:r2:upload

CLOUDFLARE_ACCOUNT_ID=... \
npx wrangler r2 bucket cors set yaslynn-rivera-portfolio-assets \
  --file config/r2-public-read-cors.json --force
```

The uploader verifies that Wrangler can see the required Cloudflare account before it writes. Point Vercel at the release URL, including its `/releases/yaz-...` suffix:

```bash
NEXT_PUBLIC_R2_ASSET_BASE_URL=https://assets.example.com/releases/yaz-...
```

## Checks

```bash
npm run lint
npm run build
```
