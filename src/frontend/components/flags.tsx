import type { ReactNode } from 'react';
import type { Language } from '../i18n/index.js';
import { FlagDe, FlagGb } from './icons.js';

/**
 * Die Flagge je Sprache. Sie ist eine **Abkürzung, keine Aussage**: Deutsch
 * wird in vier Ländern gesprochen, Englisch in weit mehr, und keine Flagge
 * deckt das ab. Gewählt ist jeweils das Land, aus dem die Schreibweise des
 * Katalogs stammt -- `en` ist auf `en-GB` eingestellt, deshalb der Union Jack.
 *
 * Eigene Zeichnung statt Emoji: Windows liefert für Flaggen-Emoji bewusst
 * keine Glyphen und zeigte dort bisher die zwei Regionalbuchstaben "DE" bzw.
 * "GB". Damit sah der Schalter auf jedem zweiten System anders aus als hier.
 *
 * Sie liegen getrennt von `icons.tsx`, weil nur diese Zuordnung die Sprachen
 * der App kennen muss -- die Zeichnungen selbst wissen nichts davon.
 */
export const LANGUAGE_ICONS: Record<Language, ReactNode> = {
  de: <FlagDe />,
  en: <FlagGb />,
};
