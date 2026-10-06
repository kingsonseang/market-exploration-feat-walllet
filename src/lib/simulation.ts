import type * as MarketsSchema from '#/api/market-schema'

/**
 * Historical simulation helpers.
 *
 * Everything here is an observation about past prices, never a projection
 * or a recommendation: `principal` is rebased against each historical
 * price so the first point equals the principal exactly.
 */

export interface SimulationResult {
  readonly amount: number
  readonly value: number
  readonly profit: number
  readonly percent: number
  readonly start: string
  readonly end: string
  /** Investment value at every point, same order and length as the input. */
  readonly values: ReadonlyArray<number>
}

export const simulate = (
  points: ReadonlyArray<MarketsSchema.PricePoint>,
  principal: number,
): SimulationResult | undefined => {
  if (points.length < 2) return undefined
  if (!Number.isFinite(principal) || principal <= 0) return undefined
  // .at() so the runtime guard is visible in the type: points arrive from
  // the network decoded by Schema, which does not guarantee a length.
  const first = points.at(0)
  const last = points.at(-1)
  if (first === undefined || last === undefined) return undefined
  if (!(first.price > 0)) return undefined
  const values = points.map((p) => (p.price / first.price) * principal)
  const value = values.at(-1)
  if (value === undefined) return undefined
  return {
    amount: principal,
    value,
    profit: value - principal,
    percent: ((value - principal) / principal) * 100,
    start: first.date,
    end: last.date,
    values,
  }
}

export const endingValue = (
  principal: number,
  points: ReadonlyArray<MarketsSchema.PricePoint>,
): number | undefined => simulate(points, principal)?.value

export const totalReturnPct = (
  points: ReadonlyArray<MarketsSchema.PricePoint>,
): number | undefined => simulate(points, 1)?.percent

const PERIOD_YEARS: Record<MarketsSchema.MarketPeriod, number> = {
  '1Y': 1,
  '3Y': 3,
  '5Y': 5,
}

/**
 * Trailing window for a period, ending at the last known point rather than
 * today: the provider's newest observation is the honest end of the range.
 */
export const withinPeriod = (
  points: ReadonlyArray<MarketsSchema.PricePoint>,
  period: MarketsSchema.MarketPeriod,
): ReadonlyArray<MarketsSchema.PricePoint> => {
  const last = points.at(-1)
  if (last === undefined) return points
  const endMs = Date.parse(`${last.date}T00:00:00Z`)
  if (!Number.isFinite(endMs)) return points
  const cutoff = new Date(endMs)
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - PERIOD_YEARS[period])
  const cutoffIso = cutoff.toISOString().slice(0, 10)
  return points.filter((p) => p.date >= cutoffIso)
}
