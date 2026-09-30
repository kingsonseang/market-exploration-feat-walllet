import * as HttpApi from '@effect/platform/HttpApi'
import * as HttpApiGroup from '@effect/platform/HttpApiGroup'
import * as HttpApiEndpoint from '@effect/platform/HttpApiEndpoint'
import * as Schema from 'effect/Schema'
import * as MarketsSchema from './market-schema'

export class MarketsApiGroup extends HttpApiGroup.make('markets')
  .add(
    HttpApiEndpoint.get('list', '/markets').addSuccess(
      Schema.Array(MarketsSchema.Market),
    ),
  )
  .add(
    HttpApiEndpoint.get('history', '/markets/:id/history')
      .setPath(Schema.Struct({ id: MarketsSchema.MarketId }))
      .setUrlParams(Schema.Struct({ period: MarketsSchema.MarketPeriod }))
      .addSuccess(MarketsSchema.MarketHistory)
      .addError(MarketsSchema.MarketNotFound, { status: 404 }),
  ) {}

export class DomainApi extends HttpApi.make('api')
  .add(MarketsApiGroup)
  .prefix('/api') {}
