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
    logoUrl: null,
  },
  {
    id: 'qqq',
    symbol: 'QQQ',
    name: 'Invesco QQQ Trust',
    category: 'ETF',
    logoUrl: 'https://assets.example.com/logos/qqq.png',
  },
  {
    id: 'btc',
    symbol: 'BTC',
    name: 'Bitcoin',
    category: 'Crypto',
    logoUrl: null,
  },
] as const

const markets = Schema.decodeUnknownSync(Schema.Array(MarketsSchema.Market))(
  rawMarkets,
)

const HISTORY_POINTS: Record<
  string,
  ReadonlyArray<{ date: string; price: number }> | undefined
> = {
  spy: [
    { date: '2026-09-21', price: 655.1 },
    { date: '2026-09-22', price: 658.4 },
    { date: '2026-09-23', price: 652.9 },
    { date: '2026-09-24', price: 660.2 },
    { date: '2026-09-25', price: 663.7 },
    { date: '2026-09-28', price: 661.5 },
  ],
  qqq: [
    { date: '2026-09-21', price: 601.3 },
    { date: '2026-09-22', price: 604.8 },
    { date: '2026-09-23', price: 599.5 },
    { date: '2026-09-24', price: 607.1 },
    { date: '2026-09-25', price: 610.4 },
    { date: '2026-09-28', price: 608.9 },
  ],
  btc: [
    { date: '2026-09-21', price: 110_250 },
    { date: '2026-09-22', price: 111_800 },
    { date: '2026-09-23', price: 109_400 },
    { date: '2026-09-24', price: 112_150 },
    { date: '2026-09-25', price: 113_600 },
    { date: '2026-09-28', price: 112_900 },
  ],
}

// Trading-day window sizes; no-op on the tiny fixture, meaningful for real data.
const HISTORY_WINDOW: Record<MarketsSchema.MarketPeriod, number> = {
  '1Y': 252,
  '3Y': 756,
  '5Y': 1260,
}

export const MarketProviderStubLive = Layer.succeed(MarketProvider, {
  list: Effect.succeed(markets),
  history: (market, period) =>
    Effect.gen(function* () {
      const points = HISTORY_POINTS[market.id]
      if (!points) {
        return yield* new MarketsSchema.MarketNotFound({
          marketId: market.id,
        })
      }
      return {
        marketId: market.id,
        points: points.slice(-HISTORY_WINDOW[period]),
      }
    }),
})
