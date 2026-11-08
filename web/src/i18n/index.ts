import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './en.json'
import pa from './pa.json'
import tl from './tl.json'

// Languages match the contract's `Language` codes. Punjabi and Tagalog strings
// must be supplied; until then missing keys fall back to English.
export const LANGUAGES = ['en', 'pa', 'tl'] as const

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, pa: { translation: pa }, tl: { translation: tl } },
  lng: 'en',
  fallbackLng: 'en',
  supportedLngs: [...LANGUAGES],
  interpolation: { escapeValue: false },
})

export default i18n
