import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { de, type Texts } from './de.js';
import { en } from './en.js';

export type Language = 'de' | 'en';

export const LANGUAGES: readonly Language[] = ['de', 'en'];

const CATALOGUES: Record<Language, Texts> = { de, en };

/** Wie die Sprache im Umschalter heißt -- immer in der Sprache selbst. */
export const LANGUAGE_NAMES: Record<Language, string> = {
  de: 'Deutsch',
  en: 'English',
};

/**
 * Eigener Schlüssel, und bewusst weiter mit dem alten Präfix: Ein Schlüssel ist
 * die Adresse, unter der etwas liegt, kein Name. Ihn mit der Umbenennung der App
 * zu ändern hieße, die gespeicherten Stände aller Nutzer stillzulegen.
 */
const LANGUAGE_KEY = 'location-optimizer:language:v1';

const isLanguage = (value: unknown): value is Language =>
  typeof value === 'string' && (LANGUAGES as readonly string[]).includes(value);

/**
 * Reihenfolge: gespeicherte Wahl, dann Browsersprache, dann Deutsch. Die
 * gespeicherte Wahl gewinnt, weil sie eine Entscheidung ist -- dieselbe Regel
 * wie beim Kartenausschnitt.
 */
export const detectLanguage = (): Language => {
  try {
    const stored = localStorage.getItem(LANGUAGE_KEY);
    if (isLanguage(stored)) return stored;
  } catch {
    // Blockierter Speicher ist kein Fehler, nur keine Erinnerung.
  }

  const preferred = typeof navigator === 'undefined' ? [] : navigator.languages ?? [];

  for (const tag of preferred) {
    const base = tag.split('-')[0];
    if (isLanguage(base)) return base;
  }

  return 'de';
};

type LanguageContextValue = {
  language: Language;
  texts: Texts;
  setLanguage: (language: Language) => void;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

export const LanguageProvider = ({ children }: { children: ReactNode }) => {
  const [language, setLanguageState] = useState<Language>(detectLanguage);

  const setLanguage = useCallback((next: Language) => {
    setLanguageState(next);
    try {
      localStorage.setItem(LANGUAGE_KEY, next);
    } catch {
      // siehe oben
    }
  }, []);

  /**
   * Titel und `lang` gehören zum Dokument, nicht zu einer Komponente. `lang`
   * ist kein Beiwerk: Vorleseprogramme wählen danach die Aussprache, und ein
   * englischer Satz in deutscher Aussprache ist schwer verständlich.
   */
  useEffect(() => {
    document.documentElement.lang = language;
    document.title = CATALOGUES[language].app.title;
  }, [language]);

  const value = useMemo<LanguageContextValue>(
    () => ({ language, texts: CATALOGUES[language], setLanguage }),
    [language, setLanguage],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
};

const useLanguageContext = (): LanguageContextValue => {
  const value = useContext(LanguageContext);

  if (value === null) {
    throw new Error('useTexts muss innerhalb von <LanguageProvider> aufgerufen werden.');
  }

  return value;
};

/**
 * Die Texte der aktuellen Sprache als Objektbaum: `texts.tabs.addresses` statt
 * `t('tabs.addresses')`. Ein Tippfehler ist damit ein Typfehler, und beim Lesen
 * einer Komponente sieht man am Pfad, worum es geht.
 */
export const useTexts = (): Texts => useLanguageContext().texts;

export const useLanguage = (): Omit<LanguageContextValue, 'texts'> => {
  const { language, setLanguage } = useLanguageContext();
  return { language, setLanguage };
};

export type { Texts };
