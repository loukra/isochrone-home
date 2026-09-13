import type { PoiCategory, Poi } from '../models/poi.js';
import type { BoundingBox } from '../models/geo.js';

export interface PoiProvider {
  /**
   * Sucht POIs einer Kategorie im angegebenen Bereich.
   *
   * Der Bereich muss über die Zielregion hinausreichen: Ein POI kann außerhalb
   * der Region liegen und sie trotzdem bedienen. In der Testregion liegen mehr
   * relevante Studios außerhalb als innerhalb.
   */
  search(category: PoiCategory, area: BoundingBox): Promise<Poi[]>;
}
