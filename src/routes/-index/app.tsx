import { Check } from 'lucide-react'
import { buttonVariants } from '#/components/ui/button'
import { cn } from 'cn'
import { HistoryPanel } from './history-panel'
import { MarketList } from './market-list'

const bullets = [
  'Adjusted closing prices only',
  '1Y · 3Y · 5Y windows',
  'History, never advice',
]

export function App() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6">
      <section className="flex flex-col gap-6 overflow-hidden rounded-[32px] bg-linear-to-b from-navy-soft to-navy p-8 text-white md:p-12">
        <span className="text-sm font-medium tracking-wide text-white/70 uppercase">
          Market history
        </span>
        <h1 className="max-w-xl text-5xl font-bold tracking-tight md:text-6xl md:leading-[1.1]">
          See what $1,000 would have become
          <span className="text-(--chart-2)">.</span>
        </h1>
        <p className="max-w-lg text-white/70">
          Pick a market, pick a window, and watch a fixed amount ride purely
          historical prices. No projections, no advice.
        </p>
        <ul className="flex flex-col gap-3">
          {bullets.map((bullet) => (
            <li key={bullet} className="flex items-center gap-3 text-sm">
              <span className="flex size-6 items-center justify-center rounded-full border border-white/40">
                <Check className="size-3.5" />
              </span>
              {bullet}
            </li>
          ))}
        </ul>
        <div>
          <a
            href="#simulator"
            onClick={(event) => {
              event.preventDefault()
              document
                .getElementById('simulator')
                ?.scrollIntoView({ behavior: 'smooth' })
            }}
            className={cn(buttonVariants({ size: 'lg' }), 'rounded-full')}
          >
            Start exploring
          </a>
        </div>
      </section>
      <div
        id="simulator"
        className="grid scroll-mt-6 items-start gap-6 md:grid-cols-[320px_1fr]"
      >
        <MarketList />
        <HistoryPanel />
      </div>
    </div>
  )
}
