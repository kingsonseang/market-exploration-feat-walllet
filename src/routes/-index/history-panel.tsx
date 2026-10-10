import { Result, useAtomSet, useAtomValue } from '@effect-atom/atom-react'
import NumberFlow, { NumberFlowGroup, useCanAnimate } from '@number-flow/react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
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

/**
 * The exact shape `usd` produces, handed to NumberFlow so the animated digits
 * are byte-identical to the static ones (and to the chart's axis formatter).
 */
const usdFormat = {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
} satisfies Intl.NumberFormatOptions

/** Matches `percent.toFixed(2)` on the non-animated path. */
const percentFormat = {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
} satisfies Intl.NumberFormatOptions

const mediumDate = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
})

const PERIOD_YEARS = { '1Y': 1, '3Y': 3, '5Y': 5 } as const
const PERIODS = ['1Y', '3Y', '5Y'] as const

/** Count-up budget for a deliberate change (market or period switch). Kept in
 * step with `DRAW_MS` so the curve and the figures land together. */
const SERIES_COUNT_MS = 550
/** Count-up budget while typing, so the figure keeps up with the hands. */
const TYPING_COUNT_MS = 200

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
          trigger renders the selected market itself. The `data-` variant
          deliberately mirrors the vendored default height so this control
          lands on the same 48px box as the other two in the row. */}
      <SelectTrigger className="w-full min-w-56 justify-start gap-2 rounded-2xl border-border bg-card transition-[border-color,box-shadow,transform] duration-150 ease-out active:scale-[0.98] data-[size=default]:h-12">
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
 * Segmented control with a sliding thumb.
 *
 * The thumb is a separate element translated to the active button rather than
 * each button toggling its own background, so the selection reads as one piece
 * of hardware sliding rather than a colour swap. Position comes from measuring
 * the buttons: CSS anchor positioning would be the tidier declaration but it
 * isn't broadly supported yet, and a measured transform is the standard
 * approach for a segmented control.
 *
 * The thumb is hidden until it has been measured once, so SSR and first paint
 * never show it parked in the wrong slot.
 */
function PeriodPills({
  period,
  onPeriodChange,
}: {
  period: MarketsSchema.MarketPeriod
  onPeriodChange: (value: MarketsSchema.MarketPeriod) => void
}) {
  const trackRef = useRef<HTMLDivElement>(null)
  const buttonRefs = useRef(new Map<string, HTMLButtonElement>())
  const [thumb, setThumb] = useState<{ x: number; width: number } | undefined>(
    undefined,
  )

  // Re-measure on selection and on resize: the thumb has to track both the
  // active button and the track reflowing with its container.
  useLayoutEffect(() => {
    const track = trackRef.current
    const active = buttonRefs.current.get(period)
    if (track === null || active === undefined) return

    const measure = () => {
      const trackBox = track.getBoundingClientRect()
      const box = active.getBoundingClientRect()
      setThumb({ x: box.left - trackBox.left, width: box.width })
    }

    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(track)
    return () => observer.disconnect()
  }, [period])

  return (
    <div
      ref={trackRef}
      className="relative flex h-12 w-fit items-center gap-1 rounded-full bg-muted p-1"
      role="group"
      aria-label="Historical period"
    >
      <span
        aria-hidden="true"
        data-measured={thumb === undefined ? 'false' : 'true'}
        className="period-thumb pointer-events-none absolute inset-y-1 rounded-full bg-card"
        style={
          thumb === undefined
            ? undefined
            : {
                width: `${thumb.width}px`,
                transform: `translateX(${thumb.x - 4}px)`,
              }
        }
      />
      {PERIODS.map((option) => (
        <button
          key={option}
          type="button"
          ref={(node) => {
            if (node === null) buttonRefs.current.delete(option)
            else buttonRefs.current.set(option, node)
          }}
          onClick={() => onPeriodChange(option)}
          aria-pressed={period === option}
          className={cn(
            'relative h-full rounded-full px-4 text-sm font-medium outline-none transition-[color,transform] duration-150 ease-out active:scale-[0.97] focus-visible:ring-3 focus-visible:ring-ring/30',
            period === option
              ? 'text-foreground'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {option}
        </button>
      ))}
    </div>
  )
}

/**
 * The three inputs share one row: explore a market, how much, how long ago.
 * All three boxes are `h-12` and the labels get a fixed line box, so the row
 * reads as one aligned strip rather than three differently sized fields.
 * `reveal-item-*` staggers the panel in once the first data lands.
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
  const label = 'text-sm font-medium leading-5'

  return (
    <div className="reveal-item reveal-item-1 grid gap-5 md:grid-cols-3 md:gap-6">
      <div className="flex flex-col gap-2">
        <label className={label} htmlFor="market-select-trigger">
          Explore a market
        </label>
        {markets === undefined ? (
          <Loader className="h-12 w-full" label="Loading markets" />
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

      <div className="flex flex-col gap-2">
        <label className={label} htmlFor="investment-amount">
          If I had invested
        </label>
        <div className="flex h-12 items-center gap-1 rounded-2xl border border-border bg-card px-3 transition-[border-color,box-shadow] duration-150 ease-out focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/20">
          <span className="text-sm font-medium text-muted-foreground">USD</span>
          <AmountInput
            id="investment-amount"
            value={principal}
            onChange={onPrincipalChange}
            className="text-2xl"
          />
        </div>
        <p className="text-xs text-slate-soft">Make it your amount.</p>
      </div>

      <div className="flex flex-col gap-2">
        <p className={label}>How long ago?</p>
        <PeriodPills period={period} onPeriodChange={onPeriodChange} />
      </div>
    </div>
  )
}

/**
 * What the fixed amount could be worth.
 *
 * The three figures are NumberFlow. Two reasons that is the right call over a
 * hand-rolled rAF loop: NumberFlow interrupts from whatever is currently
 * rendered, which is exactly what the amount field needs (a keystroke must not
 * send the figure back to zero), and it takes a real `cubic-bezier` where the
 * old loop had to solve one by bisection.
 *
 * `NumberFlowGroup` keeps the three in lockstep — three independent tweens
 * would drift apart mid-flight and read as three different numbers.
 *
 * Duration still follows the cause: a market or period switch gets the full
 * beat, a keystroke gets a short one. The curve is `--ease-out` verbatim.
 *
 * Sign and colour are deliberately *not* animated: the sign can flip, and a
 * sign that spins through the wrong direction mid-flight reads as a bug. Both
 * follow the target instantly while NumberFlow moves the digits.
 *
 * While a refetch is in flight the previous figure stays put rather than
 * dropping to a placeholder — replacing it and back is what read as a blink.
 */
function Worth({
  result,
  period,
  loading,
  durationMs,
  animate,
}: {
  result: SimulationResult | undefined
  period: MarketsSchema.MarketPeriod
  loading: boolean
  durationMs: number
  animate: boolean
}) {
  const tone =
    result === undefined
      ? 'text-muted-foreground'
      : result.profit >= 0
        ? 'text-chart-2'
        : 'text-chart-3'

  // One timing object for all three; the group syncs them anyway.
  const timing = {
    duration: durationMs,
    easing: 'cubic-bezier(0.23, 1, 0.32, 1)',
  }

  const percent = result?.percent
  const profit = result?.profit

  return (
    <div className="reveal-item reveal-item-2 flex flex-col gap-2">
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
          {result === undefined ? (
            '—'
          ) : (
            <NumberFlowGroup>
              <NumberFlow
                value={result.value}
                locales="en-US"
                format={usdFormat}
                transformTiming={timing}
                animated={animate}
                // The amount field changes this constantly, so the docs'
                // guidance for frequently-changing numbers applies here.
                willChange
              />
            </NumberFlowGroup>
          )}
        </span>
      )}
      {result === undefined ? null : (
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn('text-lg font-bold tabular-nums', tone)}>
            {percent !== undefined && percent >= 0 ? '+' : ''}
            <NumberFlow
              value={percent ?? 0}
              locales="en-US"
              format={percentFormat}
              suffix="%"
              transformTiming={timing}
              animated={animate}
            />
          </span>
          <span className="text-sm text-muted-foreground">
            {profit === undefined ? null : (
              <NumberFlow
                value={Math.abs(profit)}
                locales="en-US"
                format={usdFormat}
                transformTiming={timing}
                animated={animate}
              />
            )}{' '}
            {profit !== undefined && profit >= 0 ? 'gained' : 'lost'}
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
  // Feature-detects the browser as well as the motion preference, so the
  // figures degrade to static text rather than half-animating.
  const canAnimate = useCanAnimate()

  const marketList = Result.isSuccess(markets) ? markets.value : undefined
  const market =
    marketList === undefined
      ? undefined
      : marketList.find((m) => m.id === marketId)

  const historyPending = Result.isInitial(history) || Result.isWaiting(history)
  const hasHistory = Result.isSuccess(history) && history.value !== null

  /**
   * Whether this render's tree can be reproduced by the server.
   *
   * Only `markets` is dehydrated into the document (`src/routes/index.tsx`);
   * `history` is not, so the server always renders it as pending. But the
   * client can already hold history by its first render, and a figure the
   * server didn't render is a hydration mismatch.
   *
   * So both `result` and `loading` stay in their pre-mount state: the server
   * pass and the first client render agree on "nothing yet", and both show
   * loaders — which is the honest state, since the client has not asked yet.
   * After mount the real values take over. Gating only one of the two is not
   * enough: the figure and the loader have to flip on the same render.
   */
  const [hydrated, setHydrated] = useState(false)
  useEffect(() => setHydrated(true), [])

  const points = hasHistory
    ? withinPeriod(history.value.points, period)
    : undefined
  const result =
    hydrated && points !== undefined ? simulate(points, principal) : undefined

  /**
   * Loaders are for the first paint only. On a later refetch the previous
   * figure and chart stay on screen until the new data lands, so changing
   * market or period never blanks the panel. A past figure and chart are also
   * the only thing that keeps the layout from jumping mid-refetch.
   */
  const firstLoad = marketList === undefined
  const loading = !hydrated || firstLoad || (historyPending && !hasHistory)
  const seriesKey = `${marketId ?? 'none'}:${period}`

  /**
   * Both requests have answered — successfully or not. Errors count: the panel
   * still has to reveal and show its alert, otherwise a failed fetch would
   * leave the page permanently half-formed.
   */
  const settled =
    !Result.isInitial(markets) &&
    !Result.isWaiting(markets) &&
    !Result.isInitial(history) &&
    !Result.isWaiting(history)

  // Latched: the entrance plays once, and later refetches never replay it.
  const [revealed, setRevealed] = useState(false)
  useEffect(() => {
    if (settled && !revealed) setRevealed(true)
  }, [settled, revealed])

  /**
   * Count-up budget follows the cause of the change. A market or period switch
   * is a deliberate action and gets the full beat; an amount keystroke is not,
   * and a 600ms tween there would lag the hands. Adjusting during render is
   * React's documented pattern — setting state here re-renders before
   * committing, so the committed render already carries the new budget.
   */
  const [count, setCount] = useState({
    seriesKey,
    principal,
    ms: SERIES_COUNT_MS,
  })
  if (count.seriesKey !== seriesKey) {
    setCount({ seriesKey, principal, ms: SERIES_COUNT_MS })
  } else if (count.principal !== principal) {
    setCount({ ...count, principal, ms: TYPING_COUNT_MS })
  }
  const durationMs = count.seriesKey === seriesKey ? count.ms : SERIES_COUNT_MS

  return (
    <section
      id="simulator"
      data-revealed={revealed ? 'true' : 'false'}
      className="bg-white scroll-mt-6 overflow-hidden rounded-3xl border border-border shadow-[0_18px_60px_-30px_rgb(49_68_68_0.22)] min-[810px]:rounded-4xl"
    >
      <div className="flex flex-col gap-6 p-4 min-[810px]:p-6">
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

        <Worth
          result={result}
          period={period}
          loading={loading}
          durationMs={durationMs}
          animate={canAnimate && revealed}
        />

        <div className="reveal-item reveal-item-3 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-t border-border pt-4">
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

        {/* Chart, loader, or empty state — in that order. A stale chart always wins
            over a loader so a refetch never blanks the panel. */}
        {result === undefined ? (
          loading ? (
            <Loader className="h-60 w-full" label="Loading history" />
          ) : (
            <p className="flex h-60 items-center justify-center text-center text-sm text-muted-foreground">
              {marketId === undefined
                ? 'Pick a market to see how far a fixed amount would have come.'
                : 'Not enough history to chart this period.'}
            </p>
          )
        ) : (
          <div className="reveal-item reveal-item-4">
            <HistoryChart
              points={points ?? []}
              values={result.values}
              principal={principal}
              marketName={market?.name ?? 'Market'}
              seriesKey={seriesKey}
            />
          </div>
        )}
      </div>
    </section>
  )
}
