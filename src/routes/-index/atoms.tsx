import { ApiClient } from '#/api/api-client'
import * as MarketsSchema from '#/api/market-schema'
import { serializable } from '#/lib/atom-utils'
import { Atom, Result } from '@effect-atom/atom-react'
import * as RpcClientError from '@effect/rpc/RpcClientError'
// import * as Arr from 'effect/Array'
import type * as Data from 'effect/Data'
import * as Effect from 'effect/Effect'
// import * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'

const MarketArraysSchema = Schema.Array(MarketsSchema.Market)

class Api extends Effect.Service<Api>()('#app/index/Api', {
  dependencies: [ApiClient.Default],
  effect: Effect.gen(function* () {
    const { rpc } = yield* ApiClient

    return {
      list: () => rpc.market_list(),
      history: (
        id: MarketsSchema.MarketId,
        period: MarketsSchema.MarketPeriod,
      ) => rpc.market_history({ id, period }),
    } as const
  }),
}) {}

export const runtime = Atom.runtime(Api.Default)

type MarketsCacheMutation = Data.TaggedEnum<{
  Delete: { readonly id: MarketsSchema.MarketId }
}>

export const marketsAtom = (() => {
  const remoteAtom = runtime
    .atom(
      Effect.gen(function* () {
        const api = yield* Api
        return yield* api.list()
      }),
    )
    .pipe(
      serializable({
        key: '#app/index/markets',
        schema: Result.Schema({
          success: MarketArraysSchema,
          error: RpcClientError.RpcClientError,
        }),
      }),
    )

  return Object.assign(
    Atom.writable(
      (get) => get(remoteAtom),
      (ctx, _update: MarketsCacheMutation) => {
        const current = ctx.get(remoteAtom)
        if (!Result.isSuccess(current)) return

        // const nextValue = (() => {
        //   switch (update._tag) {
        //     case "Delete": {
        //       return Arr.filter(current.value, (t) => t.id !== update.id);
        //     }
        //   }
        // })()

        // ctx.setSelf(Result.success(nextValue))
      },
      (refresh) => refresh(remoteAtom),
    ),
    { remote: remoteAtom },
  )
})()

// create mutations here
export const selectedPeriodAtom = Atom.make<MarketsSchema.MarketPeriod>(
  '1Y',
).pipe(
  serializable({
    key: '#app/index/selected-period',
    schema: MarketsSchema.MarketPeriod,
  }),
)

export const selectedMarketIdAtom = Atom.make<
  MarketsSchema.MarketId | undefined
>(undefined)

const MarketHistoryOrNullSchema = Schema.NullOr(MarketsSchema.MarketHistory)

export const marketHistoryAtom = runtime
  .atom((get) =>
    Effect.gen(function* () {
      const marketId = get(selectedMarketIdAtom)
      if (marketId === undefined) return null
      const period = get(selectedPeriodAtom)
      const api = yield* Api
      return yield* api.history(marketId, period)
    }),
  )
  .pipe(
    serializable({
      key: '#app/index/market-history',
      schema: Result.Schema({
        success: MarketHistoryOrNullSchema,
        error: Schema.Union(
          RpcClientError.RpcClientError,
          MarketsSchema.MarketNotFound,
        ),
      }),
    }),
  )

//
//
// export const deleteMarketAtom = runtime.fn<MarketsSchema.MarketId>()(
//   Effect.fnUntraced(function* (id, get) {
//     const api = yield* Api;
//     yield* api.remove(id);
//     get.set(marketsAtom, { _tag: "Delete", id });
//   }),
// );
