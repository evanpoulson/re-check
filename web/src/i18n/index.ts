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
// fail if the contract gains or drops a language. Only English is written so far;
// missing keys fall back to English until professional translations are supplied.
const RESOURCES: Record<Language, object> = { en, tl, pa, fr, es, de, yue, zh, ar, ur, vi, ko, hi, ru, pl }

/** Contract order: the most common mother tongues in Alberta, English first. */
export const LANGUAGES = Object.keys(RESOURCES) as Language[]

void i18n.use(initReactI18next).init({
  resources: Object.fromEntries(LANGUAGES.map((l) => [l, { translation: RESOURCES[l] }])),
  lng: 'en',
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
