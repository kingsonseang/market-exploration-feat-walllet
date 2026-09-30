import { useState } from 'react'
import { cn } from 'cn'

const displayFormat = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 2,
})

const formatAmount = (value: number): string =>
  Number.isFinite(value) ? displayFormat.format(value) : ''

const parseAmount = (text: string): number | undefined => {
  const cleaned = text.replace(/[^0-9.]/g, '')
  if (cleaned === '' || cleaned === '.') return undefined
  const parsed = Number(cleaned)
  return Number.isFinite(parsed) ? parsed : undefined
}

// Borderless display-style amount input. No visible bounds by design:
// it should read as a figure, not a form field.
export function AmountInput({
  value,
  onChange,
  className,
}: {
  value: number
  onChange: (value: number) => void
  className?: string
}) {
  const [text, setText] = useState(() => formatAmount(value))

  return (
    <input
      inputMode="decimal"
      aria-label="Amount in dollars"
      value={text}
      onChange={(event) => {
        setText(event.target.value)
        const parsed = parseAmount(event.target.value)
        if (parsed !== undefined) onChange(parsed)
      }}
      onBlur={() => setText(formatAmount(value))}
      className={cn(
        'w-full border-0 bg-transparent font-display text-4xl font-bold tabular-nums outline-none placeholder:text-muted-foreground',
        className,
      )}
    />
  )
}
