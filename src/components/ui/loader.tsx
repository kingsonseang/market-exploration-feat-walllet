import { cn } from 'cn'

/**
 * Loading placeholder for market data.
 *
 * A shimmer rather than a pulse: the sweep reads as "working", where a pulse
 * reads as "disabled". Opacity-only so it stays off the main thread's critical
 * path, and it settles to a plain tint under reduced motion instead of
 * disappearing entirely — the shape still needs to hold the layout.
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
