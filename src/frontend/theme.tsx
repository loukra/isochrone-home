import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

/**
 * Drei Stellungen, nicht zwei. "Wie das System" ist etwas anderes als "hell":
 * Es ist die Ansage, keine Wahl treffen zu wollen, und folgt dem Rechner, wenn
 * der abends umschaltet. Wer dagegen "dunkel" wählt, will dunkel -- auch
 * mittags.
 */
export type ThemeChoice = 'system' | 'light' | 'dark';

/** Was am Ende wirklich auf dem Schirm steht. */
export type Appearance = 'light' | 'dark';

export const THEME_CHOICES: readonly ThemeChoice[] = ['system', 'light', 'dark'];

/**
 * Eigener Schlüssel mit dem alten Präfix -- aus demselben Grund wie bei
 * Sprache und Kartenausschnitt: Ein Schlüssel ist eine Adresse, kein Name.
 *
 * Gespeichert wird die **Wahl**, nicht das Ergebnis: "system" muss "system"
 * bleiben, sonst fröre der erste Besuch die gerade geltende Einstellung des
 * Rechners für immer ein.
 */
const THEME_KEY = 'location-optimizer:theme:v1';

const DARK_QUERY = '(prefers-color-scheme: dark)';

const isChoice = (value: unknown): value is ThemeChoice =>
  typeof value === 'string' && (THEME_CHOICES as readonly string[]).includes(value);

const readChoice = (): ThemeChoice => {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    if (isChoice(stored)) return stored;
  } catch {
    // Blockierter Speicher ist kein Fehler, nur keine Erinnerung.
  }

  return 'system';
};

const systemAppearance = (): Appearance =>
  typeof window !== 'undefined' && window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light';

type ThemeContextValue = {
  choice: ThemeChoice;
  appearance: Appearance;
  setChoice: (choice: ThemeChoice) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const [choice, setChoiceState] = useState<ThemeChoice>(readChoice);
  const [system, setSystem] = useState<Appearance>(systemAppearance);

  const setChoice = useCallback((next: ThemeChoice) => {
    setChoiceState(next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      // siehe oben
    }
  }, []);

  /** Dem Rechner zuhören -- er schaltet abends um, ohne die Seite neu zu laden. */
  useEffect(() => {
    const media = window.matchMedia(DARK_QUERY);
    const update = () => setSystem(media.matches ? 'dark' : 'light');
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  const appearance = choice === 'system' ? system : choice;

  /*
   * Bei "system" wird das Attribut *entfernt*, nicht auf den gerade geltenden
   * Wert gesetzt: Ohne Attribut entscheidet die `prefers-color-scheme`-Regel
   * im Stylesheet, und genau das ist gemeint.
   */
  useEffect(() => {
    const root = document.documentElement;
    if (choice === 'system') root.removeAttribute('data-theme');
    else root.dataset.theme = choice;
  }, [choice]);

  const value = useMemo<ThemeContextValue>(
    () => ({ choice, appearance, setChoice }),
    [choice, appearance, setChoice],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = (): ThemeContextValue => {
  const value = useContext(ThemeContext);

  if (value === null) {
    throw new Error('useTheme muss innerhalb von <ThemeProvider> aufgerufen werden.');
  }

  return value;
};
