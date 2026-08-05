import type { SVGProps } from 'react'

export function MomentumMark({ className = '', ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 48 48"
      className={className}
      fill="none"
      aria-hidden="true"
      {...props}
    >
      <rect width="48" height="48" rx="14" fill="url(#mark-gradient)" />
      <path
        d="M11 32V16.5L18.7 25 24 17l5.2 8 7.8-8.5V32"
        stroke="white"
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M11 36h26" stroke="white" strokeWidth="3.2" strokeLinecap="round" />
      <defs>
        <linearGradient id="mark-gradient" x1="5" y1="5" x2="44" y2="45">
          <stop stopColor="#FF5A67" />
          <stop offset="1" stopColor="#B80F25" />
        </linearGradient>
      </defs>
    </svg>
  )
}

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="brand-lockup">
      <MomentumMark className={compact ? 'h-10 w-10' : 'h-12 w-12'} />
      <span className="font-heading text-xl font-bold tracking-[-0.03em]">Momentum</span>
    </div>
  )
}

