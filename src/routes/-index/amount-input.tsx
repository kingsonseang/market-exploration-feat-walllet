import { useState } from 'react'
import { cn } from 'cn'

const displayFormat = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
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

/**
 * Borderless amount field: the surrounding box draws the affordance, so the
 * input itself reads as a figure rather than a form control. Onest 700 with
 * tabular numerals keeps digits from shifting as the value changes.
 */
export function AmountInput({
  id,
  value,
  onChange,
  className,
}: {
  id?: string
  value: number
  onChange: (value: number) => void
  className?: string
}) {
  const [text, setText] = useState(() => formatAmount(value))

  return (
    <input
      id={id}
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
        'w-full border-0 bg-transparent text-2xl font-bold tracking-[-0.02em] tabular-nums outline-none',
        className,
      )}
    />
  )
}
