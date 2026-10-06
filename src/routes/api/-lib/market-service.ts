import * as MarketsSchema from '#/api/market-schema'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import { AlphaVantageMarketProviderLive } from './alpha-vantage-provider'
import { MarketProvider, MarketProviderStubLive } from './market-provider'

export class MarketsService extends Effect.Service<MarketsService>()(
  'MarketsService',
  {
    effect: Effect.gen(function* () {
      const provider = yield* MarketProvider

      const list = provider.list

      const history = (
        id: MarketsSchema.MarketId,
        period: MarketsSchema.MarketPeriod,
      ) =>
        Effect.gen(function* () {
          const markets = yield* provider.list
          const market = markets.find((m) => m.id === id)
          if (!market) {
            return yield* new MarketsSchema.MarketNotFound({ marketId: id })
          }
          return yield* provider.history(market, period)
        })

      return { list, history } as const
    }),
  },
) {}

/**
 * Dev-only escape hatch: `MARKET_PROVIDER=stub` in `.env` swaps the live
 * Alpha Vantage adapter for the fixture provider. The free tier allows 25
 * requests per day and the cache does not survive HMR, so iterating on the UI
 * without this burns the quota on the first edit.
 */
const useStubProvider = process.env['MARKET_PROVIDER'] === 'stub'

/** Live data unless `MARKET_PROVIDER=stub`. */
export const MarketsServiceLive = MarketsService.Default.pipe(
  Layer.provide(
    useStubProvider ? MarketProviderStubLive : AlphaVantageMarketProviderLive,
  ),
)

export const MarketsServiceStub = MarketsService.Default.pipe(
  Layer.provide(MarketProviderStubLive),
)
