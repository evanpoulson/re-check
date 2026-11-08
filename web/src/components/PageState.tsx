import { CircleAlert, Inbox, LoaderCircle } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from './ui/button'

export function PageState({
  title,
  body,
  loading,
  retry,
  action,
}: {
  title: string
  body?: string
  loading?: boolean
  retry?: () => void
  /** Another way out of an empty state, such as "Clear search". */
  action?: ReactNode
}) {
  const { t } = useTranslation()
  const Icon = loading ? LoaderCircle : retry ? CircleAlert : Inbox
  return (
    <div className="page-state" role={retry ? 'alert' : 'status'}>
      <Icon aria-hidden className={loading ? 'size-7 animate-spin' : 'size-7'} />
      <h2>{title}</h2>
      {body && <p>{body}</p>}
      {retry && (
        <Button variant="secondary" onClick={retry}>
          {t('common.retry')}
        </Button>
      )}
      {action}
    </div>
  )
}
