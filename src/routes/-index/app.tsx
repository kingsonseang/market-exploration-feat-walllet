import { Check } from 'lucide-react'
import { buttonVariants } from '#/components/ui/button'
import { cn } from 'cn'
import { HistoryPanel } from './history-panel'

const bullets = [
  'Adjusted closing prices only',
  '1Y · 3Y · 5Y windows',
  'A look back, not a prediction',
]

export function App() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6">
      <section className="flex flex-col gap-6 overflow-hidden rounded-4xl bg-linear-to-b from-navy-soft to-navy p-8 text-white md:p-12">
        <span className="text-sm font-medium tracking-wide text-white/70 uppercase">
          A little market perspective
        </span>
        <h1 className="max-w-xl text-5xl font-bold tracking-tight md:text-6xl md:leading-[1.1]">
          The power of holding
          <span className="text-chart-2">.</span>
        </h1>
        <p className="max-w-lg text-white/70">
          Ever wondered &ldquo;what if?&rdquo; Put a number on it. Pick a
          market, pick how long ago, and watch a fixed amount ride purely
          historical prices.
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
      <div id="simulator" className="scroll-mt-6">
        <HistoryPanel />
      </div>
    </div>
  )
}
