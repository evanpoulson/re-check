// Reads the backend's FHIR question bank (a generated copy of question-bank/).
// It is the source of every question wording, option label, companion wording
// and branching rule. Nothing here is retyped by hand, so the UI cannot drift
// from the backend. Run `npm run gen:contract` after the bank changes.
import questionnaireJson from './bank/questionnaire.json'
import type { Role } from './types'

export interface Coding {
  system?: string
  code: string
  display?: string
}
export interface BankItem {
  linkId: string
  type: string
  text?: string
  repeats?: boolean
  enableBehavior?: 'any' | 'all'
  enableWhen?: {
    question: string
    operator: string
    answerBoolean?: boolean
    answerString?: string
    answerCoding?: Coding
  }[]
  answerOption?: { valueCoding: Coding }[]
  extension?: Record<string, unknown>[]
  item?: BankItem[]
}
interface Questionnaire {
  version: string
  item: BankItem[]
  extension?: Record<string, unknown>[]
}

export const questionnaire = questionnaireJson as unknown as Questionnaire

const EXT = 'urn:recheck:fhir:'

function walk(items: BankItem[]): BankItem[] {
  return items.flatMap((i) => [i, ...walk(i.item ?? [])])
}
export const bankItems = new Map(walk(questionnaire.item).map((i) => [i.linkId, i]))

export function item(linkId: string): BankItem {
  const found = bankItems.get(linkId)
  if (!found) throw new Error(`Question bank has no item "${linkId}"`)
  return found
}

/** The first value of an extension, in the Recheck namespace or a full URL. */
export function ext<T = unknown>(element: { extension?: Record<string, unknown>[] }, name: string): T | undefined {
  const url = name.includes('://') ? name : EXT + name
  const found = element.extension?.find((e) => e.url === url)
  if (!found) return undefined
  const key = Object.keys(found).find((k) => k.startsWith('value'))
  return key ? (found[key] as T) : undefined
}

export const bankVersion = questionnaire.version

/** Patient wording, or the bank's own companion wording when a companion is answering. */
export function text(linkId: string, role: Role): string {
  const i = item(linkId)
  if (role === 'companion') return ext<string>(i, 'companion-text') ?? i.text ?? linkId
  return i.text ?? linkId
}

export interface Option {
  code: string
  text: string
}
export const options = (linkId: string): Option[] =>
  (item(linkId).answerOption ?? []).map((o) => ({ code: o.valueCoding.code, text: o.valueCoding.display ?? o.valueCoding.code }))

export function optionLabel(linkId: string, code: string): string {
  return options(linkId).find((o) => o.code === code)?.text ?? code
}

/** Whether the question shows a "Not sure" button. Defaults to true, as the backend does. */
export const allowUnsure = (linkId: string): boolean => ext<boolean>(item(linkId), 'allow-unsure') ?? true

/** The label for the "none of these" choice on a tick-all question. */
export const noneOption = (linkId: string): string | undefined => ext<string>(item(linkId), 'none-option')

export interface AttentionParams {
  circlesMin: number
  circlesMax: number
  squaresMin: number
  squaresMax: number
  showMs: number
  gapMs: number
  expiresMinutes: number
}
export function attentionParams(): AttentionParams {
  const i = item('circle_count')
  const n = (name: string) => {
    const v = ext<number>(i, `attention-${name}`)
    if (typeof v !== 'number') throw new Error(`circle_count is missing attention-${name}`)
    return v
  }
  return {
    circlesMin: n('circles-min'),
    circlesMax: n('circles-max'),
    squaresMin: n('squares-min'),
    squaresMax: n('squares-max'),
    showMs: n('show-ms'),
    gapMs: n('gap-ms'),
    expiresMinutes: n('expires-minutes'),
  }
}

/** Child link ids of a section (`base`, `follow_up`, `always_visible`). */
export const section = (linkId: string): string[] => (item(linkId).item ?? []).map((i) => i.linkId)

/** Buttons shown on every screen, in the bank's order, with their contract codes. */
export function alwaysVisible(): { linkId: string; concern?: string; reportKind?: string }[] {
  return section('always_visible').map((linkId) => ({
    linkId,
    concern: ext<string>(item(linkId), 'concern-code'),
    reportKind: ext<string>(item(linkId), 'report-kind'),
  }))
}
