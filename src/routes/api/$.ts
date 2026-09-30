import { createFileRoute } from '@tanstack/react-router'
import * as HttpServerResponse from '@effect/platform/HttpServerResponse'
import * as HttpServer from '@effect/platform/HttpServer'
import * as HttpLayerRouter from '@effect/platform/HttpLayerRouter'
import * as RpcSerialization from '@effect/rpc/RpcSerialization'
import * as RpcServer from '@effect/rpc/RpcServer'
import * as Layer from 'effect/Layer'
import { DomainRpc } from '#/api/domain-rpc'
import { DomainApi } from '#/api/domain-api'
import { MarketsRpcLive } from './-lib/market-rpc-live'
import { MarketsApiLive } from './-lib/market-api-live'
import * as ManagedRuntime from 'effect/ManagedRuntime'
import { MarketsServiceLive } from './-lib/market-service'
import * as RpcMiddleware from '@effect/rpc/RpcMiddleware'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as Logger from 'effect/Logger'

class RpcLogger extends RpcMiddleware.Tag<RpcLogger>()('RcLogger', {
  wrap: true,
  optional: true,
}) {}

const RpcLoggerLive = Layer.succeed(
  RpcLogger,
  RpcLogger.of((opts) =>
    Effect.flatMap(Effect.exit(opts.next), (exit) =>
      Exit.match(exit, {
        onSuccess: () => exit,
        onFailure: (cause) =>
          Effect.zipRight(
            Effect.annotateLogs(Effect.logError('', cause), {
              'rpc.method': opts.rpc._tag,
              'rpc.clientId': opts.rpc.key, // should be rpc clientId
            }),
            exit,
          ),
      }),
    ),
  ),
)

const RpcRouter = RpcServer.layerHttpRouter({
  group: DomainRpc.middleware(RpcLogger),
  path: '/api/rpc',
  protocol: 'http',
  spanPrefix: 'rpc',
  disableFatalDefects: true,
}).pipe(
  Layer.provide(MarketsRpcLive),
  Layer.provide(RpcLoggerLive),
  Layer.provide(RpcSerialization.layerNdjson),
)

const HttpApiRouter = HttpLayerRouter.addHttpApi(DomainApi).pipe(
  Layer.provide(MarketsApiLive),
  Layer.provide(HttpServer.layerContext),
)

const HealthRoute = HttpLayerRouter.use((router) =>
  router.add('GET', '/api/health', HttpServerResponse.text('OK')),
)

const Routes = Layer.mergeAll(RpcRouter, HttpApiRouter, HealthRoute).pipe(
  Layer.provide(Logger.pretty),
)

const memoMap = Effect.runSync(Layer.makeMemoMap)

const globalHmr = globalThis as unknown as {
  __EFFECT_DISPOSE__?: () => Promise<void>
}
if (globalHmr.__EFFECT_DISPOSE__) {
  await globalHmr.__EFFECT_DISPOSE__()
  globalHmr.__EFFECT_DISPOSE__ = undefined
}

const { handler, dispose } = HttpLayerRouter.toWebHandler(Routes, { memoMap })
const effectHandler = ({ request }: { request: Request }) => handler(request)

// ManagedRuntime for use in loaders/server functions
export const serverRuntime = ManagedRuntime.make(MarketsServiceLive, memoMap)

globalHmr.__EFFECT_DISPOSE__ = async () => {
  await dispose()
  await serverRuntime.dispose()
}

export const Route = createFileRoute('/api/$')({
  server: {
    handlers: {
      GET: effectHandler,
      POST: effectHandler,
      PUT: effectHandler,
      PATCH: effectHandler,
      DELETE: effectHandler,
      OPTIONS: effectHandler,
    },
  },
})
