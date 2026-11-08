// Reads the backend's FHIR question bank (a generated copy of question-bank/).
// It is the source of every question wording, option label, companion wording
// and branching rule. Nothing here is retyped by hand, so the UI cannot drift
// from the backend. Run `npm run gen:contract` after the bank changes.
import i18n from '@/i18n'
import questionnaireJson from './bank/questionnaire.json'
import type { QuestionItem, Role } from './types'

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

// ---- Translations --------------------------------------------------------

interface ItemWording {
  text?: string
  companion?: string
  options?: Record<string, string>
  none?: string
}
export interface Translation {
  language: string
  bankVersion: string
  /** `draft` has not been checked by a certified medical translator. */
  status: 'draft' | 'reviewed'
  items: Record<string, ItemWording>
}

const translationFiles = import.meta.glob<Translation>('./bank/translations/*.json', { eager: true, import: 'default' })

/** Translations written for this bank version, by language. Older ones are ignored, so English shows. */
export const translations: Record<string, Translation> = Object.fromEntries(
  Object.values(translationFiles)
    .filter((t) => t.bankVersion === bankVersion)
    .map((t) => [t.language, t]),
)

/** The current translation of one item, if the patient's language has one. */
function local(linkId: string, lang: string = i18n.language): ItemWording | undefined {
  return translations[lang]?.items[linkId]
}

/** Patient wording, or the bank's own companion wording when a companion is answering, in the UI language. */
export function text(linkId: string, role: Role, lang?: string): string {
  const i = item(linkId)
  const t = local(linkId, lang)
  const companion = ext<string>(i, 'companion-text')
  if (role === 'companion' && companion) return t?.companion ?? companion
  return t?.text ?? i.text ?? linkId
}

export interface Option {
  code: string
  text: string
}
export function options(linkId: string, lang?: string): Option[] {
  const t = local(linkId, lang)
  return (item(linkId).answerOption ?? []).map((o) => ({
    code: o.valueCoding.code,
    text: t?.options?.[o.valueCoding.code] ?? o.valueCoding.display ?? o.valueCoding.code,
  }))
}

/**
 * A follow-up from PatientHome in the UI language. The server sends it in the
 * visit's language; the bank re-words it so the language switch applies at once.
 * An item the bank does not know keeps the server's wording.
 */
export function itemWording(q: QuestionItem, role: Role): { text: string; options: Option[] } {
  if (!bankItems.has(q.key)) return { text: q.text, options: q.options ?? [] }
  const labels = new Map(options(q.key).map((o) => [o.code, o.text]))
  return { text: text(q.key, role), options: (q.options ?? []).map((o) => ({ code: o.code, text: labels.get(o.code) ?? o.text })) }
}

/** An option's English label, for staff screens. Staff always read answers in English. */
export function optionLabel(linkId: string, code: string): string {
  return options(linkId, 'en').find((o) => o.code === code)?.text ?? code
}

/** Whether the question shows a "Not sure" button. Defaults to true, as the backend does. */
export const allowUnsure = (linkId: string): boolean => ext<boolean>(item(linkId), 'allow-unsure') ?? true

/** The label for the "none of these" choice on a tick-all question. */
export function noneOption(linkId: string, lang?: string): string | undefined {
  const english = ext<string>(item(linkId), 'none-option')
  return english && (local(linkId, lang)?.none ?? english)
}

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
