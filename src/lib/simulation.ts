import type * as MarketsSchema from '#/api/market-schema'

// Historical value of a fixed principal over the given points.
// Pure adjusted-close math: endingValue = principal * (endPrice / startPrice).
// Returns undefined when the window is empty or the start price is not
// positive. Never a projection or recommendation.
export const endingValue = (
  principal: number,
  points: ReadonlyArray<MarketsSchema.PricePoint>,
): number | undefined => {
  if (points.length === 0 || principal < 0) return undefined
  const first = points[0]
  const last = points[points.length - 1]
  if (first.price <= 0) return undefined
  return (principal * last.price) / first.price
}

export const totalReturnPct = (
  points: ReadonlyArray<MarketsSchema.PricePoint>,
): number | undefined => {
  if (points.length === 0) return undefined
  const first = points[0]
  const last = points[points.length - 1]
  if (first.price <= 0) return undefined
  return ((last.price - first.price) / first.price) * 100
}
