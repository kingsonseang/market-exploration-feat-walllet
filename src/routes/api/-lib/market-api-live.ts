import { DomainApi } from '#/api/domain-api'
import * as HttpApiBuilder from '@effect/platform/HttpApiBuilder'
import * as Layer from 'effect/Layer'
import * as Effect from 'effect/Effect'
import { MarketsService, MarketsServiceLive } from './market-service'
import { AlphaVantageMarketProviderLive } from './alpha-vantage-provider'

export const MarketsApiLive = HttpApiBuilder.group(
  DomainApi,
  'markets',
  (handlers) =>
    handlers
      .handle('list', () =>
        Effect.gen(function* () {
          const markets = yield* MarketsService
          return yield* markets.list
        }),
      )
      .handle('history', ({ path, urlParams }) =>
        Effect.gen(function* () {
          const markets = yield* MarketsService
          return yield* markets.history(path.id, urlParams.period)
        }),
      ),
).pipe(
  Layer.provide(MarketsServiceLive),
  Layer.provide(AlphaVantageMarketProviderLive),
)
