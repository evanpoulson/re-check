// Cut from media/Rainbow Gradient Check Mark.png with its black background removed.
import logo from '@/assets/logo.png'

/** The wordmark is Latin text, so it reads "recheck." left to right even on Arabic and Urdu pages. */
export function Brand() {
  return (
    <span className="brand" dir="ltr">
      <img src={logo} alt="" className="brand-mark" />
      recheck<span className="brand-period">.</span>
    </span>
  )
}
