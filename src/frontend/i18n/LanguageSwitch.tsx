import {
  LANGUAGES,
  LANGUAGE_FLAGS,
  LANGUAGE_NAMES,
  useLanguage,
  useTexts,
  type Language,
} from './index.js';

/**
 * Der Sprachumschalter, oben rechts in der Kopfzeile.
 *
 * Sichtbar ist nur die Flagge. Der Name der Sprache verschwindet damit aus dem
 * Bild, aber **nicht** aus der Bedienung: Er bleibt als zugänglicher Name an
 * jeder Auswahl und im Tooltip, und der Knopf selbst nennt neben "Sprache"
 * auch die gerade eingestellte. Ohne das sagte ein Vorleseprogramm
 * "Flagge Deutschland" -- ein Land, keine Sprache.
 */
export const LanguageSwitch = () => {
  const texts = useTexts();
  const { language, setLanguage } = useLanguage();

  return (
    <select
      className="language-switch"
      value={language}
      onChange={(event) => setLanguage(event.target.value as Language)}
      aria-label={`${texts.app.languageLabel}: ${LANGUAGE_NAMES[language]}`}
      title={LANGUAGE_NAMES[language]}
    >
      {LANGUAGES.map((code) => (
        <option key={code} value={code} aria-label={LANGUAGE_NAMES[code]}>
          {LANGUAGE_FLAGS[code]}
        </option>
      ))}
    </select>
  );
};
