import { HistoryPanel } from './history-panel'

/**
 * Hero follows the demo's content order: headline, single supporting line.
 * Header and nav are intentionally omitted.
 *
 * Layout mirrors the brand page: the backdrop bleeds to the viewport edge while
 * the type stays inside the same 84px / 32px gutter as the rest of the page.
 * Type matches the demo's clamp, 1.07 leading and -3.7px tracking, and each line
 * rises in on load — a one-shot entrance, staggered so the group doesn't land
 * as a single block.
 */
export function Hero() {
  return (
    <section className="px-8 pt-12 pb-9 text-center min-[810px]:px-21 min-[810px]:pt-16 min-[810px]:pb-12">
      <h1 className="mx-auto max-w-3xl text-[clamp(35px,7.7vw,57px)] font-bold tracking-[-2px] text-balance min-[761px]:text-[clamp(42px,5.65vw,78px)] min-[761px]:tracking-[-3.7px]">
        <span className="hero-rise hero-rise-1 block leading-[1.07]">
          A little back then.
        </span>
        <span className="hero-rise hero-rise-2 block leading-[1.07]">
          A little more today
          <span className="text-brand-lime">.</span>
        </span>
      </h1>
      <p className="hero-rise hero-rise-3 mx-auto mt-3 max-w-xl text-[17px] text-balance">
        Ever wondered <strong>&ldquo;what if?&rdquo;</strong> Put a number on
        it—a look back, not a prediction.
      </p>
    </section>
  )
}

export function App() {
  return (
    <main className="relative isolate oveflow-clip">
      <img
        src="/hero-coin-ring.svg"
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 size-full object-cover object-center"
      />
      <Hero />
      <section className="mx-auto flex w-full max-w-300 flex-col px-8 pb-10 min-[810px]:px-21">
        <HistoryPanel />
        <footer className="mt-10 flex flex-col items-center gap-1 text-center">
          <p className="text-sm font-medium">
            One investment. Held through the ups and downs.
          </p>
          <p className="max-w-md text-xs text-muted-foreground">
            Historical prices, not future promises. Fees and taxes excluded.
          </p>
          <p className="text-xs">
            Price data:{' '}
            <a
              href="https://www.alphavantage.co/"
              target="_blank"
              rel="noreferrer"
              className="text-muted-foreground underline underline-offset-4 transition-colors duration-150 ease-out hover:text-foreground"
            >
              Alpha Vantage
            </a>
          </p>
        </footer>
        <noscript>
          <p className="py-4 text-center text-sm text-muted-foreground">
            Enable JavaScript to use the investment calculator.
          </p>
        </noscript>
      </section>
    </main>
  )
}
