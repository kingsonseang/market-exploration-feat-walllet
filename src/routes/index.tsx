import { dehydrate } from '#/lib/atom-utils'
import { Result } from '@effect-atom/atom-react'
import { HydrationBoundary } from '@effect-atom/atom-react/ReactHydration'
import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import * as Effect from 'effect/Effect'
import { serverRuntime } from './api/$'
import { MarketsService } from './api/-lib/market-service'
import { App } from './-index/app'
import { marketsAtom } from './-index/atoms'

const listMarkets = createServerFn({ method: 'GET' }).handler(async () => {
  const markets = await serverRuntime.runPromiseExit(
    Effect.flatMap(MarketsService, (s) => s.list),
  )
  return dehydrate(marketsAtom.remote, Result.fromExit(markets))
})

export const Route = createFileRoute('/')({
  loader: () => listMarkets(),
  component: MarketsWrapper,
})

function MarketsWrapper() {
  const dehydrated = Route.useLoaderData()
  return (
    // @ts-expect-error
    <HydrationBoundary state={[dehydrated]}>
      <App />
    </HydrationBoundary>
  )
}
