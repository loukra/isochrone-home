import { Select, type SelectOption } from '../components/Select.js';
import { LANGUAGE_ICONS } from '../components/flags.js';
import { LANGUAGES, LANGUAGE_NAMES, useLanguage, useTexts, type Language } from './index.js';

/**
 * Der Sprachumschalter, oben rechts in der Kopfzeile.
 *
 * Sichtbar ist nur die Flagge. Der Name der Sprache verschwindet damit aus dem
 * Bild, aber **nicht** aus der Bedienung: Er bleibt als zugänglicher Name an
 * jeder Auswahl und im Tooltip, und der Knopf selbst nennt neben "Sprache"
 * auch die gerade eingestellte. Ohne das sagte ein Vorleseprogramm
 * "Flagge Deutschland" -- ein Land, keine Sprache.
 *
 * Die Flagge ist seit dem Kartenwerk-Umbau gezeichnet, kein Emoji mehr. Damit
 * entfällt der Rückfall, den Windows bisher zeigte -- dort stand statt der
 * Flagge "DE" bzw. "GB", weil das System für Flaggen-Emoji bewusst keine
 * Glyphen mitliefert.
 */
export const LanguageSwitch = () => {
  const texts = useTexts();
  const { language, setLanguage } = useLanguage();

  const options: readonly SelectOption<Language>[] = LANGUAGES.map((code) => ({
    value: code,
    label: LANGUAGE_NAMES[code],
    icon: LANGUAGE_ICONS[code],
  }));

  return (
    <Select
      className="select--quiet"
      trigger="icon"
      value={language}
      options={options}
      onChange={setLanguage}
      label={texts.app.languageLabel}
      title={LANGUAGE_NAMES[language]}
    />
  );
};
