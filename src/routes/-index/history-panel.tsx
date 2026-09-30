import { Result, useAtomSet, useAtomValue } from '@effect-atom/atom-react'
import { useState } from 'react'
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import type * as MarketsSchema from '#/api/market-schema'
import { endingValue, totalReturnPct } from '#/lib/simulation'
import { Alert, AlertDescription, AlertTitle } from '#/components/ui/alert'
import { Badge } from '#/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '#/components/ui/card'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '#/components/ui/chart'
import type { ChartConfig } from '#/components/ui/chart'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '#/components/ui/empty'
import { Separator } from '#/components/ui/separator'
import { Skeleton } from '#/components/ui/skeleton'
import { ToggleGroup, ToggleGroupItem } from '#/components/ui/toggle-group'
import { cn } from 'cn'
import { AmountInput } from './amount-input'
import {
  marketHistoryAtom,
  marketsAtom,
  selectedMarketIdAtom,
  selectedPeriodAtom,
} from './atoms'

const chartConfig = {
  price: {
    label: 'Price',
    color: 'var(--chart-1)',
  },
} satisfies ChartConfig

const usdFormat = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2,
})

const isMarketPeriod = (value: string): value is MarketsSchema.MarketPeriod =>
  value === '1Y' || value === '3Y' || value === '5Y'

function QuoteRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="truncate text-sm tabular-nums">{value}</span>
    </div>
  )
}

export function HistoryPanel() {
  const marketId = useAtomValue(selectedMarketIdAtom)
  const period = useAtomValue(selectedPeriodAtom)
  const setPeriod = useAtomSet(selectedPeriodAtom)
  const history = useAtomValue(marketHistoryAtom)
  const markets = useAtomValue(marketsAtom)
  const [principal, setPrincipal] = useState(1000)

  if (marketId === undefined) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>Select a market</EmptyTitle>
          <EmptyDescription>
            Pick a market from the list to see its history.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  const market = Result.isSuccess(markets)
    ? markets.value.find((m) => m.id === marketId)
    : undefined

  if (!Result.isSuccess(markets)) {
    return (
      <Card>
        <CardContent className="flex flex-col gap-2">
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-60 w-full rounded-2xl" />
        </CardContent>
      </Card>
    )
  }

  if (market === undefined) {
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

  if (Result.isInitial(history) || Result.isWaiting(history)) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{market.name}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-60 w-full rounded-2xl" />
        </CardContent>
      </Card>
    )
  }

  if (Result.isFailure(history)) {
    return (
      <Alert>
        <AlertTitle>Couldn&apos;t load history</AlertTitle>
        <AlertDescription>
          Something went wrong fetching {market.name} history. Try another
          market or period.
        </AlertDescription>
      </Alert>
    )
  }

  if (history.value === null || history.value.points.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>No history yet</EmptyTitle>
          <EmptyDescription>
            There is no {period} history for {market.name} right now.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  const points = history.value.points
  const first = points[0]
  const last = points[points.length - 1]
  const value = endingValue(principal, points)
  const pct = totalReturnPct(points)

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <CardTitle>{market.name}</CardTitle>
          <span className="text-sm text-muted-foreground">
            {market.symbol} · {market.category}
          </span>
        </div>
        <ToggleGroup
          value={[period]}
          onValueChange={(values) => {
            const next = values[0]
            if (isMarketPeriod(next)) setPeriod(next)
          }}
          aria-label="Historical period"
        >
          <ToggleGroupItem value="1Y">1Y</ToggleGroupItem>
          <ToggleGroupItem value="3Y">3Y</ToggleGroupItem>
          <ToggleGroupItem value="5Y">5Y</ToggleGroupItem>
        </ToggleGroup>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ChartContainer config={chartConfig} className="min-h-60 w-full">
          <AreaChart
            accessibilityLayer
            data={points.map((p) => ({ date: p.date, price: p.price }))}
            margin={{ left: 0, right: 0, top: 8, bottom: 0 }}
          >
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tickMargin={10}
              minTickGap={48}
            />
            <YAxis hide domain={['auto', 'auto']} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Area
              dataKey="price"
              type="monotone"
              fill="var(--color-price)"
              fillOpacity={0.15}
              stroke="var(--color-price)"
              strokeWidth={2}
            />
          </AreaChart>
        </ChartContainer>
        <div className="flex flex-col gap-2 rounded-2xl bg-muted p-4">
          <QuoteRow
            label="Start"
            value={`${first.date} · ${usdFormat.format(first.price)}`}
          />
          <QuoteRow
            label="End"
            value={`${last.date} · ${usdFormat.format(last.price)}`}
          />
          <QuoteRow label="Points" value={String(points.length)} />
          <Separator />
          <div className="flex flex-col gap-1">
            <span className="text-sm text-muted-foreground">Amount</span>
            <AmountInput value={principal} onChange={setPrincipal} />
          </div>
        </div>
        <div className="flex items-end justify-between gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-sm text-muted-foreground">
              {usdFormat.format(principal)} would have become
            </span>
            <span
              className={cn(
                'font-display text-4xl font-bold tabular-nums',
                pct !== undefined && pct < 0
                  ? 'text-(--chart-3)'
                  : 'text-(--chart-2)',
              )}
            >
              {value === undefined ? '—' : usdFormat.format(value)}
            </span>
          </div>
          {pct !== undefined ? (
            <Badge variant="secondary" className="tabular-nums">
              {pct >= 0 ? '+' : ''}
              {pct.toFixed(1)}%
            </Badge>
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}
