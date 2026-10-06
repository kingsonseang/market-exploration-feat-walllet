import { Result, useAtomSet, useAtomValue } from '@effect-atom/atom-react'
import { useState } from 'react'
import type * as MarketsSchema from '#/api/market-schema'
import { simulate, withinPeriod } from '#/lib/simulation'
import { Alert, AlertDescription, AlertTitle } from '#/components/ui/alert'
import { Avatar, AvatarFallback, AvatarImage } from '#/components/ui/avatar'
import { Card, CardContent } from '#/components/ui/card'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '#/components/ui/empty'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select'
import { Separator } from '#/components/ui/separator'
import { Skeleton } from '#/components/ui/skeleton'
import { ToggleGroup, ToggleGroupItem } from '#/components/ui/toggle-group'
import { AmountInput } from './amount-input'
import { HistoryChart } from './history-chart'
import {
  marketHistoryAtom,
  marketsAtom,
  selectedMarketIdAtom,
  selectedPeriodAtom,
} from './atoms'

const usd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2,
})

const longDate = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  timeZone: 'UTC',
})

const asOfDate = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
})

const PERIOD_YEARS = { '1Y': 1, '3Y': 3, '5Y': 5 } as const

const isMarketPeriod = (value: string): value is MarketsSchema.MarketPeriod =>
  value === '1Y' || value === '3Y' || value === '5Y'

const initials = (symbol: string): string => symbol.slice(0, 2).toUpperCase()

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm text-muted-foreground">{label}</span>
      {children}
    </div>
  )
}

function MarketSelect({
  markets,
  value,
  onChange,
}: {
  markets: ReadonlyArray<MarketsSchema.Market>
  value: MarketsSchema.MarketId | undefined
  onChange: (id: MarketsSchema.MarketId) => void
}) {
  const selected =
    value === undefined
      ? undefined
      : markets.find((m) => m.id === value)
  return (
    <Select
      value={value ?? null}
      onValueChange={(next) => {
        if (next !== null) onChange(next)
      }}
    >
      <SelectTrigger className="h-auto rounded-full bg-muted px-4 py-2.5">
        {/* Base UI infers the label from item text, which an Avatar + name
            row does not expose, so the trigger renders the market itself. */}
        <SelectValue placeholder="Explore a market">
          {selected === undefined ? null : (
            <>
              <Avatar size="sm">
                {selected.logoUrl === null ? null : (
                  <AvatarImage src={selected.logoUrl} alt="" />
                )}
                <AvatarFallback>{initials(selected.symbol)}</AvatarFallback>
              </Avatar>
              <span>{selected.name}</span>
            </>
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent align="start" className="min-w-64">
        <SelectGroup>
          {markets.map((market) => (
            <SelectItem key={market.id} value={market.id}>
              <Avatar size="sm">
                {market.logoUrl ? (
                  <AvatarImage src={market.logoUrl} alt="" />
                ) : null}
                <AvatarFallback>{initials(market.symbol)}</AvatarFallback>
              </Avatar>
              <span>{market.name}</span>
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}

export function HistoryPanel() {
  const marketId = useAtomValue(selectedMarketIdAtom)
  const period = useAtomValue(selectedPeriodAtom)
  const setPeriod = useAtomSet(selectedPeriodAtom)
  const setMarketId = useAtomSet(selectedMarketIdAtom)
  const history = useAtomValue(marketHistoryAtom)
  const markets = useAtomValue(marketsAtom)
  const [principal, setPrincipal] = useState(1000)

  const marketList = Result.isSuccess(markets) ? markets.value : undefined

  if (marketList !== undefined && marketList.length === 0) {
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

  if (marketId === undefined) {
    return (
      <Card>
        <CardContent className="flex flex-col gap-4">
          <Field label="Explore a market">
            {marketList === undefined ? (
              <Skeleton className="h-11 w-48 rounded-full" />
            ) : (
              <MarketSelect
                markets={marketList}
                value={undefined}
                onChange={setMarketId}
              />
            )}
          </Field>
          <Empty>
            <EmptyHeader>
              <EmptyTitle>Pick a market to begin</EmptyTitle>
              <EmptyDescription>
                Choose one above, then pick how far back you want to look.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </CardContent>
      </Card>
    )
  }

  const market =
    marketList === undefined
      ? undefined
      : marketList.find((m) => m.id === marketId)

  if (marketList !== undefined && market === undefined) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>Market not available</EmptyTitle>
          <EmptyDescription>
            The selected market is no longer in the list.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  if (
    marketList === undefined ||
    Result.isInitial(history) ||
    Result.isWaiting(history)
  ) {
    return (
      <Card>
        <CardContent className="flex flex-col gap-4">
          <Skeleton className="h-11 w-56 rounded-full" />
          <Skeleton className="h-24 w-full rounded-2xl" />
          <Skeleton className="h-60 w-full" />
        </CardContent>
      </Card>
    )
  }

  if (Result.isFailure(history)) {
    return (
      <Alert>
        <AlertTitle>Couldn&apos;t load history</AlertTitle>
        <AlertDescription>
          Something went wrong fetching history. Try another market or period.
        </AlertDescription>
      </Alert>
    )
  }

  if (history.value === null) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>No history yet</EmptyTitle>
          <EmptyDescription>
            There is no {period} history for this market right now.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  // The provider already slices to the period; re-slicing keeps the panel
  // correct if it is ever rendered with a wider series.
  const points = withinPeriod(history.value.points, period)
  const result = simulate(points, principal)

  if (result === undefined) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>Not enough history</EmptyTitle>
          <EmptyDescription>
            There are not enough observations in this period to chart a curve.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  const gained = result.profit >= 0

  return (
    <Card>
      <CardContent className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Field label="Explore a market">
            <MarketSelect
              markets={marketList}
              value={marketId}
              onChange={setMarketId}
            />
          </Field>
          <ToggleGroup
            value={[period]}
            onValueChange={(values) => {
              const next = values.at(0)
              if (next !== undefined && isMarketPeriod(next)) setPeriod(next)
            }}
            aria-label="Historical period"
          >
            {(['1Y', '3Y', '5Y'] as const).map((option) => (
              <ToggleGroupItem key={option} value={option}>
                {option}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>

        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-sm text-muted-foreground">
              Starting on{' '}
              {asOfDate.format(new Date(`${result.start}T00:00:00Z`))}
            </span>
            <span className="font-display text-2xl font-bold tabular-nums">
              {usd.format(principal)}
            </span>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className="text-sm text-muted-foreground">
              It could be worth
            </span>
            <span className="font-display text-4xl font-bold tabular-nums text-(--chart-2)">
              {usd.format(result.value)}
            </span>
          </div>
        </div>

        <HistoryChart
          points={points}
          principal={principal}
          marketName={market?.name ?? 'Market'}
        />

        <div className="flex flex-wrap items-center justify-between gap-4">
          <span className="text-sm text-muted-foreground">
            {PERIOD_YEARS[period]}-year return
          </span>
          <span className="flex items-center gap-2">
            <span
              className={`font-display text-lg font-bold tabular-nums ${
                gained ? 'text-(--chart-2)' : 'text-(--chart-3)'
              }`}
            >
              {result.percent >= 0 ? '+' : ''}
              {result.percent.toFixed(2)}%
            </span>
            <span className="text-sm text-muted-foreground">
              {usd.format(Math.abs(result.profit))} {gained ? 'gained' : 'lost'}
            </span>
          </span>
        </div>

        <Separator />

        <Field label="If I had invested">
          <AmountInput value={principal} onChange={setPrincipal} />
        </Field>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            A look back, not a prediction. Historical prices only, as of{' '}
            {longDate.format(new Date(`${result.end}T00:00:00Z`))}. Fees and
            taxes excluded.
          </p>
          <a
            href="https://www.alphavantage.co/"
            target="_blank"
            rel="noreferrer"
            className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
          >
            Price data: Alpha Vantage
          </a>
        </div>
      </CardContent>
    </Card>
  )
}
