// Cut from media/Rainbow Gradient Check Mark.png with its black background removed.
import logo from '@/assets/logo.png'

export function Brand() {
  return (
    <span className="brand">
      <img src={logo} alt="" className="brand-mark" />
      recheck<span className="brand-period">.</span>
    </span>
  )
}
