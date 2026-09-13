import type { TravelMode } from '../../domain/models/analysis.js';
import type { Coordinate } from '../../domain/models/geo.js';
import type { TravelTimeProvider } from '../../domain/ports/travel-time-provider.js';

export type TravelTimeTarget = {
  /** Die Constraint-ID des Ziels; nur zum Zuordnen der Antwort. */
  id: string;
  coordinate: Coordinate;
  travelMode: TravelMode;
};

export type TravelTimeRequest = {
  /** Der geprüfte Ort -- von hier aus wird gemessen. */
  origin: Coordinate;
  targets: TravelTimeTarget[];
};

export type TravelTimeLegResult = {
  constraintId: string;
  /** null = keine Route dorthin. Gültiges Ergebnis, kein Fehler. */
  durationMinutes: number | null;
  distanceKm: number | null;
};

export type TravelTimeResult = { legs: TravelTimeLegResult[] };

/**
 * Fahrzeit und Strecke vom geprüften Ort zu jedem Ziel.
 *
 * Beantwortet eine andere Frage als die Punkt-in-Fläche-Prüfung: Die sagt nur
 * "drin oder draussen", diese sagt *wie knapp* -- und bei einem Ort ausserhalb,
 * welches Ziel daran schuld ist.
 *
 * Gebündelt wird je Verkehrsmittel, nicht je Ziel: Die Matrix-API misst in
 * einem Aufruf zu beliebig vielen Punkten desselben Profils. Fünf Ziele mit dem
 * Auto kosten damit einen Aufruf, nicht fünf.
 */
export class TravelTimeQuery {
  constructor(private readonly travelTimes: TravelTimeProvider) {}

  async execute(request: TravelTimeRequest): Promise<TravelTimeResult> {
    if (request.targets.length === 0) return { legs: [] };

    const byMode = new Map<TravelMode, TravelTimeTarget[]>();

    for (const target of request.targets) {
      const group = byMode.get(target.travelMode) ?? [];
      group.push(target);
      byMode.set(target.travelMode, group);
    }

    // Höchstens vier Gruppen -- so viele Verkehrsmittel gibt es. Parallel ist
    // hier also kein Risiko für ein Rate-Limit.
    const measured = await Promise.all(
      [...byMode].map(async ([travelMode, group]) => {
        const legs = await this.travelTimes.measure(
          request.origin,
          group.map((target) => target.coordinate),
          travelMode,
        );

        return group.map((target, index) => {
          const leg = legs[index] ?? null;

          return {
            constraintId: target.id,
            durationMinutes: leg?.durationMinutes ?? null,
            distanceKm: leg?.distanceKm ?? null,
          };
        });
      }),
    );

    // Wieder in die Reihenfolge der Anfrage bringen: Die UI zeigt die Ziele so
    // an, wie sie in der Seitenleiste stehen.
    const byId = new Map(measured.flat().map((leg) => [leg.constraintId, leg]));

    return {
      legs: request.targets.map(
        (target) =>
          byId.get(target.id) ?? {
            constraintId: target.id,
            durationMinutes: null,
            distanceKm: null,
          },
      ),
    };
  }
}
