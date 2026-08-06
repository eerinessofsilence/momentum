import type { ImgHTMLAttributes } from 'react'

export function MomentumMark({ className = '', alt = '', ...props }: ImgHTMLAttributes<HTMLImageElement>) {
  return <img src="/momentum-mark.svg" className={className} alt={alt} {...props} />
}

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="brand-lockup">
      <MomentumMark className={compact ? 'h-10 w-10' : 'h-12 w-12'} />
      <span className="font-heading text-xl font-bold tracking-[-0.03em]">Momentum</span>
    </div>
  )
}
