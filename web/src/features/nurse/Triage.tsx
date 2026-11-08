import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getTriageBoard, getWorklist } from '@/api/api'
import type { ComplaintGroup, TaskLevel } from '@/api/types'
import { CountdownChip } from '@/components/CountdownChip'
import { InfoTip } from '@/components/InfoTip'
import { LevelChip } from '@/components/LevelChip'
import { Sparkline } from '@/components/Sparkline'
import { StateChip } from '@/components/StateChip'
import { Card } from '@/components/ui/card'
import { UserRoundCheck } from 'lucide-react'
import {
  LEVEL_ORDER,
  appNotOffered,
  applyFilters,
  conditionOf,
  countByLevel,
  joinBoard,
  shortRef,
  sortQueue,
  type BoardItem,
  type Filters,
} from '@/lib/board'
import { clock, formatMinutes, sinceMs, useNow } from '@/lib/time'
import { cn } from '@/lib/utils'
import { SiteSettingsCard } from './SiteSettings'
import { useDashboardEvents } from './useDashboardEvents'

const COMPLAINTS: ComplaintGroup[] = ['chest_back_pain', 'neuro_change', 'head_injury', 'general']
const SELECT = 'select-pill'
const pill = 'inline-flex items-center rounded-full px-2.5 py-0.5 text-[0.8125rem] font-semibold whitespace-nowrap'

/** The board data is TriageBoard joined with Worklist on visit id, sorted client side. */
export function useBoard() {
  return useQuery({
    queryKey: ['board'],
    queryFn: async () => {
      const [board, worklist] = await Promise.all([getTriageBoard(), getWorklist()])
      // The board joins two server snapshots, so it is only as fresh as the older one.
      const asOf = Date.parse(board.generated_at) < Date.parse(worklist.generated_at) ? board.generated_at : worklist.generated_at
      return { items: joinBoard(board, worklist), asOf }
    },
  })
}

export function Triage() {
  const { t } = useTranslation()
  const { live } = useDashboardEvents()
  const { data: snapshot, isPending, isError } = useBoard()
  const now = useNow()
  const [filters, setFilters] = useState<Filters>({ needsReview: false, ctas: null, complaint: null })

  if (isPending) return <main id="main-content" className="p-6">{t('common.loading')}</main>
  // A failed refresh keeps the last rows on screen; only a board that never loaded shows the error.
  if (!snapshot) return <main id="main-content" className="p-6 font-semibold text-level-red" role="alert">{t('triage.failed')}</main>
  // Live only while the browser is online and the last refresh succeeded.
  const current = live && !isError

  const ordered = sortQueue(snapshot.items)
  const rows = applyFilters(ordered, filters)
  const counts = countByLevel(ordered)

  return (
    // Wider than .staff-page so the whole board fits; same top padding and heading as other staff pages.
    <main id="main-content" className="mx-auto max-w-[88rem] space-y-6 px-4 pt-7 pb-10 sm:px-6">
      <header className="page-heading flex-wrap">
        <div>
          <h1>{t('pages.triage')}</h1>
          <p className="pl-1">{t('triage.order')}</p>
        </div>
        {/* The time is the server's, from the last refresh that succeeded, so it shows how fresh the rows are. */}
        <span
          className={cn(
            'tabular inline-flex shrink-0 items-center gap-2 rounded-full px-3 py-1.5 text-[0.8125rem] shadow-card',
            current ? 'bg-surface text-muted' : 'bg-level-amber-bg font-semibold text-level-amber',
          )}
          role="status"
        >
          <span aria-hidden className={cn('size-2 rounded-full', current ? 'bg-brand-500' : 'bg-level-amber')} />
          {t(current ? 'triage.live' : 'triage.reconnecting', { time: clock(snapshot.asOf) })}
        </span>
      </header>

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5" aria-label={t('triage.counts')}>
        {LEVEL_ORDER.map((level: TaskLevel) => (
          <li key={level}>
            {/* relative: the tooltip hangs below the card, so it never covers the count. */}
            <Card className="relative flex h-full flex-col items-start gap-3 p-5">
              <div className="flex w-full items-center justify-between gap-2">
                <LevelChip level={level} />
                <InfoTip label={t('triage.levelInfo', { level: t(`level.${level}`) })} className="-my-1.5 -mr-2">
                  <span className="block leading-tight font-semibold">{t(`triage.levelHelp.${level}.title`)}</span>
                  <span className="mt-1 block space-y-0.5">
                    {(['what', 'then'] as const).map((part) => (
                      <span key={part} className="flex gap-1.5">
                        <span aria-hidden className="text-white/60">•</span>
                        <span>{t(`triage.levelHelp.${level}.${part}`)}</span>
                      </span>
                    ))}
                  </span>
                  <span className="mt-1.5 block border-t border-white/15 pt-1.5 text-white/65">{t('triage.levelCount')}</span>
                </InfoTip>
              </div>
              <span className="tabular text-4xl font-semibold tracking-tight">{counts[level]}</span>
            </Card>
          </li>
        ))}
      </ul>

      <SiteSettingsCard />

      <Card className="overflow-clip p-0">
        {/* The filters sit with the table they filter. */}
        <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-4">
          <label
            className={cn(
              'flex min-h-11 cursor-pointer items-center gap-2 rounded-tap border px-4 text-[0.9375rem] font-medium transition-colors',
              filters.needsReview ? 'border-ink bg-ink text-white' : 'border-line bg-surface hover:border-muted',
            )}
          >
            <input type="checkbox" checked={filters.needsReview} onChange={(e) => setFilters({ ...filters, needsReview: e.target.checked })} className="size-4 accent-brand-500" />
            {t('triage.needsReview')}
          </label>
          <label className="flex items-center gap-2">
            <span className="text-[0.9375rem] text-muted">{t('triage.ctas')}</span>
            <select className={SELECT} value={filters.ctas ?? ''} onChange={(e) => setFilters({ ...filters, ctas: e.target.value ? Number(e.target.value) : null })}>
              <option value="">{t('triage.all')}</option>
              {[2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2">
            <span className="text-[0.9375rem] text-muted">{t('triage.complaint')}</span>
            <select className={SELECT} value={filters.complaint ?? ''} onChange={(e) => setFilters({ ...filters, complaint: e.target.value || null })}>
              <option value="">{t('triage.all')}</option>
              {COMPLAINTS.map((c) => (
                <option key={c} value={c}>{t(`complaint.${c}`)}</option>
              ))}
            </select>
          </label>
        </div>
        {/* On narrow screens the table scrolls sideways; its cut-off edge fades instead of chopping text. */}
        <div className="table-scroll">
        <table className="w-full min-w-[64rem] border-collapse text-left text-sm">
          <caption className="sr-only">{t('triage.caption')}</caption>
          <thead className="text-muted">
            <tr className="border-b border-line">
              {['place', 'ref', 'ctas', 'complaint', 'waiting', 'condition', 'flags', 'lastCheckin', 'nextCheckin', 'reassess', 'pain'].map((c) => (
                <th key={c} scope="col" className={cn('eyebrow whitespace-nowrap px-2 pb-3 pt-4 align-bottom first:pl-5 last:pr-5', c === 'place' && 'text-center')}>{t(`triage.col.${c}`)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={11} className="px-3 py-6 text-center text-muted">{t('triage.empty')}</td></tr>
            )}
            {rows.map((item) => (
              // The place in line is the patient's position in the full queue, so filtering never renumbers it.
              <Row key={item.board.visit_id} item={item} place={ordered.indexOf(item) + 1} now={now} />
            ))}
          </tbody>
        </table>
        </div>
      </Card>
    </main>
  )
}

function Row({ item, place, now }: { item: BoardItem; place: number; now: number }) {
  const { t } = useTranslation()
  const { board, work } = item
  const since = sinceMs(work.last_report?.at ?? null, now)
  const flagged = board.level !== null
  const excluded = appNotOffered(work)
  return (
    <tr className={cn('border-t border-line/70 align-middle transition-colors first:border-t-0 hover:bg-canvas/60', flagged && 'bg-brand-50/50')}>
      {/* The place in line. It is queue order only and never changes when a flag arrives. */}
      <th scope="row" className="tabular w-20 py-4 pl-5 pr-2 text-center text-3xl font-semibold tracking-tight text-muted">
        <span className="sr-only">{t('triage.col.place')} </span>
        {place}
      </th>
      <td className="whitespace-nowrap px-2 py-4 font-semibold">
        <Link to={`/staff/visits/${board.visit_id}`} className="text-brand-600 hover:underline underline-offset-4">
          {shortRef(work)}
        </Link>
        {!excluded && (
          <div className="text-sm font-normal text-muted">{t(`signedIn.short.${work.visit.signed_in_as ?? 'none'}`)}</div>
        )}
      </td>
      <td className="tabular px-2 py-3">{board.ctas}</td>
      {/* Long complaint names wrap to two balanced lines at most; the full name stays in the tooltip. */}
      <td className="max-w-48 min-w-36 px-2 py-4">
        <span className="line-clamp-2 text-balance" title={t(`complaint.${board.complaint_group}`)}>
          {t(`complaint.${board.complaint_group}`)}
        </span>
      </td>
      <td className="tabular px-2 py-3 whitespace-nowrap">{formatMinutes(now - Date.parse(board.triaged_at))}</td>
      <td className="px-2 py-4"><StateChip condition={conditionOf(work)} /></td>
      <td className="px-2 py-4">
        <div className="flex flex-wrap gap-1.5">
          {board.level && <LevelChip level={board.level} />}
          {excluded && (
            <span className={cn(pill, 'gap-1 border border-line bg-surface text-ink')}>
              <UserRoundCheck aria-hidden className="size-4" />
              {t('flags.appNotOffered', { reason: t(`exclusion.${work.visit.app_exclusion}`) })}
            </span>
          )}
          {!excluded && (work.silent || work.prompt_overdue) && board.level !== 'silent' && (
            <span className={cn(pill, 'bg-level-silent-bg text-level-silent')}>{t('flags.noResponse')}</span>
          )}
          {work.leave_risk && board.level !== 'leave_risk' && (
            <span className={cn(pill, 'bg-level-leave-bg text-level-leave')}>{t('level.leave_risk')}</span>
          )}
          {board.reassess_overdue && (
            <span className={cn(pill, 'bg-level-overdue-bg text-level-overdue')}>{t('flags.reassessOverdue')}</span>
          )}
          {!excluded && !board.level && !work.silent && !work.prompt_overdue && !work.leave_risk && !board.reassess_overdue && (
            <span className="text-muted">{t('common.none')}</span>
          )}
        </div>
      </td>
      <td className="px-2 py-4 whitespace-nowrap">
        {work.last_report && since !== null ? (
          <>
            <span className="tabular">{t('time.ago', { value: formatMinutes(since) })}</span>
            <span className="block text-muted">
              {t(`reporter.${work.last_report.reporter}`)}, {t(`channel.${work.last_report.channel}`)}
            </span>
          </>
        ) : (
          <span className="text-muted">{excluded ? t('triage.noApp') : t('triage.noCheckin')}</span>
        )}
      </td>
      <td className="px-2 py-4">
        {excluded ? <span className="text-muted">{t('time.notApplicable')}</span> : <CountdownChip due={work.visit.next_prompt_due_at} now={now} />}
      </td>
      <td className="px-2 py-4"><CountdownChip due={board.staff_reassess_due_at} now={now} /></td>
      <td className="py-4 pl-2 pr-5"><Sparkline trend={work.trend} width={80} /></td>
    </tr>
  )
}
