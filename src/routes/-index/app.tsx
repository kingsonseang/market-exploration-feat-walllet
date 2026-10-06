import { HistoryPanel } from './history-panel'

/**
 * Hero follows the demo's content order: eyebrow, headline, single
 * supporting line. Header and nav are intentionally omitted.
 */
export function Hero() {
  return (
    <section className="flex flex-col items-center gap-3 px-2 pt-6 pb-8 text-center">
      <span className="text-sm font-medium tracking-[0.18em] text-muted-foreground uppercase">
        The power of holding
      </span>
      <h1 className="max-w-3xl text-[clamp(2.6rem,5.65vw,4.9rem)] font-bold leading-[1.07] tracking-[-0.035em] text-balance">
        A little back then.
        <br />
        A little <span className="text-(--chart-2)">more today</span>
      </h1>
      <p className="max-w-xl text-[17px] text-muted-foreground">
        Ever wondered &ldquo;what if?&rdquo; Put a number on it.
      </p>
    </section>
  )
}

export function App() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col px-6 pb-10">
      <Hero />
      <HistoryPanel />
      <div className="mt-10 flex flex-col items-center gap-1 text-center">
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
            className="text-muted-foreground underline underline-offset-4 hover:text-foreground"
          >
            Alpha Vantage
          </a>
        </p>
      </div>
      <noscript>
        <p className="py-4 text-center text-sm text-muted-foreground">
          Enable JavaScript to use the investment calculator.
        </p>
      </noscript>
    </div>
  )
}
