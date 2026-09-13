import type { TravelMode } from '../models/analysis.js';
import type { AreaFeature, Coordinate } from '../models/geo.js';

export type IsochroneOptions = {
  travelMode: TravelMode;
  maxTravelTimeMinutes: number;
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
