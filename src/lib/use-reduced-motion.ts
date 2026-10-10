'use client'

import { useSyncExternalStore } from 'react'

const QUERY = '(prefers-reduced-motion: reduce)'

/**
 * Subscribes React to changes in the OS-level reduced-motion setting.
 * Called by React when the component mounts; the returned function is the cleanup.
 */
function subscribe(onChange: () => void): () => void {
  const query = window.matchMedia(QUERY)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

/** Client snapshot: the live value of the media query. */
function getSnapshot(): boolean {
  return window.matchMedia(QUERY).matches
}

/**
 * Server snapshot: used during SSR and the initial hydration pass.
 * Defaults to `false` (motion allowed). If the client value differs,
 * React re-renders right after hydration with no mismatch error.
 */
function getServerSnapshot(): boolean {
  return false
}

/**
 * `prefers-reduced-motion: reduce`, read live so a mid-session OS change takes
 * effect without a reload.
 *
 * Deliberately independent of any animation library: the chart uses it to gate
 * Recharts' JS-driven area draw, which no component library can do for it.
 */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
