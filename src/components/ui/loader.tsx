import { cn } from 'cn'

/**
 * Loading placeholder for market data.
 *
 * A sweeping highlight rather than a pulse: travelling light reads as
 * "working", where a pulse reads as "disabled" — or, worse, as a blink. The
 * sweep is transform-only so it stays on the compositor, and it settles to a
 * plain tint under reduced motion: the shape's job is to hold the layout, not
 * to move.
 */
function Loader({
  className,
  label = 'Loading',
}: {
  className?: string
  label?: string
}) {
  return (
    <div
      role="status"
      aria-label={label}
      className={cn(
        'loader-shimmer overflow-hidden rounded-2xl bg-muted',
        className,
      )}
    />
  )
}

export { Loader }
