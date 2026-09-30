import * as MarketsSchema from '#/api/market-schema'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
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

export const MarketsServiceLive = MarketsService.Default.pipe(
  Layer.provide(MarketProviderStubLive),
)
