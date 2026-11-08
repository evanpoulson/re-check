// The backend's CEDIS complaint map: code to complaint group, and complaints
// where the app is not offered. Read from a generated copy of
// question-bank/cedis-groups.json, so the list and rules match the backend.
import cedisJson from './bank/cedis-groups.json'
import type { AppExclusion, ComplaintGroup } from './types'

interface ConceptMap {
  group: { target: string; element: { code: string; display?: string; target: { code: string }[] }[] }[]
}
const map = cedisJson as unknown as ConceptMap

export interface CedisEntry {
  code: string
  name: string
  /** Set when the code maps to a complaint group. */
  group?: ComplaintGroup
  /** Set when the app is not offered for this complaint. */
  exclusion?: AppExclusion
}

const GROUP = 'urn:recheck:codes:complaint-group'
const EXCLUSION = 'urn:recheck:codes:app-exclusion'

const entries = new Map<string, CedisEntry>()
for (const g of map.group) {
  for (const e of g.element) {
    const prior = entries.get(e.code) ?? { code: e.code, name: e.display ?? e.code }
    const target = e.target[0]!.code
    if (g.target === GROUP) prior.group = target as ComplaintGroup
    if (g.target === EXCLUSION) prior.exclusion = target as AppExclusion
    entries.set(e.code, prior)
  }
}

/** Every mapped CEDIS code, sorted by code, for the enrolment picker. */
export const cedisEntries: CedisEntry[] = [...entries.values()].sort((a, b) => a.code.localeCompare(b.code))

export const lookupCedis = (code: string | null | undefined): CedisEntry | undefined => (code ? entries.get(code) : undefined)

/** The mapped group for a code. Unknown or missing codes fall back to general, as the backend does. */
export const groupForCedis = (code: string | null | undefined): ComplaintGroup => lookupCedis(code)?.group ?? 'general'

/** A suggested exclusion. The nurse can still set one for another reason, such as age. */
export const exclusionForCedis = (code: string | null | undefined): AppExclusion | null => lookupCedis(code)?.exclusion ?? null

/**
 * Mirrors check_enrolment() in question_bank.py. Returns the conflict message,
 * or null when the nurse's choices agree with the map. Unlisted codes leave the
 * group to the nurse, and any visit can be excluded.
 */
export function checkEnrolment(v: {
  cedis_code: string | null
  complaint_group: ComplaintGroup
  app_exclusion: AppExclusion | null
}): { kind: 'exclusion' | 'group'; message: string; mapped?: ComplaintGroup | AppExclusion } | null {
  const entry = lookupCedis(v.cedis_code)
  if (!entry) return null
  if (entry.exclusion && v.app_exclusion === null) {
    return { kind: 'exclusion', mapped: entry.exclusion, message: `CEDIS ${entry.code} is not offered the app (${entry.exclusion}); set an exclusion` }
  }
  if (entry.group && v.complaint_group !== entry.group) {
    return { kind: 'group', mapped: entry.group, message: `CEDIS ${entry.code} belongs to ${entry.group}, not ${v.complaint_group}` }
  }
  return null
}
