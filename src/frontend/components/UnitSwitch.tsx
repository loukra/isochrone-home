import { useTexts } from '../i18n/index.js';
import { UNIT_CHOICES, useUnitChoice, type UnitChoice } from '../units.js';
import { Select, type SelectOption } from './Select.js';

/**
 * Kilometer oder Meilen -- oben in der Kopfzeile, neben Erscheinungsbild und
 * Sprache.
 *
 * **Der Knopf zeigt die Einheit, nicht die Wahl.** Auf "Wie die Region" steht
 * dort also "km" oder "mi", dasselbe wie bei der ausdruecklichen Wahl. Das ist
 * Absicht: Die Frage, die jemand im Vorbeigehen an den Knopf hat, lautet
 * "welche Einheit sehe ich gerade", nicht "wie kam sie zustande". Woher sie
 * stammt, sagt der Name des Knopfes, und im aufgeklappten Menue steht der
 * Haken an der Stellung.
 *
 * Damit weicht er vom Erscheinungsbild-Schalter ab, der fuer "Wie das System"
 * ein eigenes Zeichen hat. Dort geht das, weil Sonne und Mond ohnehin Bilder
 * sind; hier waere ein drittes Zeichen fuer "automatisch" eine Erfindung neben
 * zwei Woertern, die sich selbst erklaeren.
 */
export const UnitSwitch = () => {
  const texts = useTexts();
  const { choice, units, setChoice } = useUnitChoice();

  const shortLabels: Record<UnitChoice, string> = {
    region: units === 'imperial' ? 'mi' : 'km',
    metric: 'km',
    imperial: 'mi',
  };

  const options: readonly SelectOption<UnitChoice>[] = UNIT_CHOICES.map((value) => ({
    value,
    label: texts.units[value],
    shortLabel: shortLabels[value],
  }));

  return (
    <Select
      className="select--quiet"
      value={choice}
      options={options}
      onChange={setChoice}
      label={texts.units.label}
      title={texts.units[choice]}
    />
  );
};
