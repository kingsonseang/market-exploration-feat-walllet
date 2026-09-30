import * as Rpc from '@effect/rpc/Rpc'
import * as RpcGroup from '@effect/rpc/RpcGroup'
import * as Schema from 'effect/Schema'
import * as MarketsSchema from './market-schema'

export class MarketsRpc extends RpcGroup.make(
  Rpc.make('list', {
    success: Schema.Array(MarketsSchema.Market),
  }),

  Rpc.make('history', {
    success: MarketsSchema.MarketHistory,
    error: MarketsSchema.MarketNotFound,
    payload: {
      id: MarketsSchema.MarketId,
      period: MarketsSchema.MarketPeriod,
    },
  }),
).prefix('market_') {}

export class DomainRpc extends RpcGroup.make().merge(MarketsRpc) {}
