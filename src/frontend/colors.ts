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

/** Verengte Region: dieselbe Farbfamilie, aber deutlich dunkler als Gruen. */
export const POI_REGION_COLOR = '#0f766e';

/**
 * Deckkraft der drei Flaechenarten. Sie stehen hier beieinander, weil sie sich
 * **uebereinanderlegen** und deshalb nicht einzeln zu beurteilen sind: Was vom
 * Kartenbild uebrig bleibt, ist ihr Produkt.
 *
 * Bei drei Zielen mit Schnittmenge und verengter Region kamen vorher
 * 0,82³ × 0,50 × 0,45 = **12 %** des Untergrunds durch -- Ortsnamen und
 * Strassennummern waren unter der gruenen Flaeche nicht mehr zu lesen, und
 * gerade dort entscheidet man ja, ob die Gegend taugt. Mit den Werten hier sind
 * es 29 %.
 *
 * Traeger der Form ist ohnehin nicht die Fuellung, sondern der 3px-Umriss;
 * die Fuellung sagt nur "hier drin". Deshalb darf sie leise sein.
 */
export const ISOCHRONE_FILL_OPACITY = 0.18;
export const INTERSECTION_FILL_OPACITY = 0.25;

/** Etwas kraeftiger als die Schnittmenge -- sie liegt darueber und ist die schaerfere Aussage. */
export const POI_REGION_FILL_OPACITY = 0.3;

export const colorAt = (index: number): string =>
  PALETTE[index % PALETTE.length] as string;
