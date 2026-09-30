import { Result, useAtomSet, useAtomValue } from '@effect-atom/atom-react'
import { Alert, AlertDescription, AlertTitle } from '#/components/ui/alert'
import { Avatar, AvatarFallback, AvatarImage } from '#/components/ui/avatar'
import { Card, CardContent, CardHeader, CardTitle } from '#/components/ui/card'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '#/components/ui/empty'
import { Skeleton } from '#/components/ui/skeleton'
import { cn } from 'cn'
import { marketsAtom, selectedMarketIdAtom } from './atoms'

export function MarketList() {
  const markets = useAtomValue(marketsAtom)
  const selectedId = useAtomValue(selectedMarketIdAtom)
  const select = useAtomSet(selectedMarketIdAtom)

  if (Result.isInitial(markets) || Result.isWaiting(markets)) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Markets</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <Skeleton className="h-14 w-full rounded-2xl" />
          <Skeleton className="h-14 w-full rounded-2xl" />
          <Skeleton className="h-14 w-full rounded-2xl" />
        </CardContent>
      </Card>
    )
  }

  if (Result.isFailure(markets)) {
    return (
      <Alert>
        <AlertTitle>Couldn&apos;t load markets</AlertTitle>
        <AlertDescription>
          Something went wrong fetching the market list. Try again shortly.
        </AlertDescription>
      </Alert>
    )
  }

  if (markets.value.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>No markets available</EmptyTitle>
          <EmptyDescription>
            There are no markets to explore right now.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Markets</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {markets.value.map((market) => {
          const selected = market.id === selectedId
          return (
            <button
              key={market.id}
              type="button"
              onClick={() => select(market.id)}
              aria-pressed={selected}
              className={cn(
                'flex items-center gap-3 rounded-2xl border-2 p-3 text-left transition-all outline-none focus-visible:ring-3 focus-visible:ring-ring/30 active:scale-[0.99]',
                selected
                  ? 'border-primary bg-muted'
                  : 'border-transparent bg-muted/50 hover:bg-muted',
              )}
            >
              <Avatar>
                {market.logoUrl ? (
                  <AvatarImage src={market.logoUrl} alt={market.name} />
                ) : null}
                <AvatarFallback>
                  {market.symbol.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-medium">
                  {market.name}
                </span>
                <span className="text-xs text-muted-foreground">
                  {market.symbol} · {market.category}
                </span>
              </span>
            </button>
          )
        })}
      </CardContent>
    </Card>
  )
}
