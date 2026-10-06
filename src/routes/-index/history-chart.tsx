import { useEffect, useMemo, useState } from 'react'
import { cn } from 'cn'
import type * as MarketsSchema from '#/api/market-schema'

/**
 * Hand-rolled SVG price chart. Ported from the prototype demo: the path,
 * baseline, grid and cursor geometry are the same, but the data comes from
 * `points` rather than any bundled dataset.
 *
 * The curve plots the *value of the investment over time* (principal
 * rebased to each point's price ratio), not raw price, so the baseline at
 * the starting principal is meaningful.
 */

const VIEW_W = 620
const VIEW_H = 204
const PLOT_PAD = 12
const AXIS_LABEL_X = 677

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

interface PlotPoint {
  readonly x: number
  readonly y: number
  readonly date: string
  readonly value: number
}

interface Geometry {
  readonly plot: ReadonlyArray<PlotPoint>
  readonly linePath: string
  readonly areaPath: string
  readonly baselineY: number
  readonly min: number
  readonly max: number
  readonly startMs: number
  readonly endMs: number
}

/** Investment value at each point, rebased to the starting principal. */
const valueSeries = (
  points: ReadonlyArray<MarketsSchema.PricePoint>,
  principal: number,
): ReadonlyArray<number> => {
  const base = points[0]?.price ?? 0
  if (base <= 0) return []
  return points.map((p) => (p.price / base) * principal)
}

const buildGeometry = (
  points: ReadonlyArray<MarketsSchema.PricePoint>,
  principal: number,
): Geometry | undefined => {
  if (points.length < 2) return undefined
  const values = valueSeries(points, principal)
  if (values.length < 2) return undefined

  // The principal itself is part of the domain: a curve that only
  // wanders below it is meaningless without the break-even line.
  const lower = Math.min(...values, principal)
  const upper = Math.max(...values, principal)
  const padding = Math.max((upper - lower) * 0.12, 1)
  const min = Math.max(0, lower - padding)
  const max = upper + padding

  const startMs = Date.parse(`${points[0].date}T00:00:00Z`)
  const endMs = Date.parse(`${points.at(-1)?.date}T00:00:00Z`)
  if (
    !Number.isFinite(startMs) ||
    !Number.isFinite(endMs) ||
    endMs === startMs
  ) {
    return undefined
  }
  const span = endMs - startMs

  const plot: ReadonlyArray<PlotPoint> = points.flatMap((point, i) => {
    const value = values[i]
    if (!value) return []
    return [
      {
        x: ((Date.parse(`${point.date}T00:00:00Z`) - startMs) / span) * VIEW_W,
        y: PLOT_PAD + ((max - value) / (max - min)) * VIEW_H,
        date: point.date,
        value,
      },
    ]
  })
  if (plot.length < 2) return undefined

  const linePath = plot
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)},${p.y.toFixed(2)}`)
    .join(' ')

  return {
    plot,
    linePath,
    areaPath: `${linePath} L${VIEW_W},${PLOT_PAD + VIEW_H} L0,${PLOT_PAD + VIEW_H} Z`,
    baselineY: PLOT_PAD + ((max - principal) / (max - min)) * VIEW_H,
    min,
    max,
    startMs,
    endMs,
  }
}

const GRID_STOPS = [0, 0.5, 1] as const
const DATE_STOPS = [0, 0.25, 0.5, 0.75, 1] as const

export function HistoryChart({
  points,
  principal,
  marketName,
  className,
}: {
  points: ReadonlyArray<MarketsSchema.PricePoint>
  principal: number
  marketName: string
  className?: string
}) {
  const geometry = useMemo(
    () => buildGeometry(points, principal),
    [points, principal],
  )
  const [cursor, setCursor] = useState<number | undefined>(undefined)

  // A shorter series (period change) must not leave a stale cursor.
  useEffect(() => setCursor(undefined), [points])

  if (geometry === undefined) {
    return (
      <div className={cn('flex h-60 items-center justify-center', className)}>
        <p className="text-sm text-muted-foreground">
          Not enough history to chart this period.
        </p>
      </div>
    )
  }

  const { plot, linePath, areaPath, baselineY, min, max, startMs, endMs } =
    geometry
  const active = cursor === undefined ? undefined : plot[cursor]
  const last = plot.at(-1)

  const summary = `${marketName}: ${usd.format(principal)} invested on ${longDate.format(
    new Date(startMs),
  )} became ${usd.format(plot.at(-1)?.value ?? 0)} as of ${longDate.format(
    new Date(endMs),
  )}.`

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div className="relative">
        <svg
          viewBox={`0 0 ${AXIS_LABEL_X + 8} ${PLOT_PAD + VIEW_H + 4}`}
          role="img"
          aria-label={summary}
          className="w-full overflow-visible"
          onPointerMove={(event) => {
            const rect = event.currentTarget.getBoundingClientRect()
            const x = ((event.clientX - rect.left) / rect.width) * AXIS_LABEL_X
            const ratio = Math.min(1, Math.max(0, x / VIEW_W))
            const index = Math.round(ratio * (plot.length - 1))
            setCursor(index)
          }}
          onPointerLeave={() => setCursor(undefined)}
        >
          <defs>
            <linearGradient id="value-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--chart-1)" stopOpacity="0.22" />
              <stop offset="100%" stopColor="var(--chart-1)" stopOpacity="0" />
            </linearGradient>
          </defs>

          {GRID_STOPS.map((t) => {
            const y = PLOT_PAD + t * VIEW_H
            const value = max - t * (max - min)
            return (
              <g key={t}>
                <path
                  d={`M0 ${y} H${VIEW_W}`}
                  stroke="var(--border)"
                  strokeDasharray="3 5"
                />
                <text
                  x={AXIS_LABEL_X}
                  y={y + 4}
                  textAnchor="end"
                  className="fill-muted-foreground text-[11px]"
                >
                  {usdCompact.format(value)}
                </text>
              </g>
            )
          })}

          <path d={areaPath} fill="url(#value-fill)" />
          <path
            d={linePath}
            fill="none"
            stroke="var(--chart-1)"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          <path
            d={`M0,${baselineY} H${VIEW_W}`}
            stroke="var(--muted-foreground)"
            strokeWidth={1}
          />
          {last !== undefined ? (
            <circle cx={last.x} cy={last.y} r={4} fill="var(--chart-1)" />
          ) : null}

          {active !== undefined ? (
            <g>
              <path
                d={`M${active.x},0 V${PLOT_PAD + VIEW_H}`}
                stroke="var(--border)"
              />
              <circle cx={active.x} cy={active.y} r={4} fill="var(--chart-1)" />
            </g>
          ) : null}
        </svg>

        {active !== undefined ? (
          <div
            role="status"
            className="pointer-events-none absolute flex flex-col rounded-xl bg-popover px-2 py-1 text-xs text-popover-foreground shadow-md ring-1 ring-foreground/10"
            style={{
              left: `${Math.max(4, Math.min(72, (active.x / VIEW_W) * 100))}%`,
              top: `${Math.max(0, (active.y / (PLOT_PAD + VIEW_H)) * 100 - 12)}%`,
            }}
          >
            <span className="text-muted-foreground">
              {shortDate.format(new Date(`${active.date}T00:00:00Z`))}
            </span>
            <strong className="font-bold tabular-nums">
              {usd.format(active.value)}
            </strong>
          </div>
        ) : null}

        <label className="sr-only" htmlFor="history-scrubber">
          Explore investment value by date
        </label>
        <input
          id="history-scrubber"
          type="range"
          min={0}
          max={plot.length - 1}
          value={cursor ?? plot.length - 1}
          onChange={(event) => setCursor(Number(event.target.value))}
          aria-valuetext={
            active === undefined
              ? summary
              : `${shortDate.format(new Date(`${active.date}T00:00:00Z`))}: ${usd.format(active.value)}`
          }
          className="absolute inset-x-0 bottom-0 h-px w-full cursor-ew-resize appearance-none bg-transparent focus-visible:ring-3 focus-visible:ring-ring/30"
        />
      </div>

      <div className="flex justify-between text-xs text-muted-foreground">
        {DATE_STOPS.map((t) => (
          <span key={t}>
            {tickDate.format(new Date(startMs + (endMs - startMs) * t))}
          </span>
        ))}
      </div>
    </div>
  )
}
