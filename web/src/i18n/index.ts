import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import type { Language } from '@/api/types'
import ar from './ar.json'
import de from './de.json'
import en from './en.json'
import es from './es.json'
import fr from './fr.json'
import hi from './hi.json'
import ko from './ko.json'
import pa from './pa.json'
import pl from './pl.json'
import ru from './ru.json'
import tl from './tl.json'
import ur from './ur.json'
import vi from './vi.json'
import yue from './yue.json'
import zh from './zh.json'

// One file per contract `Language` code. Typing this as a Record makes the build
// fail if the contract gains or drops a language. Every patient-facing key has a
// draft translation (keys.test.ts checks this); staff screens are English only and
// fall back to en.json.
const RESOURCES: Record<Language, object> = { en, tl, pa, fr, es, de, yue, zh, ar, ur, vi, ko, hi, ru, pl }

/** Contract order: the most common mother tongues in Alberta, English first. */
export const LANGUAGES = Object.keys(RESOURCES) as Language[]

// A language picked by hand on this device (the header select) wins over the
// visit's enrolled language, so signing in or reloading doesn't undo it.
// Per tab, like the visit session; any storage error just means no saved choice.
const CHOSEN_KEY = 'recheck.language'

export function chosenLanguage(): Language | undefined {
  try {
    const l = sessionStorage.getItem(CHOSEN_KEY)
    return LANGUAGES.includes(l as Language) ? (l as Language) : undefined
  } catch {
    return undefined
  }
}

export function chooseLanguage(lng: string) {
  try {
    sessionStorage.setItem(CHOSEN_KEY, lng)
  } catch {
    // Still switch for this page.
  }
  return i18n.changeLanguage(lng)
}

void i18n.use(initReactI18next).init({
  resources: Object.fromEntries(LANGUAGES.map((l) => [l, { translation: RESOURCES[l] }])),
  lng: chosenLanguage() ?? 'en',
  fallbackLng: 'en',
  supportedLngs: [...LANGUAGES],
  interpolation: { escapeValue: false },
})

// Arabic and Urdu read right to left. Set the page's language and
// direction so screen readers pronounce text correctly and layout mirrors.
function applyDocumentLanguage(lng: string) {
  if (typeof document === 'undefined') return
  document.documentElement.lang = lng
  document.documentElement.dir = i18n.dir(lng)
}
applyDocumentLanguage(i18n.language)
i18n.on('languageChanged', applyDocumentLanguage)

export default i18n
