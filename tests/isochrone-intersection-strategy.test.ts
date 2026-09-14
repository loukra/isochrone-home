import { describe, expect, it } from 'vitest';
import { IsochroneIntersectionStrategy } from '../src/application/analysis/isochrone-intersection-strategy.js';
import { DomainError } from '../src/domain/models/errors.js';
import {
  constraint,
  square,
  StubGeocoder,
  StubIsochroneProvider,
} from './helpers/fixtures.js';

const MUENSTER = { latitude: 51.96, longitude: 7.63 };
const DORTMUND = { latitude: 51.51, longitude: 7.47 };

const makeStrategy = (areas: ReturnType<typeof square>[]) => {
  const geocoder = new StubGeocoder({ Münster: MUENSTER, Dortmund: DORTMUND });
  const isochrones = new StubIsochroneProvider(areas);
  return {
    strategy: new IsochroneIntersectionStrategy(geocoder, isochrones),
    geocoder,
    isochrones,
  };
};

describe('IsochroneIntersectionStrategy', () => {
  it('liefert bei einem Ziel die Isochrone selbst als Schnittmenge', async () => {
    const area = square(0, 0, 10, 10);
    const { strategy } = makeStrategy([area]);

    const result = await strategy.analyze({ constraints: [constraint('a')] });

    expect(result.intersection).toEqual(area);
    expect(result.layers).toHaveLength(2);
    expect(result.layers.filter((layer) => layer.type === 'isochrone')).toHaveLength(1);
    expect(result.layers.filter((layer) => layer.type === 'intersection')).toHaveLength(
      1,
    );
  });

  it('schneidet zwei Ziele korrekt', async () => {
    const { strategy } = makeStrategy([square(0, 0, 10, 10), square(5, 5, 15, 15)]);

    const result = await strategy.analyze({
      constraints: [
        constraint('a', { address: 'Münster' }),
        constraint('b', { address: 'Dortmund' }),
      ],
    });

    expect(result.intersection).not.toBeNull();
    expect(result.targets).toHaveLength(2);
    expect(result.layers.filter((layer) => layer.type === 'isochrone')).toHaveLength(2);
  });

  it('behandelt eine leere Schnittmenge als normalen Fall', async () => {
    const { strategy } = makeStrategy([square(0, 0, 5, 5), square(20, 20, 25, 25)]);

    const result = await strategy.analyze({
      constraints: [
        constraint('a', { address: 'Münster' }),
        constraint('b', { address: 'Dortmund' }),
      ],
    });

    expect(result.intersection).toBeNull();
    // Einzelne Isochronen bleiben sichtbar (Spec 10).
    expect(result.layers).toHaveLength(2);
    expect(result.layers.every((layer) => layer.type === 'isochrone')).toBe(true);
  });

  it('überspringt das Geocoding bei bereits aufgelöster Koordinate', async () => {
    const { strategy, geocoder, isochrones } = makeStrategy([square(0, 0, 10, 10)]);

    await strategy.analyze({
      constraints: [constraint('a', { coordinate: MUENSTER })],
    });

    expect(geocoder.calls).toHaveLength(0);
    expect(isochrones.calls[0]?.origin).toEqual(MUENSTER);
  });

  it('reicht Geocoding-Fehler als Domain-Fehler weiter', async () => {
    const { strategy } = makeStrategy([square(0, 0, 10, 10)]);

    await expect(
      strategy.analyze({ constraints: [constraint('a', { address: 'Nirgendwo' })] }),
    ).rejects.toBeInstanceOf(DomainError);
  });

  it('lehnt eine ungültige Fahrzeit ab, bevor ein Provider aufgerufen wird', async () => {
    const { strategy, isochrones } = makeStrategy([square(0, 0, 10, 10)]);

    await expect(
      strategy.analyze({ constraints: [constraint('a', { maxTravelTimeMinutes: 0 })] }),
    ).rejects.toBeInstanceOf(DomainError);

    expect(isochrones.calls).toHaveLength(0);
  });

  it('übergibt die Fahrzeit unverändert an den Provider', async () => {
    const { strategy, isochrones } = makeStrategy([square(0, 0, 10, 10)]);

    await strategy.analyze({
      constraints: [constraint('a', { maxTravelTimeMinutes: 45 })],
    });

    expect(isochrones.calls[0]?.options).toEqual({
      travelMode: 'driving',
      maxTravelTimeMinutes: 45,
      direction: 'toTarget',
    });
  });

  it('holt je Ziel beide Fahrtrichtungen', async () => {
    // "45 Minuten" heisst 45 in beide Richtungen. Eine einzelne Isochrone
    // kennt nur eine davon -- und die beiden sind nicht dieselbe Flaeche.
    const { strategy, isochrones } = makeStrategy([square(0, 0, 10, 10)]);

    await strategy.analyze({
      constraints: [constraint('a', { maxTravelTimeMinutes: 45 })],
    });

    expect(isochrones.calls).toHaveLength(2);
    expect(isochrones.calls.map((call) => call.options.direction).sort()).toEqual([
      'fromTarget',
      'toTarget',
    ]);
  });
});
