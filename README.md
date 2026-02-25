# PSX Index & Stock OHLCV API

Serverless API that exposes Pakistan Stock Exchange indices and stocks OHLCV data. Data is scraped from [dps.psx.com.pk](https://dps.psx.com.pk) using `fetch` and Cheerio (no headless browser). Stock OHLCV is sourced from the [Historical Data](https://dps.psx.com.pk/historical) page (with fallback to index constituent pages). Caching uses Vercel Runtime Cache with a 5-minute TTL.

## Routes

| Route | Method | Description |
|-------|--------|-------------|
| `/indices` or `/api/indices` | GET | All indices (OHLCV-style) |
| `/indices/:symbol` or `/api/indices/:symbol` | GET | Single index (e.g. KSE100) |
| `/stocks` or `/api/stocks` | GET | All stocks |
| `/stocks/:symbol` or `/api/stocks/:symbol` | GET | Single stock |

## Local development

```bash
npm install
npm run dev
```

Then open e.g. `http://localhost:3000/indices` or `http://localhost:3000/api/indices`.

## Deploy (Vercel)

```bash
vercel
```

No environment variables are required. Optional: enable [Runtime Cache](https://vercel.com/docs/runtime-cache) in the project settings for 5-minute TTL caching.

## Response shape

- **Indices**: `{ indices: Array<{ symbol, high, low, close, change?, changePercent?, ... }> }`
- **Stocks**: `{ stocks: Array<{ symbol, close, open?, high?, low?, volume?, ... }> }`

Single-resource routes return the object directly (or 404).
