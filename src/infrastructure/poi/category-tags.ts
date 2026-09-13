import type { PoiCategory } from '../../domain/models/poi.js';

/**
 * Kategorie -> OSM-Tags. Provider-Wissen, bleibt in der Infrastruktur.
 * Mehrere Ausdrücke pro Kategorie werden verodert.
 */
export const OSM_FILTERS: Record<PoiCategory, string[]> = {
  gym: ['[leisure=fitness_centre]'],
  supermarket: ['[shop=supermarket]'],
  station: ['[railway=station]', '[public_transport=station][train=yes]'],
};
