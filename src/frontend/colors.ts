/**
 * Stabile Farbzuordnung: an die Position beim Anlegen gebunden, damit sich
 * Farben beim Entfernen anderer Ziele nicht verschieben (Spec 10).
 */
const PALETTE = [
  '#2563eb',
  '#eab308',
  '#dc2626',
  '#9333ea',
  '#0891b2',
  '#ea580c',
  '#4d7c0f',
  '#db2777',
];

export const INTERSECTION_COLOR = '#16a34a';

export const colorAt = (index: number): string =>
  PALETTE[index % PALETTE.length] as string;
