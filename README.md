# Market exploration — Walllet feature prototype

An AI-assisted exploration of **TanStack Start + Effect v3**, built to answer one question: *what could the Walllet website add so that "invest" and "holdings" content leads somewhere, instead of dead-ending at the FAQ page?*

The answer this prototype argues for is a **historical "what if" widget**. Pick a market, pick a period, enter an amount, and see what that fixed sum would have become — answered with live data rather than a projection.

> **Status: prototype.** This is an exploration, not a shipping feature. Numbers
> are historical observations about past prices, never a projection, a
> recommendation, or financial advice.

## What it does

- 10 markets (2 ETFs, 6 stocks, 2 crypto) with real logos.
- 1Y / 3Y / 5Y of **adjusted close** history — splits and dividends accounted for.
- Fixed-amount simulation rebased to the starting principal.
- UI matched to the Walllet demo prototype, running on live data.

## Stack

| Concern | Choice |
| --- | --- |
| App framework | TanStack Start `1.168.60`, TanStack Router (file-based) |
| Effect | `effect@3`, `@effect-atom/atom-react`, `@effect/rpc` |
| Charts | Recharts 3 |
| Components | shadcn on Base UI, light theme only |
| Styling | Tailwind v4, theme tokens in `src/styles.css` |
| Tooling | Oxlint + Oxfmt, bun `1.4.2` |

## Getting started

```bash
bun install
bun run dev        # http://localhost:3000
```

**Requires Node 22.** System Node 20 breaks `vite build` — rolldown needs `styleText`.

Copy `.env.example` to `.env` and add your keys:

```bash
ALPHAVANTAGE_API_KEY='...'
```

## Data and quota

Prices come from **Alpha Vantage**, which on the free tier allows **25 requests per day**. That constraint shaped the provider design:

- **Weekly adjusted series only.** The free tier blocks `TIME_SERIES_DAILY_ADJUSTED` and caps unadjusted daily data at 100 points; `TIME_SERIES_WEEKLY_ADJUSTED` is free and carries genuine split/dividend adjustments.
- **Full series cached for 12h per symbol**, so switching 1Y/3Y/5Y costs nothing.
- **Requests spaced 1.25s apart**, since the free tier rejects bursts.

**Iterating on the UI will burn the quota** — the cache does not survive HMR, so each server-side edit refetches all 10 symbols. Use the fixture provider:

```bash
MARKET_PROVIDER=stub   # in .env
```

`bun run logos` re-resolves the market logos. They are committed to `public/logos` with a `manifest.json`, so **no logo API is called at runtime**.
The resolver is idempotent and reuses existing files.

## Scripts

| Script | Purpose |
| --- | --- |
| `bun run dev` | Dev server on port 3000 |
| `bun run build` | Production build to `.output/` |
| `bun run preview` | Serve the production build |
| `bun run lint` | Oxlint |
| `bun run format` | Oxfmt, then Oxlint `--fix` |
| `bun run check` | Oxfmt `--check` |
| `bun run logos` | Re-resolve logo assets |
| `bun run generate-routes` | Regenerate the route tree |

> `bun run lint` and `run check` are red repo-wide because `.agents/` holds
> third-party skill markdown. Scope them with `--ignore-pattern ".agents/**"`.

## Architecture

```
src/api/                     domain schemas + RPC contract (shared client/server)
src/routes/api/-lib/         provider adapter, service layer, RPC wiring
src/routes/-index/           atoms, panel, chart, amount input
src/components/ui/           shadcn/Base UI primitives
scripts/resolve-logos.ts     build-time logo resolver (Effect + BunContext)
public/logos/                committed logo assets + manifest
```

Two contracts are deliberately frozen — change them only with a reason:

1. **The RPC surface is exactly two calls:** `market_list` and `market_history({ id, period })`. There is no `get(id)`; the list already carries full metadata.
2. **`PricePoint.price` always means adjusted close.** The raw `close` field is never silently substituted.

Layering runs `AlphaVantageProvider → MarketsService → RPC → atoms → UI`, so the UI never sees a provider-specific shape. Provider errors are mapped to `MarketDataUnavailable` at the adapter boundary.

## Status

Landed: brand palette and motion tokens, Recharts with gated draw-in, count-up figures, staggered panel reveal gated on first fetch, sliding period pill, mobile layout pass.

Open:

- The full 10-market × 3-period matrix has not been run against live data — it is blocked on the daily quota reset. The crypto weekly-series fix in particular is confirmed against the raw API but not verified end to end.
- The panel's SSR path always renders loaders, because only `markets` is dehydrated into the document. Fine for a prototype, worth revisiting if this ever ships.
