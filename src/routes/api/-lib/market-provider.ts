import * as MarketsSchema from '#/api/market-schema'
import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Schema from 'effect/Schema'

export type MarketProviderError =
  | MarketsSchema.MarketNotFound
  | MarketsSchema.MarketDataUnavailable

export interface MarketProviderShape {
  readonly list: Effect.Effect<
    ReadonlyArray<MarketsSchema.Market>,
    MarketsSchema.MarketDataUnavailable
  >
  readonly history: (
    market: MarketsSchema.Market,
    period: MarketsSchema.MarketPeriod,
  ) => Effect.Effect<MarketsSchema.MarketHistory, MarketProviderError>
}

export class MarketProvider extends Context.Tag('MarketProvider')<
  MarketProvider,
  MarketProviderShape
>() {}

// Static fixture: proves the domain shape end to end. Points are illustrative,
// not real prices. A real provider owns period windowing; the stub keeps its
// full point list and slices to the window sizes below.
const rawMarkets = [
  {
    id: 'spy',
    symbol: 'SPY',
    name: 'SPDR S&P 500 ETF Trust',
    category: 'ETF',
    logoUrl: '/logos/spy.png',
  },
  {
    id: 'qqq',
    symbol: 'QQQ',
    name: 'Invesco QQQ Trust',
    category: 'ETF',
    logoUrl: '/logos/qqq.webp',
  },
  {
    id: 'aapl',
    symbol: 'AAPL',
    name: 'Apple Inc.',
    category: 'Stock',
    logoUrl: '/logos/aapl.jpg',
  },
  {
    id: 'msft',
    symbol: 'MSFT',
    name: 'Microsoft Corporation',
    category: 'Stock',
    logoUrl: '/logos/msft.jpg',
  },
  {
    id: 'nvda',
    symbol: 'NVDA',
    name: 'NVIDIA Corporation',
    category: 'Stock',
    logoUrl: '/logos/nvda.jpg',
  },
  {
    id: 'amzn',
    symbol: 'AMZN',
    name: 'Amazon.com, Inc.',
    category: 'Stock',
    logoUrl: '/logos/amzn.jpg',
  },
  {
    id: 'meta',
    symbol: 'META',
    name: 'Meta Platforms, Inc.',
    category: 'Stock',
    logoUrl: '/logos/meta.webp',
  },
  {
    id: 'tsla',
    symbol: 'TSLA',
    name: 'Tesla, Inc.',
    category: 'Stock',
    logoUrl: '/logos/tsla.jpg',
  },
  {
    id: 'btc',
    symbol: 'BTC',
    name: 'Bitcoin',
    category: 'Crypto',
    logoUrl: '/logos/btc.png',
  },
  {
    id: 'eth',
    symbol: 'ETH',
    name: 'Ethereum',
    category: 'Crypto',
    logoUrl: '/logos/eth.png',
  },
] as const

const markets = Schema.decodeUnknownSync(Schema.Array(MarketsSchema.Market))(
  rawMarkets,
)

/**
 * Deterministic pseudo-random series so the chart has realistic shape without
 * a network call. A seeded LCG keeps the curve identical across reloads, which
 * makes visual regressions obvious instead of looking like fresh noise.
 */
const seededSeries = (
  seed: number,
  startPrice: number,
  weeklyDrift: number,
  weeklyVolatility: number,
  weeks: number,
): ReadonlyArray<{ date: string; price: number }> => {
  let state = seed >>> 0
  const next = (): number => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0
    return state / 0x1_0000_0000
  }

  // Fixed epoch keeps dates stable across runs; 2021-01-01 was a Friday.
  const epoch = Date.UTC(2021, 0, 1)
  let price = startPrice

  return Array.from({ length: weeks }, (_, i) => {
    const shock = (next() - 0.5) * 2 * weeklyVolatility
    price = Math.max(0.01, price * (1 + weeklyDrift + shock))
    return {
      date: new Date(epoch + i * 7 * 86_400_000).toISOString().slice(0, 10),
      price: Math.round(price * 100) / 100,
    }
  })
}

const HISTORY_POINTS: Record<
  string,
  ReadonlyArray<{ date: string; price: number }> | undefined
> = {
  spy: seededSeries(11, 318.4, 0.0055, 0.014, 300),
  qqq: seededSeries(23, 262.1, 0.0058, 0.016, 300),
  aapl: seededSeries(37, 132.7, 0.0062, 0.018, 300),
  msft: seededSeries(41, 216.3, 0.0059, 0.015, 300),
  nvda: seededSeries(53, 18.4, 0.0125, 0.034, 300),
  amzn: seededSeries(67, 152.8, 0.0057, 0.019, 300),
  meta: seededSeries(79, 268.5, 0.0068, 0.024, 300),
  tsla: seededSeries(83, 211.6, 0.0041, 0.038, 300),
  btc: seededSeries(97, 29_400, 0.0092, 0.045, 300),
  eth: seededSeries(101, 730.2, 0.0081, 0.048, 300),
}

/** Weekly points per period: 52 weeks per year, like the live series. */
const WEEKS_PER_YEAR = 52

const PERIOD_YEARS: Record<MarketsSchema.MarketPeriod, number> = {
  '1Y': 1,
  '3Y': 3,
  '5Y': 5,
}

/**
 * The stub owns its own period windowing, matching the live provider's
 * behaviour, so switching 1Y/3Y/5Y is exercised the same way in both.
 */
export const MarketProviderStubLive = Layer.succeed(MarketProvider, {
  list: Effect.succeed(markets),
  history: (market, period) =>
    Effect.gen(function* () {
      const all = HISTORY_POINTS[market.id]
      if (!all) {
        return yield* new MarketsSchema.MarketNotFound({
          marketId: market.id,
        })
      }
      return {
        marketId: market.id,
        points: all.slice(-WEEKS_PER_YEAR * PERIOD_YEARS[period]),
      }
    }),
})
