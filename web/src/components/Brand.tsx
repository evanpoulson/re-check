import { LogoMark } from './Logo'

export function Brand() {
  return (
    <span className="brand">
      <span className="brand-mark">
        <LogoMark className="h-[18px] w-auto" />
      </span>
      recheck<span className="brand-period">.</span>
    </span>
  )
}
