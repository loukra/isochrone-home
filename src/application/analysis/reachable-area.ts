import type { TravelMode } from '../../domain/models/analysis.js';
import type { AreaFeature, Coordinate } from '../../domain/models/geo.js';
import type { IsochroneProvider } from '../../domain/ports/isochrone-provider.js';
import { intersectAreas } from '../../domain/services/geometry.js';

export type ReachabilityOptions = {
  travelMode: TravelMode;
  maxTravelTimeMinutes: number;
};

/**
 * Die Flaeche, die eine Zeitvorgabe **in beide Richtungen** einhaelt.
 *
 * "25 Minuten zur Arbeit" heisst hoechstens 25 Minuten, egal in welche
 * Richtung: Wer hin 25 und zurueck 30 braucht, liegt bei der Einstellung 25
 * draussen und erst ab 30 drin. Eine einzelne Isochrone kann das nicht sagen,
 * sie kennt nur eine Richtung -- und die beiden sind nicht dieselbe Flaeche
 * (986 gegen 964 km² an einem Ziel in Oldenburg, 25 Min. Auto, aber 163 km²
 * liegen in genau einer von beiden).
 *
 * Geschnitten, nicht vereinigt: Die Vereinigung waere die schwaechere Aussage
 * "in *irgendeiner* Richtung im Limit", und die will niemand -- man faehrt hin
 * *und* zurueck.
 *
 * Kosten: zwei Providercalls je Punkt statt einem. Beide Richtungen liegen
 * getrennt im Cache (die Richtung steht im Schluessel), eine Wiederholung
 * kostet also weiterhin nichts. Deshalb nur fuer die Ziele -- die sind zu
 * fuenft. Die Orte aus Schritt 3 duerfen bis zu 25 sein und bleiben einseitig.
 */
export const reachableArea = async (
  isochrones: IsochroneProvider,
  origin: Coordinate,
  options: ReachabilityOptions,
): Promise<AreaFeature> => {
  const [toTarget, fromTarget] = await Promise.all([
    isochrones.calculate(origin, { ...options, direction: 'toTarget' }),
    isochrones.calculate(origin, { ...options, direction: 'fromTarget' }),
  ]);

  // Beide Flaechen enthalten den Punkt selbst, koennen sich also nicht
  // verfehlen. Liefert der Provider trotzdem einmal etwas Entartetes, ist der
  // Hinweg die Frage, die im Formular steht -- besser als gar keine Flaeche.
  return intersectAreas([toTarget, fromTarget]) ?? toTarget;
};
