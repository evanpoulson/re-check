import { CircleAlert, Inbox, LoaderCircle } from 'lucide-react'
import { Button } from './ui/button'

export function PageState({
  title,
  body,
  loading,
  retry,
}: {
  title: string
  body?: string
  loading?: boolean
  retry?: () => void
}) {
  const Icon = loading ? LoaderCircle : retry ? CircleAlert : Inbox
  return (
    <div className="page-state" role={retry ? 'alert' : 'status'}>
      <Icon aria-hidden className={loading ? 'animate-spin' : ''} size={28} />
      <h2>{title}</h2>
      {body && <p>{body}</p>}
      {retry && (
        <Button variant="secondary" onClick={retry}>
          Try again
        </Button>
      )}
    </div>
  )
}
