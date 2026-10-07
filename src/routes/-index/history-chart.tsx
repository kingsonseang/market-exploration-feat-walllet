import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { cn } from 'cn'
import type * as MarketsSchema from '#/api/market-schema'

/**
 * Investment-value chart.
 *
 * The curve plots the *value of the investment over time* (principal rebased
 * against each historical price), not raw price, so the reference line at the
 * starting principal is meaningful. `simulate` already produces that rebased
 * series, so one array drives the line, the axis and the readout.
 *
 * On motion: the chart stays mounted for its whole life. An earlier version
 * keyed the wrapper on the series, which remounted Recharts and replayed a
 * fade from `opacity: 0` — a blank frame on every market or period change,
 * which reads as a blink. Now the curve animates in place instead.
 *
 * The draw-in is gated on the *series* changing (market or period), never on
 * the amount. Recharts restarts its animation whenever the `points` array
 * changes by reference, and rebasing to a new amount produces a new array on
 * every keystroke — so left ungated, typing would replay a 500ms curve redraw
 * per character. The shape is identical across an amount change anyway (every
 * value scales linearly), so there is nothing worth animating there.
 */

const usd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2,
})

const usdCompact = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  maximumFractionDigits: 1,
})

const longDate = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  timeZone: 'UTC',
})

const shortDate = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
})

const tickDate = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  year: '2-digit',
  timeZone: 'UTC',
})

const toMs = (iso: string): number => Date.parse(`${iso}T00:00:00Z`)

/** Long enough for the curve to land before the gate closes. */
const DRAW_MS = 500

interface Row extends MarketsSchema.PricePoint {
  readonly ms: number
  readonly value: number
}

/** Evenly spaced x-axis labels, as data-key values (a category axis matches
 * `ticks` against the data, not against indexes). */
const dateTicks = (rows: ReadonlyArray<Row>): ReadonlyArray<string> =>
  [0, 0.25, 0.5, 0.75, 1].map(
    (t) => rows[Math.round((rows.length - 1) * t)].date,
  )

/**
 * X-axis tick renderer. The first and last labels anchor inward so neither is
 * clipped by the plot edge — the alternative was padding the axis, which
 * would pull the curve away from the panel's own edges. The middle labels are
 * dropped on a narrow chart because the dates are fixed-width and overlap
 * before Recharts' own gap logic notices.
 */
function ChartTick({
  x,
  y,
  payload,
  labels,
  compact,
}: {
  readonly x?: number
  readonly y?: number
  readonly payload?: { readonly value?: string }
  readonly labels: ReadonlyArray<string>
  readonly compact: boolean
}) {
  const value = payload?.value
  if (typeof x !== 'number' || typeof y !== 'number' || value === undefined) {
    return null
  }

  const isFirst = value === labels[0]
  const isLast = value === labels.at(-1)
  const isQuarterly = labels.indexOf(value) % 2 === 1

  if (compact && isQuarterly) return null

  return (
    <text
      x={x}
      y={y + 12}
      textAnchor={isFirst ? 'start' : isLast ? 'end' : 'middle'}
      fill="var(--muted-foreground)"
      fontSize={11}
    >
      {tickDate.format(toMs(value))}
    </text>
  )
}

/** Recharts' area draws in JS, so reduced motion has to be read, not styled. */
const useReducedMotion = (): boolean => {
  const [reduced, setReduced] = useState(false)

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const sync = () => setReduced(query.matches)
    sync()
    query.addEventListener('change', sync)
    return () => query.removeEventListener('change', sync)
  }, [])

  return reduced
}

export function HistoryChart({
  points,
  values,
  principal,
  marketName,
  seriesKey,
  className,
}: {
  points: ReadonlyArray<MarketsSchema.PricePoint>
  /** Rebased series from `simulate`, same length and order as `points`. */
  values: ReadonlyArray<number>
  principal: number
  marketName: string
  /** Identity of the underlying series; a change re-runs the draw-in. */
  seriesKey: string
  className?: string
}) {
  const [cursor, setCursor] = useState<number | undefined>(undefined)
  const [compact, setCompact] = useState(false)
  const reducedMotion = useReducedMotion()
  const containerRef = useRef<HTMLDivElement>(null)

  /**
   * Whether Recharts may animate the next render. Adjusting during render is
   * React's documented pattern: setting state here re-renders before
   * committing, so the committed render already carries the new key with
   * `animate` open — which is the render that has both the new data and
   * permission to draw it.
   */
  const [draw, setDraw] = useState({ seriesKey, animate: true })
  if (draw.seriesKey !== seriesKey) {
    setDraw({ seriesKey, animate: !reducedMotion })
  }

  // Close the gate once the curve has landed, so subsequent renders settle
  // instantly instead of redrawing on every keystroke.
  useEffect(() => {
    if (!draw.animate) return
    const id = setTimeout(
      () => setDraw((d) => ({ ...d, animate: false })),
      DRAW_MS,
    )
    return () => clearTimeout(id)
  }, [draw.animate, draw.seriesKey])

  /** `values` comes from `simulate`, which returns one entry per point. */
  const rows = useMemo<ReadonlyArray<Row>>(
    () =>
      points.map((point, i) => ({
        ...point,
        ms: toMs(point.date),
        value: values[i],
      })),
    [points, values],
  )

  // The principal is part of the domain: a curve that only wanders below it is
  // meaningless without the break-even line.
  const domain = useMemo(() => {
    if (rows.length === 0) return undefined
    const low = Math.min(...rows.map((r) => r.value), principal)
    const high = Math.max(...rows.map((r) => r.value), principal)
    const pad = Math.max((high - low) * 0.12, 1)
    return [Math.max(0, low - pad), high + pad] as const
  }, [rows, principal])

  // A shorter series (period or market change) must not leave a stale cursor.
  useEffect(() => setCursor(undefined), [rows])

  // Below this width the five date labels overlap, so drop to three.
  useEffect(() => {
    const element = containerRef.current
    if (element === null) return
    const observer = new ResizeObserver(([entry]) => {
      setCompact(entry.contentRect.width < 420)
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  if (rows.length < 2 || domain === undefined) {
    return (
      <div className={cn('flex h-60 items-center justify-center', className)}>
        <p className="text-sm text-muted-foreground">
          Not enough history to chart this period.
        </p>
      </div>
    )
  }

  const last: Row = rows[rows.length - 1]
  const active: Row | undefined =
    cursor === undefined ? undefined : rows[cursor]

  const summary = `${marketName}: ${usd.format(principal)} invested on ${longDate.format(
    new Date(rows[0].ms),
  )} became ${usd.format(last.value)} as of ${longDate.format(new Date(last.ms))}.`

  const tick = { fill: 'var(--muted-foreground)', fontSize: 11 }

  return (
    <div className={cn('chart-enter flex flex-col', className)}>
      <div className="relative h-60 w-full" ref={containerRef}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={[...rows]}
            margin={{ top: 8, right: 8, bottom: 4, left: 8 }}
          >
            <defs>
              <linearGradient id="value-fill" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="0%"
                  stopColor="var(--chart-1)"
                  stopOpacity={0.22}
                />
                <stop
                  offset="100%"
                  stopColor="var(--chart-1)"
                  stopOpacity={0}
                />
              </linearGradient>
            </defs>

            <CartesianGrid
              vertical={false}
              stroke="var(--border)"
              strokeDasharray="3 5"
            />
            {/* Category axis on the ISO date: five evenly spaced ticks, which
                is what the demo showed. A numeric time axis would place ticks
                by real elapsed time and pull the first label out of view. */}
            <XAxis
              dataKey="date"
              ticks={dateTicks(rows)}
              tick={
                // First and last labels anchor inward so neither is clipped
                // by the plot edge; the curve still spans the full width.
                <ChartTick labels={dateTicks(rows)} compact={compact} />
              }
              axisLine={false}
              tickLine={false}
              minTickGap={0}
              interval={0}
              height={24}
            />
            <YAxis
              domain={domain}
              orientation="right"
              ticks={[domain[0], (domain[0] + domain[1]) / 2, domain[1]]}
              tickFormatter={(v: number) => usdCompact.format(v)}
              tick={tick}
              axisLine={false}
              tickLine={false}
              width={52}
            />
            {/* Recharts owns the hover tracking and positions the readout, so the
                tooltip cannot lag the pointer or drift at the plot edges. */}
            <Tooltip
              cursor={{ stroke: 'var(--border)' }}
              isAnimationActive={false}
              wrapperStyle={{ outline: 'none' }}
              content={({ active: hovering, payload }) => {
                if (hovering !== true || payload.length === 0) return null
                const row = payload[0].payload
                return (
                  <div
                    role="status"
                    className="chart-tooltip flex flex-col rounded-xl bg-popover px-2.5 py-1.5 text-xs text-foreground shadow-md ring-1 ring-foreground/10"
                  >
                    <span className="font-medium">
                      {shortDate.format(row.ms)}
                    </span>
                    <strong className="text-sm font-bold tabular-nums">
                      {usd.format(row.value)}
                    </strong>
                  </div>
                )
              }}
            />
            <ReferenceLine
              y={principal}
              stroke="var(--muted-foreground)"
              strokeWidth={1}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke="var(--chart-1)"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="url(#value-fill)"
              isAnimationActive={draw.animate}
              animationDuration={DRAW_MS}
              animationEasing="ease-out"
              activeDot={false}
            />
            {/* The terminal dot sits outside the series so it is not clipped
                by the plot edge. The hover dot is Recharts' `activeDot`, and
                the keyboard scrubber drives `cursor` below. */}
            <ReferenceDot
              x={last.date}
              y={last.value}
              r={4}
              fill="var(--chart-1)"
              ifOverflow="visible"
            />
            {active === undefined ? null : (
              <ReferenceDot
                x={active.date}
                y={active.value}
                r={4}
                fill="var(--chart-1)"
                ifOverflow="visible"
              />
            )}
          </AreaChart>
        </ResponsiveContainer>

        <label className="sr-only" htmlFor="history-scrubber">
          Explore investment value by date
        </label>
        <input
          id="history-scrubber"
          type="range"
          min={0}
          max={rows.length - 1}
          value={cursor ?? rows.length - 1}
          onChange={(event) => setCursor(Number(event.target.value))}
          aria-valuetext={
            active === undefined
              ? summary
              : `${shortDate.format(new Date(active.ms))}: ${usd.format(active.value)}`
          }
          className="absolute inset-x-0 bottom-0 h-px w-full cursor-ew-resize appearance-none bg-transparent focus-visible:ring-3 focus-visible:ring-ring/30 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-transparent [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-transparent"
        />
      </div>
    </div>
  )
}
