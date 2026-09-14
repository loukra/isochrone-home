import { describe, expect, it } from 'vitest';
import { PoiRegionRefinement } from '../src/application/analysis/poi-region.js';
import { isDomainError } from '../src/domain/models/errors.js';
import type { AreaFeature, Coordinate } from '../src/domain/models/geo.js';
import type {
  LocationAnalysisResult,
  TravelMode,
} from '../src/domain/models/analysis.js';
import type { LocationAnalysisStrategy } from '../src/domain/ports/analysis-strategy.js';
import { unionAreas } from '../src/domain/services/geometry.js';
import { constraint, square, StubIsochroneProvider } from './helpers/fixtures.js';

class StubStrategy implements LocationAnalysisStrategy {
  readonly id = 'stub';

  constructor(private readonly intersection: AreaFeature | null) {}

  async analyze(): Promise<LocationAnalysisResult> {
    return {
      layers: [],
      intersection: this.intersection,
      targets: [],
      bounds: this.intersection === null ? null : [0, 0, 10, 10],
    };
  }
}

const at = (longitude: number, latitude: number): Coordinate => ({ longitude, latitude });

const request = (origins: Coordinate[], minutes = 10, travelMode: TravelMode = 'driving') => ({
  constraints: [constraint('a')],
  conditions: [
    { category: 'gym' as const, travelMode, maxTravelTimeMinutes: minutes, origins },
  ],
});

const twoConditions = (gyms: Coordinate[], markets: Coordinate[]) => ({
  constraints: [constraint('a')],
  conditions: [
    {
      category: 'gym' as const,
      travelMode: 'driving' as const,
      maxTravelTimeMinutes: 10,
      origins: gyms,
    },
    {
      category: 'supermarket' as const,
      travelMode: 'driving' as const,
      maxTravelTimeMinutes: 5,
      origins: markets,
    },
  ],
});

describe('PoiRegionRefinement', () => {
  it('verengt die Region auf die Umgebung der gewählten Orte', async () => {
    // Familienregion 0..10, ein Studio deckt nur 0..4 ab.
    const refinement = new PoiRegionRefinement(
      new StubStrategy(square(0, 0, 10, 10)),
      new StubIsochroneProvider([square(0, 0, 4, 10)]),
    );

    const result = await refinement.execute(request([at(2, 5)]));

    expect(result.refined).not.toBeNull();
    expect(result.refined?.geometry.type).toBe('Polygon');
  });

  it('vereinigt die Orte, statt sie zu schneiden', async () => {
    // Zwei Studios ohne gemeinsame Flaeche: Ein Schnitt waere leer, die
    // Vereinigung deckt beide Enden ab -- ein Studio in Reichweite genuegt.
    const isochrones = new StubIsochroneProvider([]);
    const provider = {
      maxTravelTimeMinutes: 60,
      calls: isochrones.calls,
      async calculate(origin: Coordinate) {
        return origin.longitude < 5 ? square(0, 0, 2, 10) : square(8, 0, 10, 10);
      },
    };

    const refinement = new PoiRegionRefinement(
      new StubStrategy(square(0, 0, 10, 10)),
      provider,
    );

    const result = await refinement.execute(request([at(1, 5), at(9, 5)]));

    expect(result.conditions[0]?.reachable?.geometry.type).toBe('MultiPolygon');
    expect(result.refined).not.toBeNull();
  });

  it('liefert null statt eines Fehlers, wenn nichts übrig bleibt', async () => {
    const refinement = new PoiRegionRefinement(
      new StubStrategy(square(0, 0, 4, 4)),
      new StubIsochroneProvider([square(20, 20, 24, 24)]),
    );

    const result = await refinement.execute(request([at(22, 22)]));

    expect(result.refined).toBeNull();
    expect(result.conditions[0]?.reachable).not.toBeNull();
  });

  it('fragt genau einen Isochronen-Call je gewähltem Ort an', async () => {
    const isochrones = new StubIsochroneProvider([square(0, 0, 10, 10)]);
    const refinement = new PoiRegionRefinement(
      new StubStrategy(square(0, 0, 10, 10)),
      isochrones,
    );

    await refinement.execute(request([at(1, 1), at(2, 2), at(3, 3)], 15));

    expect(isochrones.calls).toHaveLength(3);
    expect(isochrones.calls.map((call) => call.options.maxTravelTimeMinutes)).toEqual([
      15, 15, 15,
    ]);
  });

  it('weist eine Fahrzeit über der Providergrenze ab', async () => {
    const refinement = new PoiRegionRefinement(
      new StubStrategy(square(0, 0, 10, 10)),
      new StubIsochroneProvider([square(0, 0, 10, 10)]),
    );

    await expect(refinement.execute(request([at(1, 1)], 75))).rejects.toSatisfy(
      (error: unknown) => isDomainError(error) && error.code === 'INVALID_INPUT',
    );
  });

  it('verlangt eine gemeinsame Region', async () => {
    const refinement = new PoiRegionRefinement(
      new StubStrategy(null),
      new StubIsochroneProvider([square(0, 0, 10, 10)]),
    );

    await expect(refinement.execute(request([at(1, 1)]))).rejects.toSatisfy(
      (error: unknown) => isDomainError(error) && error.code === 'INVALID_INPUT',
    );
  });

  it('schneidet mehrere Bedingungen miteinander', async () => {
    // Studio deckt die Westhaelfte, Supermarkt die Osthaelfte: Nur der schmale
    // Streifen dazwischen erfuellt beides.
    const provider = {
      maxTravelTimeMinutes: 60,
      async calculate(origin: Coordinate) {
        return origin.latitude === 1 ? square(0, 0, 6, 10) : square(4, 0, 10, 10);
      },
    };

    const refinement = new PoiRegionRefinement(
      new StubStrategy(square(0, 0, 10, 10)),
      provider,
    );

    const result = await refinement.execute(
      twoConditions([{ longitude: 2, latitude: 1 }], [{ longitude: 8, latitude: 2 }]),
    );

    expect(result.conditions).toHaveLength(2);
    expect(result.conditions.every((condition) => condition.satisfiable)).toBe(true);
    expect(result.refined).not.toBeNull();
  });

  it('benennt die Bedingung, an der es scheitert', async () => {
    const provider = {
      maxTravelTimeMinutes: 60,
      async calculate(origin: Coordinate) {
        // Der Supermarkt liegt vollstaendig ausserhalb der Familienregion.
        return origin.latitude === 1 ? square(0, 0, 6, 10) : square(50, 50, 60, 60);
      },
    };

    const refinement = new PoiRegionRefinement(
      new StubStrategy(square(0, 0, 10, 10)),
      provider,
    );

    const result = await refinement.execute(
      twoConditions([{ longitude: 2, latitude: 1 }], [{ longitude: 55, latitude: 2 }]),
    );

    expect(result.refined).toBeNull();
    expect(result.conditions.map((condition) => condition.satisfiable)).toEqual([
      true,
      false,
    ]);
  });

  it('überspringt Bedingungen ohne Auswahl', async () => {
    const isochrones = new StubIsochroneProvider([square(0, 0, 10, 10)]);
    const refinement = new PoiRegionRefinement(
      new StubStrategy(square(0, 0, 10, 10)),
      isochrones,
    );

    const result = await refinement.execute(
      twoConditions([{ longitude: 1, latitude: 1 }], []),
    );

    expect(result.conditions).toHaveLength(1);
    expect(isochrones.calls).toHaveLength(1);
  });

  it('fragt die Isochrone im Verkehrsmittel der Bedingung ab', async () => {
    // Vorher rechnete Schritt 3 ausnahmslos mit dem Auto -- ein Supermarkt
    // "10 Minuten zu Fuß" bekam damit die Flaeche einer Autofahrt.
    const isochrones = new StubIsochroneProvider([square(0, 0, 10, 10)]);
    const refinement = new PoiRegionRefinement(
      new StubStrategy(square(0, 0, 10, 10)),
      isochrones,
    );

    await refinement.execute(request([at(1, 1)], 10, 'walking'));

    expect(isochrones.calls[0]?.options.travelMode).toBe('walking');
  });

  it('trennt die Verkehrsmittel zweier Bedingungen', async () => {
    const isochrones = new StubIsochroneProvider([square(0, 0, 10, 10)]);
    const refinement = new PoiRegionRefinement(
      new StubStrategy(square(0, 0, 10, 10)),
      isochrones,
    );

    await refinement.execute({
      constraints: [constraint('a')],
      conditions: [
        {
          category: 'gym' as const,
          travelMode: 'driving' as const,
          maxTravelTimeMinutes: 15,
          origins: [at(1, 1)],
        },
        {
          category: 'supermarket' as const,
          travelMode: 'walking' as const,
          maxTravelTimeMinutes: 10,
          origins: [at(2, 2)],
        },
      ],
    });

    expect(isochrones.calls.map((call) => call.options.travelMode)).toEqual([
      'driving',
      'walking',
    ]);
  });

  it('verlangt mindestens einen Ort', async () => {
    const refinement = new PoiRegionRefinement(
      new StubStrategy(square(0, 0, 10, 10)),
      new StubIsochroneProvider([square(0, 0, 10, 10)]),
    );

    await expect(refinement.execute(request([]))).rejects.toSatisfy(
      (error: unknown) => isDomainError(error) && error.code === 'INVALID_INPUT',
    );
  });
});

describe('unionAreas', () => {
  it('führt überlappende Flächen zu einer zusammen', () => {
    const result = unionAreas([square(0, 0, 4, 4), square(2, 0, 6, 4)]);
    expect(result?.geometry.type).toBe('Polygon');
  });

  it('behält getrennte Flächen als MultiPolygon', () => {
    const result = unionAreas([square(0, 0, 1, 1), square(5, 5, 6, 6)]);
    expect(result?.geometry.type).toBe('MultiPolygon');
  });

  it('liefert bei leerer Eingabe null', () => {
    expect(unionAreas([])).toBeNull();
  });
});
