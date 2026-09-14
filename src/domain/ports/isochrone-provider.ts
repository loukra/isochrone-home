import type { TravelMode } from '../models/analysis.js';
import type { AreaFeature, Coordinate } from '../models/geo.js';

/**
 * Fahrtrichtung einer einzelnen Isochrone.
 *
 * Die beiden ergeben nicht dieselbe Flaeche: Einbahnstrassen, Abbiegeverbote
 * und Autobahnauffahrten machen den Hinweg zu einem anderen Weg als den
 * Rueckweg. Gemessen an einem Ziel (Oldenburg, 25 Min., Auto) sind sie fast
 * gleich gross -- 986 gegen 964 km² -- decken sich aber nur zu 85 %: 163 km²
 * liegen in genau einer von beiden, als schmaler Saum am Rand.
 *
 * Das Feld ist Pflicht und hat bewusst keinen Vorgabewert. Eine Aufrufstelle,
 * die die Richtung vergisst, bekaeme sonst stillschweigend die des Providers
 * (ORS: `start`, also den Rueckweg) -- und niemand saehe es der Flaeche an.
 */
export const ISOCHRONE_DIRECTIONS = ['toTarget', 'fromTarget'] as const;

export type IsochroneDirection = (typeof ISOCHRONE_DIRECTIONS)[number];

export type IsochroneOptions = {
  travelMode: TravelMode;
  maxTravelTimeMinutes: number;
  /**
   * `toTarget`: Flaeche, **von der aus** der Punkt in der Zeit erreichbar ist
   * -- der Hinweg, also die Frage, die im Formular steht.
   * `fromTarget`: Flaeche, die **vom Punkt aus** erreichbar ist -- der Rueckweg.
   */
  direction: IsochroneDirection;
};

export interface IsochroneProvider {
  /**
   * Groesste Fahrzeit, die dieser Provider unterstuetzt. Provider haben hier
   * harte, unterschiedliche Grenzen (OpenRouteService z. B. 60 Minuten), die
   * bis in die UI sichtbar sein muessen -- sonst laeuft der Nutzer in eine
   * nichtssagende Fehlermeldung.
   */
  readonly maxTravelTimeMinutes: number;

  calculate(origin: Coordinate, options: IsochroneOptions): Promise<AreaFeature>;
}
