import { Activity } from 'lucide-react'

export function Brand() {
  return (
    <span className="brand">
      <span className="brand-mark">
        <Activity size={20} aria-hidden />
      </span>
      recheck<span className="brand-period">.</span>
    </span>
  )
}
