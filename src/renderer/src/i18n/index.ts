import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import ru from './ru.json'
import en from './en.json'
import zh from './zh.json'

export const supportedLngs = ['ru', 'en', 'zh'] as const
export type SupportedLng = (typeof supportedLngs)[number]

i18n.use(initReactI18next).init({
  resources: {
    ru: { translation: ru },
    en: { translation: en },
    zh: { translation: zh }
  },
  lng: 'ru',
  fallbackLng: 'en',
  interpolation: { escapeValue: false }
})

export default i18n
