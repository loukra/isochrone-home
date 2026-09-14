import { describe, expect, it } from 'vitest';
import { reachableArea } from '../src/application/analysis/reachable-area.js';
import type { AreaFeature, Coordinate } from '../src/domain/models/geo.js';
import type {
  IsochroneOptions,
  IsochroneProvider,
} from '../src/domain/ports/isochrone-provider.js';
import { square, StubIsochroneProvider } from './helpers/fixtures.js';

const ORIGIN: Coordinate = { latitude: 53.14, longitude: 8.21 };
const OPTIONS = { travelMode: 'driving' as const, maxTravelTimeMinutes: 25 };

/** Liefert je Richtung eine andere Flaeche -- wie der echte Provider. */
class DirectionalProvider implements IsochroneProvider {
  readonly maxTravelTimeMinutes = 60;
  calls: IsochroneOptions[] = [];

  constructor(
    private readonly toTarget: AreaFeature,
    private readonly fromTarget: AreaFeature,
  ) {}

  async calculate(_origin: Coordinate, options: IsochroneOptions): Promise<AreaFeature> {
    this.calls.push(options);
    return options.direction === 'toTarget' ? this.toTarget : this.fromTarget;
  }
}

describe('reachableArea', () => {
  it('fragt beide Fahrtrichtungen ab', async () => {
    const provider = new DirectionalProvider(square(0, 0, 10, 10), square(0, 0, 10, 10));

    await reachableArea(provider, ORIGIN, OPTIONS);

    expect(provider.calls.map((call) => call.direction).sort()).toEqual([
      'fromTarget',
      'toTarget',
    ]);
  });

  it('reicht Verkehrsmittel und Zeit unveraendert durch', async () => {
    const provider = new DirectionalProvider(square(0, 0, 10, 10), square(0, 0, 10, 10));

    await reachableArea(provider, ORIGIN, { travelMode: 'cycling', maxTravelTimeMinutes: 12 });

    for (const call of provider.calls) {
      expect(call.travelMode).toBe('cycling');
      expect(call.maxTravelTimeMinutes).toBe(12);
    }
  });

  it('schneidet die Richtungen, statt sie zu vereinigen', async () => {
    // Hinweg deckt den Westen, Rueckweg den Osten. Wer in 25 Minuten hin *und*
    // zurueck will, dem bleibt nur der Streifen dazwischen -- die Vereinigung
    // waere die schwaechere Aussage "in irgendeiner Richtung im Limit".
    const provider = new DirectionalProvider(square(0, 0, 6, 10), square(4, 0, 10, 10));

    const area = await reachableArea(provider, ORIGIN, OPTIONS);
    const xs = (area.geometry.coordinates[0] as Array<[number, number]>).map(([x]) => x);

    expect(Math.min(...xs)).toBeCloseTo(4);
    expect(Math.max(...xs)).toBeCloseTo(6);
  });

  it('faellt auf den Hinweg zurueck, wenn sich die Richtungen nicht schneiden', async () => {
    // Kann real nicht vorkommen -- beide Flaechen enthalten den Punkt selbst.
    // Entartete Providerdaten duerfen die Karte aber nicht leer lassen.
    const provider = new DirectionalProvider(square(0, 0, 4, 4), square(50, 50, 60, 60));

    const area = await reachableArea(provider, ORIGIN, OPTIONS);
    const xs = (area.geometry.coordinates[0] as Array<[number, number]>).map(([x]) => x);

    expect(Math.max(...xs)).toBeCloseTo(4);
  });

  it('kostet genau zwei Providercalls je Punkt', async () => {
    const provider = new StubIsochroneProvider([square(0, 0, 10, 10)]);

    await reachableArea(provider, ORIGIN, OPTIONS);

    expect(provider.calls).toHaveLength(2);
  });
});
