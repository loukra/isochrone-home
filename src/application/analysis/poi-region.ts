import type {
  LocationAnalysisRequest,
  TravelMode,
} from '../../domain/models/analysis.js';
import { DomainError } from '../../domain/models/errors.js';
import type { AreaFeature, Coordinate } from '../../domain/models/geo.js';
import type { PoiCategory } from '../../domain/models/poi.js';
import type { LocationAnalysisStrategy } from '../../domain/ports/analysis-strategy.js';
import type { IsochroneProvider } from '../../domain/ports/isochrone-provider.js';
import { intersectAreas, unionAreas } from '../../domain/services/geometry.js';

export type PoiConditionRequest = {
  category: PoiCategory;
  /**
   * Verkehrsmittel dieser Bedingung. Zum Bäcker geht man, ins Schwimmbad
   * fährt man -- und beides kann dieselbe Person nebeneinander fordern.
   */
  travelMode: TravelMode;
  maxTravelTimeMinutes: number;
  /** Die vom Nutzer angehakten Orte dieser Kategorie. */
  origins: Coordinate[];
};

export type PoiRegionRequest = {
  constraints: LocationAnalysisRequest['constraints'];
  conditions: PoiConditionRequest[];
};

export type PoiConditionResult = {
  category: PoiCategory;
  /** Vereinigung der Isochronen um die gewählten Orte dieser Kategorie. */
  reachable: AreaFeature | null;
  /**
   * Ob diese Bedingung *allein* etwas von der gemeinsamen Region übrig lässt.
   * Bleibt am Ende nichts übrig, zeigt das, welche Bedingung daran schuld ist.
   */
  satisfiable: boolean;
};

export type PoiRegionResult = {
  conditions: PoiConditionResult[];
  /**
   * Gemeinsame Region und *jede* Bedingung erfüllt.
   * null bedeutet: es bleibt nichts übrig -- ein gültiges Ergebnis, kein Fehler.
   */
  refined: AreaFeature | null;
};

/** Mehr parallele Provider-Calls bringen nichts und riskieren ein Rate-Limit. */
const CONCURRENCY = 4;

/**
 * Verengt die gemeinsame Region auf das, was alle POI-Bedingungen erfüllt.
 *
 * Innerhalb einer Kategorie wird **vereinigt**: Es genügt, dass *ein* Studio nah
 * ist. Zwischen den Kategorien wird **geschnitten**: Studio *und* Supermarkt
 * müssen passen. Deshalb kostet das O(N+M) statt jede Paarung einzeln zu prüfen.
 */
export class PoiRegionRefinement {
  constructor(
    private readonly strategy: LocationAnalysisStrategy,
    private readonly isochrones: IsochroneProvider,
  ) {}

  async execute(request: PoiRegionRequest): Promise<PoiRegionResult> {
    const active = request.conditions.filter((condition) => condition.origins.length > 0);

    if (active.length === 0) {
      throw new DomainError(
        'INVALID_INPUT',
        'Wähle mindestens einen Ort aus, bevor du ihn übernimmst.',
      );
    }

    for (const condition of active) {
      if (condition.maxTravelTimeMinutes > this.isochrones.maxTravelTimeMinutes) {
        throw new DomainError(
          'INVALID_INPUT',
          `Die Fahrzeit darf höchstens ${this.isochrones.maxTravelTimeMinutes} Minuten betragen.`,
        );
      }
    }

    const analysis = await this.strategy.analyze({ constraints: request.constraints });
    const region = analysis.intersection;

    if (region === null) {
      throw new DomainError(
        'INVALID_INPUT',
        'Für diese Ziele gibt es keine gemeinsame Region, die verfeinert werden könnte.',
      );
    }

    const areas = await this.isochronesFor(active);
    const conditions: PoiConditionResult[] = [];
    let refined: AreaFeature | null = region;

    for (const [index, condition] of active.entries()) {
      const reachable = unionAreas(areas[index] ?? []);

      conditions.push({
        category: condition.category,
        reachable,
        satisfiable: reachable !== null && intersectAreas([region, reachable]) !== null,
      });

      if (refined !== null && reachable !== null) {
        refined = intersectAreas([refined, reachable]);
      } else {
        refined = null;
      }
    }

    return { conditions, refined };
  }

  /** Eine Isochrone je gewähltem Ort, gebündelt über alle Bedingungen hinweg. */
  private async isochronesFor(
    conditions: PoiConditionRequest[],
  ): Promise<AreaFeature[][]> {
    const jobs = conditions.flatMap((condition, index) =>
      condition.origins.map((origin) => ({
        index,
        origin,
        minutes: condition.maxTravelTimeMinutes,
        travelMode: condition.travelMode,
      })),
    );

    const byCondition: AreaFeature[][] = conditions.map(() => []);

    for (let start = 0; start < jobs.length; start += CONCURRENCY) {
      const batch = jobs.slice(start, start + CONCURRENCY);

      const areas = await Promise.all(
        batch.map((job) =>
          this.isochrones.calculate(job.origin, {
            travelMode: job.travelMode,
            maxTravelTimeMinutes: job.minutes,
            // Bewusst einseitig, anders als bei den Zielen: "von wo aus
            // erreiche ich dieses Studio" ist die Frage der Bedingung. Den
            // Rueckweg mitzurechnen wuerde die Aufrufe verdoppeln, und hier
            // duerfen es 25 Orte sein statt einer Handvoll Ziele -- 50 von 500
            // Tagesanfragen fuer einen Genauigkeitsgewinn, der am Rand ein
            // paar hundert Meter ausmacht.
            direction: 'toTarget',
          }),
        ),
      );

      for (const [offset, area] of areas.entries()) {
        byCondition[batch[offset]?.index ?? 0]?.push(area);
      }
    }

    return byCondition;
  }
}
