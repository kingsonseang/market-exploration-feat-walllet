import * as HttpApiSchema from '@effect/platform/HttpApiSchema'
import * as Schema from 'effect/Schema'

export const MarketId = Schema.String.pipe(Schema.brand('MarketId'))
export type MarketId = typeof MarketId.Type

export const Market = Schema.Struct({
  id: MarketId,
  symbol: Schema.String.annotations({
    description: 'Tradable symbol, e.g. SPY',
  }),
  name: Schema.String,
  category: Schema.String.annotations({
    description: 'Market category, e.g. ETF, index, stock, crypto',
  }),
  logoUrl: Schema.NullOr(Schema.String).annotations({
    description: 'Logo image URL, null when the provider has none',
  }),
})
export type Market = typeof Market.Type

export const MarketPeriod = Schema.Literal('1Y', '3Y', '5Y')
export type MarketPeriod = typeof MarketPeriod.Type

const IsoDate = Schema.String.pipe(
  Schema.pattern(/^\d{4}-\d{2}-\d{2}$/),
  Schema.annotations({
    description:
      'ISO calendar date (YYYY-MM-DD); daily resolution, no timestamps',
  }),
)

export const PricePoint = Schema.Struct({
  date: IsoDate,
  price: Schema.Number.annotations({
    description:
      'Adjusted closing price for the date; splits and dividends accounted for',
  }),
})
export type PricePoint = typeof PricePoint.Type

export const MarketHistory = Schema.Struct({
  marketId: MarketId,
  points: Schema.Array(PricePoint).annotations({
    description: 'Ascending by date; exactly the requested period window',
  }),
})
export type MarketHistory = typeof MarketHistory.Type

export class MarketNotFound extends Schema.TaggedError<MarketNotFound>()(
  'MarketNotFound',
  { marketId: MarketId },
  HttpApiSchema.annotations({ status: 404 }),
) {}

/**
 * Upstream data source could not serve the request: unreachable, rate
 * limited, or a symbol it does not cover. Declared in the shared schema
 * module so RPC and HTTP can both report it and adapters stay free of
 * transport-specific error types.
 */
export class MarketDataUnavailable extends Schema.TaggedError<MarketDataUnavailable>()(
  'MarketDataUnavailable',
  { symbol: Schema.String, message: Schema.String },
  HttpApiSchema.annotations({ status: 503 }),
) {}
