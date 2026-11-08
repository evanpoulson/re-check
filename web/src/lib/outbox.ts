import { postReport } from '@/api/api'
import { ApiError, isNetworkError } from '@/api/client'
import type { PatientReport, ReportReceipt } from '@/api/types'

// Reports that could not be sent are kept here and retried with the SAME body,
// so the same submission id is reused and the server drops duplicates.
const KEY = 'recheck-outbox-v1'

const read = (): PatientReport[] => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]') as PatientReport[]
  } catch {
    return []
  }
}
const write = (items: PatientReport[]) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(items))
  } catch {
    /* nothing more we can do */
  }
}

export const pendingCount = () => read().length

export type SendResult = { queued: false; receipt: ReportReceipt } | { queued: true }

/** Send a report. If the network is down, save it and say so instead of failing silently. */
export async function sendReport(body: PatientReport): Promise<SendResult> {
  try {
    return { queued: false, receipt: await postReport(body) }
  } catch (err) {
    if (!isNetworkError(err)) throw err
    const items = read()
    if (!items.some((i) => i.submission_id === body.submission_id)) write([...items, body])
    return { queued: true }
  }
}

/** Retry saved reports in order. A report the server rejects is dropped; a network failure stops the run. */
export async function flushOutbox(): Promise<number> {
  let sent = 0
  for (const body of read()) {
    try {
      await postReport(body)
    } catch (err) {
      if (isNetworkError(err)) break
      if (!(err instanceof ApiError)) break
    }
    write(read().filter((i) => i.submission_id !== body.submission_id))
    sent += 1
  }
  return sent
}
