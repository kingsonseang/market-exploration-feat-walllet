import * as Layer from 'effect/Layer'
import * as Effect from 'effect/Effect'
import { DomainRpc } from '#/api/domain-rpc'
import { MarketsService, MarketsServiceLive } from './market-service'

export const MarketsRpcLive = DomainRpc.toLayer(
  Effect.gen(function* () {
    const markets = yield* MarketsService

    return {
      market_list: () => markets.list,
      market_history: ({ id, period }) => markets.history(id, period),
    }
  }),
).pipe(Layer.provide(MarketsServiceLive))
