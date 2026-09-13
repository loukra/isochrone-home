import type { TravelMode } from '../models/analysis.js';
import type { Coordinate } from '../models/geo.js';

export type TravelLeg = {
  /** Reine Fahrzeit auf der schnellsten Route, ohne Parken und Umsteigen. */
  durationMinutes: number;
  /** Länge dieser Route -- nicht die Luftlinie. */
  distanceKm: number;
};

/**
 * Fahrzeit und Strecke zwischen konkreten Punkten.
 *
 * Bewusst getrennt vom `IsochroneProvider`: Eine Isochrone beantwortet "wo
 * komme ich hin", diese Frage lautet "wie lange dauert genau diese Strecke".
 * Beide stammen zwar heute vom selben Anbieter, sind aber unterschiedliche
 * Dienste mit eigenem Kontingent -- und ein Ausfall des einen darf den anderen
 * nicht mitreissen.
 */
export interface TravelTimeProvider {
  /**
   * Misst von einem Startpunkt zu mehreren Zielen, Ergebnis in der Reihenfolge
   * der Ziele. `null` heisst: dorthin kennt der Provider keine Route (Insel,
   * Fähre, gesperrt) -- ein gültiges Ergebnis, kein Fehler.
   */
  measure(
    origin: Coordinate,
    destinations: Coordinate[],
    travelMode: TravelMode,
  ): Promise<(TravelLeg | null)[]>;
}
