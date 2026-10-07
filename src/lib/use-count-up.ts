import { useEffect, useRef, useState } from 'react'

/**
 * Cubic-bezier easing solver, matching `cubic-bezier(0.23, 1, 0.32, 1)` — the
 * same curve as `--ease-out` in styles.css.
 *
 * A CSS transition cannot tween between text, so the count-up has to drive its
 * own progress. That means owning the curve too, and approximating it with
 * `1 - (1 - t) ** 3` would visibly diverge from the rest of the app near the
 * start, where this curve is steepest. Solved properly instead: find t for a
 * given x with bisection, then evaluate y at that t.
 */
const bezier = (() => {
  const x1 = 0.23
  const y1 = 1
  const x2 = 0.32
  const y2 = 1

  const cx = (t: number) =>
    ((1 - 3 * x2 + 3 * x1) * t + (3 * x2 - 6 * x1)) * t * t + 3 * x1 * t
  const cy = (t: number) =>
    ((1 - 3 * y2 + 3 * y1) * t + (3 * y2 - 6 * y1)) * t * t + 3 * y1 * t

  return (x: number): number => {
    // Bisect on t: cx is monotonic here, so 24 iterations is exact to double
    // precision and costs less than a frame.
    let lo = 0
    let hi = 1
    let t = x
    for (let i = 0; i < 24; i += 1) {
      t = (lo + hi) / 2
      if (cx(t) < x) lo = t
      else hi = t
    }
    return cy(t)
  }
})()

/**
 * Count a number up to its target.
 *
 * Hand-rolled rather than a CSS transition because the digits are text, and CSS
 * cannot interpolate between "1,000.00" and "1,508.18". One rAF loop is the
 * cheapest tool that works and needs no dependency.
 *
 * The loop always starts from whatever is currently on screen rather than from
 * the previous target. That matters because this figure updates on every
 * keystroke in the amount field: a fresh tween from zero per character would
 * make the number jump backwards on each key, while restarting from the live
 * displayed value glides from wherever it happens to be. Cancel-and-restart is
 * also what keeps it interruptible — a CSS keyframe would restart from zero.
 */
export function useCountUp(
  target: number,
  durationMs: number,
  options: { readonly enabled?: boolean } = {},
): number {
  const { enabled = true } = options

  const [displayed, setDisplayed] = useState(target)
  const frame = useRef<number | undefined>(undefined)
  const displayedRef = useRef(target)

  useEffect(() => {
    if (!enabled) {
      displayedRef.current = target
      setDisplayed(target)
      return
    }

    const from = displayedRef.current
    const delta = target - from

    // Nothing to travel, or no time budget to travel in.
    if (delta === 0 || durationMs <= 0) {
      displayedRef.current = target
      setDisplayed(target)
      return
    }

    const start = performance.now()

    const step = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs)
      const next = from + delta * bezier(t)
      displayedRef.current = next
      setDisplayed(next)
      if (t < 1) {
        frame.current = requestAnimationFrame(step)
      } else {
        displayedRef.current = target
        setDisplayed(target)
      }
    }

    frame.current = requestAnimationFrame(step)

    return () => {
      if (frame.current !== undefined) {
        cancelAnimationFrame(frame.current)
        frame.current = undefined
      }
    }
  }, [target, durationMs, enabled])

  return displayed
}

/** `prefers-reduced-motion: reduce`, read live so a mid-session OS change
 * takes effect without a reload. */
export function useReducedMotion(): boolean {
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
