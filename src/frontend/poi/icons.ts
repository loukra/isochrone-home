import type { PoiCategory } from '../types.js';

/**
 * Eigene Farbfamilie für die Kategorien -- bewusst abseits der Zielfarben und
 * des Gruens der Schnittmenge, damit ein Punkt nie wie eine Isochrone wirkt.
 */
export const CATEGORY_COLORS: Record<PoiCategory, string> = {
  gym: '#7c3aed',
  supermarket: '#ea580c',
  station: '#0e7490',
  kindergarten: '#c026d3',
  school: '#b45309',
  pool: '#0284c7',
  doctor: '#be123c',
};

/**
 * Glyphen auf 24x24-Raster, weiss auf farbigem Kreis. Bewusst eigene Pfade
 * statt einer Icon-Bibliothek: eine Handvoll Symbole rechtfertigt keine
 * Abhaengigkeit, und MapLibre braucht ohnehin ein fertiges Bild.
 *
 * Jedes Zeichen muss bei 22 Pixeln noch als Umriss lesbar sein -- deshalb
 * grobe, geschlossene Formen statt feiner Strichzeichnungen.
 */
const GLYPHS: Record<PoiCategory, string> = {
  // Hantel: dicke Innengewichte, schmale Aussenscheiben, kraeftige Stange.
  // Feinere Proportionen zerfallen bei 22 Pixeln zu einem Strichmuster.
  gym: '<path d="M3.4 9.6h2.2v4.8H3.4zm3 -2.6h2.8v10H6.4zm2.8 3.6h5.6v2.8H9.2zm5.6-3.6h2.8v10h-2.8zm3.6 2.6h2.2v4.8h-2.2z"/>',
  // Einkaufswagen: Korb, Griff, zwei Raeder.
  supermarket:
    '<path d="M3 5h2.4l.7 2.4H20l-2 6.6H8.2L7 10.4 6 6.8H3zm5.6 11.2a1.5 1.5 0 110 3 1.5 1.5 0 010-3zm8.4 0a1.5 1.5 0 110 3 1.5 1.5 0 010-3z"/>',
  // Zug: Waggon mit Fenster und zwei Raedern.
  station:
    '<path d="M7 3h10a2 2 0 012 2v9a3 3 0 01-3 3H8a3 3 0 01-3-3V5a2 2 0 012-2zm.6 3.2v3.6h8.8V6.2zM8.4 12a1.4 1.4 0 110 2.8 1.4 1.4 0 010-2.8zm7.2 0a1.4 1.4 0 110 2.8 1.4 1.4 0 010-2.8zM6.6 18.2h2.2L7.4 21H5.2zm8.6 0h2.2L18.8 21h-2.2z"/>',
  // Bauklötze: drei Wuerfel. Ein Teddy oder ein Kinderwagen zerfaellt bei
  // dieser Groesse zu einem Fleck, die Kanten hier bleiben erkennbar.
  kindergarten: '<path d="M3.5 13h7.6v7.6H3.5zm9.4 0h7.6v7.6h-7.6zM8.2 3.6h7.6v7.6H8.2z"/>',
  // Doktorhut: Brett und Kopfteil -- das Schulgebaeude waere vom Bahnhofs-
  // Waggon kaum zu unterscheiden.
  school:
    '<path d="M12 3 1.5 8.2 12 13.4l10.5-5.2zM5.5 12.6v4c0 1.9 2.9 3.4 6.5 3.4s6.5-1.5 6.5-3.4v-4L12 15.7z"/>',
  // Drei Wellen. Als Strich gezeichnet, weil eine ausgefuellte Welle bei
  // dieser Groesse zu einem Balken zulaeuft.
  pool:
    '<path d="M2 7c2.5 0 2.5 2.6 5 2.6S9.5 7 12 7s2.5 2.6 5 2.6S19.5 7 22 7M2 13c2.5 0 2.5 2.6 5 2.6s2.5-2.6 5-2.6 2.5 2.6 5 2.6 2.5-2.6 5-2.6M2 19c2.5 0 2.5 2.6 5 2.6s2.5-2.6 5-2.6 2.5 2.6 5 2.6 2.5-2.6 5-2.6" fill="none" stroke="#ffffff" stroke-width="2.6" stroke-linecap="round"/>',
  // Kreuz. Die Schlange des Aeskulapstabs ist bei 22 Pixeln ein Kringel.
  doctor: '<path d="M9.6 3h4.8v6.6H21v4.8h-6.6V21H9.6v-6.6H3V9.6h6.6z"/>',
};

export const poiIconId = (category: PoiCategory): string => `poi-icon-${category}`;

/** Farbiger Kreis mit weissem Glyph, als SVG-Datenquelle fuer map.addImage. */
export const poiIconSvg = (category: PoiCategory, size = 44): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 32 32">` +
  `<circle cx="16" cy="16" r="14" fill="${CATEGORY_COLORS[category]}" stroke="#ffffff" stroke-width="2.5"/>` +
  `<g transform="translate(4 4)" fill="#ffffff">${GLYPHS[category]}</g>` +
  `</svg>`;
