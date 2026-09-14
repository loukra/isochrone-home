import type { TravelMode } from './analysis.js';
import type { Coordinate } from './geo.js';

/**
 * Vom MVP unterstützte POI-Kategorien. Diese Liste ist die eine Quelle: Die
 * zod-Schemas der API leiten sich daraus ab, damit eine neue Kategorie nicht
 * an der Validierung scheitert.
 */
export const POI_CATEGORIES = [
  'gym',
  'supermarket',
  'station',
  'kindergarten',
  'school',
  'pool',
  'doctor',
] as const;

export type PoiCategory = (typeof POI_CATEGORIES)[number];

export type Poi = {
  /** Stabile Kennung über Suchläufe hinweg: "<osm-typ>/<osm-id>". */
  id: string;
  category: PoiCategory;
  /**
   * `null`, wenn OSM kein name-Tag führt. Bewusst kein Platzhaltertext: Die
   * Beschriftung ist Sache der Oberfläche und hat eine Sprache -- ein hier
   * erfundenes Wort stünde auch in einer englischen Oberfläche.
   */
  name: string | null;
  coordinate: Coordinate;
  /** Kette bzw. Betreiber, sofern getaggt. Trägt die Auswahl über Regionen hinweg. */
  brand: string | null;
  website: string | null;
  /** OSM-`sport`-Tag, hilft beim Einschätzen (z. B. "yoga"). */
  sport: string | null;
  /** Grundfläche in m², nur bei als Fläche erfassten Objekten. */
  areaSquareMeters: number | null;
};

/**
 * Bedingung "irgendein POI dieser Kategorie in höchstens X Minuten".
 * Anders als ein LocationConstraint bezieht sie sich nicht auf einen festen
 * Ort, sondern auf eine Menge austauschbarer Orte.
 */
export type PoiConstraint = {
  category: PoiCategory;
  /**
   * Verkehrsmittel dieser Bedingung. Hängt an der Bedingung, nicht an der App:
   * Zum Bäcker geht man, ins Schwimmbad fährt man.
   */
  travelMode: TravelMode;
  maxTravelTimeMinutes: number;
  /** Die vom Nutzer angehakten POIs. Leer = Bedingung inaktiv. */
  selectedPoiIds: string[];
};
