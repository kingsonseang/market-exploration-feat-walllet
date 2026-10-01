import type * as MarketsSchema from '#/api/market-schema'

/** Trading days in a period window: 1Y / 3Y / 5Y. */
export const PERIOD_TRADING_DAYS: Record<MarketsSchema.MarketPeriod, number> = {
  '1Y': 252,
  '3Y': 756,
  '5Y': 1260,
}

/** Period length in whole years, used to build calendar date ranges. */
export const PERIOD_YEARS: Record<MarketsSchema.MarketPeriod, number> = {
  '1Y': 1,
  '3Y': 3,
  '5Y': 5,
}

const toIsoDate = (date: Date): string => date.toISOString().slice(0, 10)

const addYears = (date: Date, years: number): Date => {
  const next = new Date(date)
  next.setUTCFullYear(next.getUTCFullYear() - years)
  return next
}

/**
 * Calendar date range for a period, ending on `today`.
 * Calendar years rather than trading-day counts: providers accept dates, and
 * trading-day slicing happens after decode. The longest window is 5Y, which
 * stays well inside typical per-request point limits.
 */
export const periodDateRange = (
  period: MarketsSchema.MarketPeriod,
  today: Date = new Date(),
): { readonly startDate: string; readonly endDate: string } => ({
  startDate: toIsoDate(addYears(today, PERIOD_YEARS[period])),
  endDate: toIsoDate(today),
})
