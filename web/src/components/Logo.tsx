import { useId } from 'react'

// Stripe colours and band edges sampled from media/Rainbow Gradient Check Mark.png.
const STRIPES: [string, number, number][] = [
  ['#72b807', 0, 288],
  ['#fdc218', 288, 410],
  ['#fb6f14', 410, 540],
  ['#d8132e', 540, 668],
  ['#ac25af', 668, 786],
  ['#02a3e6', 786, 1024],
]

/** The rainbow check mark, redrawn as a vector with a transparent background. Decorative. */
export function LogoMark({ className }: { className?: string }) {
  const id = useId()
  return (
    <svg viewBox="250 125 1020 805" aria-hidden focusable="false" className={className}>
      <defs>
        <linearGradient id={id} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="1024">
          {STRIPES.flatMap(([color, from, to]) => [
            <stop key={`${color}-a`} offset={from / 1024} stopColor={color} />,
            <stop key={`${color}-b`} offset={to / 1024} stopColor={color} />,
          ])}
        </linearGradient>
      </defs>
      <path
        d="M370 560 L606 810 L1150 245"
        fill="none"
        stroke={`url(#${id})`}
        strokeWidth="240"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

