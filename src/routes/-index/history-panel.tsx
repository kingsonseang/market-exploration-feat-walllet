import { Result, useAtomSet, useAtomValue } from '@effect-atom/atom-react'
import { useState } from 'react'
import type * as MarketsSchema from '#/api/market-schema'
import { simulate, withinPeriod } from '#/lib/simulation'
import type { SimulationResult } from '#/lib/simulation'
import { Alert, AlertDescription, AlertTitle } from '#/components/ui/alert'
import { Avatar, AvatarFallback, AvatarImage } from '#/components/ui/avatar'
import { Loader } from '#/components/ui/loader'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select'
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
      <SelectTrigger className="h-auto w-full min-w-56 justify-start gap-2 rounded-2xl border-border bg-surface">
        <SelectValue placeholder="Explore a market">
          {selected === undefined ? null : (
            <>
              <MarketLogo market={selected} size="sm" />
              <span>{selected.name}</span>
            </>
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent align="start" className="min-w-64 duration-150 ease-out">
        <SelectGroup>
          {markets.map((market) => (
            <SelectItem key={market.id} value={market.id} className="px-2">
              <MarketLogo market={market} size="sm" />
              <span>{market.name}</span>
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}

/**
 * The three inputs share one row: explore a market, how much, how long ago.
 * Each field is wrapped in `control-enter-*` so the row staggers in once on
 * mount rather than appearing as a single block.
 */
function Controls({
  markets,
  marketId,
  onMarketChange,
  principal,
  onPrincipalChange,
  period,
  onPeriodChange,
}: {
  markets: ReadonlyArray<MarketsSchema.Market> | undefined
  marketId: MarketsSchema.MarketId | undefined
  onMarketChange: (id: MarketsSchema.MarketId) => void
  principal: number
  onPrincipalChange: (value: number) => void
  period: MarketsSchema.MarketPeriod
  onPeriodChange: (value: MarketsSchema.MarketPeriod) => void
}) {
  return (
    <div className="grid gap-5 md:grid-cols-3 md:items-start md:gap-6">
      <div className="control-enter control-enter-1 flex flex-col gap-1.5">
        <label className="text-sm font-medium" htmlFor="market-select-trigger">
          Explore a market
        </label>
        {markets === undefined ? (
          <Loader className="h-11 w-full" label="Loading markets" />
        ) : markets.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No markets available right now.
          </p>
        ) : (
          <MarketSelect
            markets={markets}
            value={marketId}
            onChange={onMarketChange}
          />
        )}
      </div>

      <div className="control-enter control-enter-2 flex flex-col gap-1.5">
        <label className="text-sm font-medium" htmlFor="investment-amount">
          If I had invested
        </label>
        <div className="flex items-center gap-1 rounded-2xl border border-border bg-muted px-3 py-2 transition-[border-color,box-shadow] duration-150 ease-(--ease-out) focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/20">
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

      <div className="control-enter control-enter-3 flex flex-col gap-2">
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
    </div>
  )
}

/**
 * What the fixed amount could be worth. No motion here: the figure changes on
 * every keystroke in the amount field, and animating data the user is reading
 * fights the input. The colour is the only thing that carries the sign.
 */
function Worth({
  result,
  period,
  loading,
}: {
  result: SimulationResult | undefined
  period: MarketsSchema.MarketPeriod
  loading: boolean
}) {
  const tone =
    result === undefined
      ? 'text-muted-foreground'
      : result.profit >= 0
        ? 'text-chart-2'
        : 'text-chart-3'

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm text-muted-foreground">It could be worth</p>
        <span className="text-sm text-muted-foreground">
          {PERIOD_YEARS[period]}-year return
        </span>
      </div>
      {loading ? (
        <Loader className="h-12 w-2/3" label="Loading result" />
      ) : (
        <span
          className={cn(
            'text-5xl font-bold tracking-[-0.03em] tabular-nums',
            tone,
          )}
        >
          {result === undefined ? '—' : usd.format(result.value)}
        </span>
      )}
      {result === undefined ? null : (
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn('text-lg font-bold tabular-nums', tone)}>
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
  // Identity of the plotted series: the chart's entrance is keyed to this so
  // it re-runs on a market or period change, never on an amount keystroke.
  const seriesKey = `${marketId ?? 'none'}:${period}`

  return (
    <section
      id="simulator"
      className="bg-white scroll-mt-6 overflow-hidden rounded-4xl border border-border shadow-[0_18px_60px_-30px_rgb(49_68_68_0.22)]"
    >
      <div className="flex flex-col gap-6 p-5 md:p-6">
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

        <Controls
          markets={marketList}
          marketId={marketId}
          onMarketChange={setMarketId}
          principal={principal}
          onPrincipalChange={setPrincipal}
          period={period}
          onPeriodChange={setPeriod}
        />

        <Worth result={result} period={period} loading={loading} />

        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-t border-border pt-4">
          <p className="text-sm text-muted-foreground">
            Starting on{' '}
            {result === undefined ? (
              <span className="text-foreground">—</span>
            ) : (
              <strong className="font-medium text-foreground">
                {mediumDate.format(new Date(`${result.start}T00:00:00Z`))}
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

        {loading ? (
          <Loader className="h-60 w-full" label="Loading history" />
        ) : result === undefined ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            {marketId === undefined
              ? 'Pick a market to see how far a fixed amount would have come.'
              : 'Not enough history to chart this period.'}
          </p>
        ) : (
          <HistoryChart
            points={points ?? []}
            values={result.values}
            principal={principal}
            marketName={market?.name ?? 'Market'}
            seriesKey={seriesKey}
          />
        )}
      </div>
    </section>
  )
}
