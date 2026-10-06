import { Result, useAtomSet, useAtomValue } from '@effect-atom/atom-react'
import { useState } from 'react'
import type * as MarketsSchema from '#/api/market-schema'
import { simulate, withinPeriod } from '#/lib/simulation'
import { Alert, AlertDescription, AlertTitle } from '#/components/ui/alert'
import { Avatar, AvatarFallback, AvatarImage } from '#/components/ui/avatar'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select'
import { Skeleton } from '#/components/ui/skeleton'
import { cn } from 'cn'
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
  minimumFractionDigits: 2,
})

const mediumDate = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
})

const PERIOD_YEARS = { '1Y': 1, '3Y': 3, '5Y': 5 } as const
const PERIODS = ['1Y', '3Y', '5Y'] as const

const initials = (symbol: string): string => symbol.slice(0, 2).toUpperCase()

const MarketLogo = ({
  market,
  size,
}: {
  market: MarketsSchema.Market
  size: 'sm' | 'default'
}) => (
  <Avatar size={size}>
    {market.logoUrl === null ? null : (
      <AvatarImage src={market.logoUrl} alt="" />
    )}
    <AvatarFallback>{initials(market.symbol)}</AvatarFallback>
  </Avatar>
)

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
    value === undefined ? undefined : markets.find((m) => m.id === value)

  return (
    <Select
      value={value ?? null}
      onValueChange={(next) => {
        if (next !== null) onChange(next)
      }}
    >
      {/* Base UI cannot infer a label from a logo + name row, so the
          trigger renders the selected market itself. */}
      <SelectTrigger className="h-auto w-full min-w-56 justify-start gap-2 rounded-2xl border-border bg-surface px-3 py-2.5">
        <SelectValue placeholder="Explore a market">
          {selected === undefined ? null : (
            <>
              <MarketLogo market={selected} size="sm" />
              <span>{selected.name}</span>
            </>
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent
        align="start"
        className="min-w-64 duration-150 ease-(--ease-out)"
      >
        <SelectGroup>
          {markets.map((market) => (
            <SelectItem key={market.id} value={market.id}>
              <MarketLogo market={market} size="sm" />
              <span>{market.name}</span>
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}

/** Demo order: amount, helper, "How long ago?", purchase line. */
function Controls({
  principal,
  onPrincipalChange,
  period,
  onPeriodChange,
  startDate,
}: {
  principal: number
  onPrincipalChange: (value: number) => void
  period: MarketsSchema.MarketPeriod
  onPeriodChange: (value: MarketsSchema.MarketPeriod) => void
  startDate: string | undefined
}) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium" htmlFor="investment-amount">
          If I had invested
        </label>
        <div className="flex max-w-sm items-center gap-1 rounded-2xl border border-border bg-muted px-3 py-2 transition-[border-color,box-shadow] duration-150 ease-(--ease-out) focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/20">
          <span className="text-sm font-medium text-muted-foreground">USD</span>
          <AmountInput
            id="investment-amount"
            value={principal}
            onChange={onPrincipalChange}
            className="text-2xl"
          />
        </div>
        <p className="text-xs text-muted-foreground">Make it your amount.</p>
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium">How long ago?</p>
        <div
          className="flex w-fit gap-1 rounded-full bg-muted p-1"
          role="group"
          aria-label="Historical period"
        >
          {PERIODS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => onPeriodChange(option)}
              aria-pressed={period === option}
              className={cn(
                'rounded-full px-4 py-1.5 text-sm font-medium outline-none transition-[color,background-color,transform] duration-150 ease-(--ease-out) active:scale-[0.97] focus-visible:ring-3 focus-visible:ring-ring/30',
                period === option
                  ? 'bg-card text-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {option}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          Starting on{' '}
          {startDate === undefined ? (
            <span className="text-foreground">—</span>
          ) : (
            <strong className="font-medium text-foreground">
              {mediumDate.format(new Date(`${startDate}T00:00:00Z`))}
            </strong>
          )}
        </p>
        <p className="text-sm text-muted-foreground">
          Your investment{' '}
          <strong className="text-lg font-bold tabular-nums text-foreground">
            {usd.format(principal)}
          </strong>
        </p>
      </div>
    </div>
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
  const market =
    marketList === undefined
      ? undefined
      : marketList.find((m) => m.id === marketId)

  const loading =
    marketList === undefined ||
    Result.isInitial(history) ||
    Result.isWaiting(history)

  const points =
    Result.isSuccess(history) && history.value !== null
      ? withinPeriod(history.value.points, period)
      : undefined
  const result = points === undefined ? undefined : simulate(points, principal)

  return (
    <section
      id="simulator"
      className="scroll-mt-6 overflow-hidden rounded-4xl border border-border bg-card shadow-[0_18px_60px_-30px_rgb(49_68_68_0.22)]"
    >
      <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
        <span className="text-sm font-medium">
          A look back, not a prediction
        </span>
      </div>

      <div className="flex flex-col gap-6 p-5 md:p-6">
        <div className="flex flex-col gap-1.5">
          <label
            className="text-sm font-medium"
            htmlFor="market-select-trigger"
          >
            Explore a market
          </label>
          {marketList === undefined ? (
            <Skeleton className="h-11 w-full max-w-sm rounded-2xl" />
          ) : marketList.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No markets available right now.
            </p>
          ) : (
            <div className="max-w-sm">
              <MarketSelect
                markets={marketList}
                value={marketId}
                onChange={setMarketId}
              />
            </div>
          )}
        </div>

        {Result.isFailure(markets) ? (
          <Alert>
            <AlertTitle>Couldn&rsquo;t load markets</AlertTitle>
            <AlertDescription>
              The market list is unavailable. The free tier allows a limited
              number of requests per day; try again shortly.
            </AlertDescription>
          </Alert>
        ) : null}

        {marketId !== undefined && Result.isFailure(history) ? (
          <Alert>
            <AlertTitle>Couldn&rsquo;t load history</AlertTitle>
            <AlertDescription>
              Something went wrong fetching history. Try another market or
              period.
            </AlertDescription>
          </Alert>
        ) : null}

        {marketId !== undefined &&
        marketList !== undefined &&
        market === undefined ? (
          <p className="text-sm text-muted-foreground">
            That market is no longer in the list.
          </p>
        ) : null}

        <div className="grid gap-6 md:grid-cols-2 md:gap-8">
          <Controls
            principal={principal}
            onPrincipalChange={setPrincipal}
            period={period}
            onPeriodChange={setPeriod}
            startDate={result?.start}
          />

          <div className="flex flex-col gap-2">
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm text-muted-foreground">It could be worth</p>
              <span className="text-sm text-muted-foreground">
                {PERIOD_YEARS[period]}-year return
              </span>
            </div>
            {loading ? (
              <Skeleton className="h-12 w-2/3" />
            ) : (
              <span
                className={cn(
                  'text-5xl font-bold tracking-[-0.03em] tabular-nums',
                  result === undefined
                    ? 'text-muted-foreground'
                    : result.profit >= 0
                      ? 'text-(--chart-2)'
                      : 'text-(--chart-3)',
                )}
              >
                {result === undefined ? '—' : usd.format(result.value)}
              </span>
            )}
            {result === undefined ? null : (
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={cn(
                    'text-lg font-bold tabular-nums',
                    result.profit >= 0
                      ? 'text-(--chart-2)'
                      : 'text-(--chart-3)',
                  )}
                >
                  {result.percent >= 0 ? '+' : ''}
                  {result.percent.toFixed(2)}%
                </span>
                <span className="text-sm text-muted-foreground">
                  {usd.format(Math.abs(result.profit))}{' '}
                  {result.profit >= 0 ? 'gained' : 'lost'}
                </span>
              </div>
            )}
          </div>
        </div>

        {loading ? (
          <Skeleton className="h-56 w-full rounded-2xl" />
        ) : result === undefined ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            {marketId === undefined
              ? 'Pick a market to see how far a fixed amount would have come.'
              : 'Not enough history to chart this period.'}
          </p>
        ) : (
          <HistoryChart
            points={points ?? []}
            principal={principal}
            marketName={market?.name ?? 'Market'}
          />
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-5 py-3">
        <span className="text-xs text-muted-foreground">
          {market?.name ?? 'Market'} · investment value
        </span>
        <span className="text-xs text-muted-foreground">
          Historical price snapshot ·{' '}
          {result === undefined
            ? '—'
            : mediumDate.format(new Date(`${result.end}T00:00:00Z`))}
        </span>
      </div>
    </section>
  )
}
