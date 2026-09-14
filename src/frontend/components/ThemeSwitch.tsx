import type { ReactNode } from 'react';
import { useTheme, THEME_CHOICES, type ThemeChoice } from '../theme.js';
import { useTexts } from '../i18n/index.js';
import { Select, type SelectOption } from './Select.js';
import { MoonIcon, SunIcon, SystemIcon } from './icons.js';

const ICONS: Record<ThemeChoice, ReactNode> = {
  system: <SystemIcon />,
  light: <SunIcon />,
  dark: <MoonIcon />,
};

/**
 * Hell, dunkel oder wie das System -- oben in der Kopfzeile, gleich neben dem
 * Sprachschalter.
 *
 * Dieselbe Bauart wie dort: Sichtbar ist nur das Zeichen, benannt wird die
 * Einstellung trotzdem. Ein Vorleseprogramm sagt sonst "Mond" und benennt
 * damit kein Erscheinungsbild.
 */
export const ThemeSwitch = () => {
  const texts = useTexts();
  const { choice, setChoice } = useTheme();

  const options: readonly SelectOption<ThemeChoice>[] = THEME_CHOICES.map((value) => ({
    value,
    label: texts.appearance[value],
    icon: ICONS[value],
  }));

  return (
    <Select
      className="select--quiet"
      trigger="icon"
      value={choice}
      options={options}
      onChange={setChoice}
      label={texts.appearance.label}
      title={texts.appearance[choice]}
    />
  );
};
