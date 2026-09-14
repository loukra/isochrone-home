import { LANGUAGES, LANGUAGE_NAMES, useLanguage, useTexts, type Language } from './index.js';

/**
 * Der Sprachumschalter, oben rechts in der Kopfzeile.
 *
 * Bewusst ein Auswahlfeld und keine Flaggen: Eine Flagge steht für ein Land,
 * nicht für eine Sprache -- Deutsch wird in vier Ländern gesprochen, und
 * Englisch in weit mehr. Jede Sprache nennt sich in ihrem eigenen Wort, damit
 * sie findet, wer die aktuelle Sprache gerade *nicht* versteht.
 */
export const LanguageSwitch = () => {
  const texts = useTexts();
  const { language, setLanguage } = useLanguage();

  return (
    <select
      className="language-switch"
      value={language}
      onChange={(event) => setLanguage(event.target.value as Language)}
      aria-label={texts.app.languageLabel}
    >
      {LANGUAGES.map((code) => (
        <option key={code} value={code}>
          {LANGUAGE_NAMES[code]}
        </option>
      ))}
    </select>
  );
};
