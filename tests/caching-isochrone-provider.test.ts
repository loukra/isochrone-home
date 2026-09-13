import { describe, expect, it } from 'vitest';
import { CachingIsochroneProvider } from '../src/infrastructure/isochrone/caching-isochrone-provider.js';
import { square, StubIsochroneProvider } from './helpers/fixtures.js';

const OPTIONS = { travelMode: 'driving' as const, maxTravelTimeMinutes: 30 };
const ORIGIN = { latitude: 51.96, longitude: 7.63 };

describe('CachingIsochroneProvider', () => {
  it('ruft den Provider für identische Parameter nur einmal auf', async () => {
    const delegate = new StubIsochroneProvider([square(0, 0, 10, 10)]);
    const provider = new CachingIsochroneProvider(delegate);

    await provider.calculate(ORIGIN, OPTIONS);
    await provider.calculate(ORIGIN, OPTIONS);

    expect(delegate.calls).toHaveLength(1);
  });

  it('unterscheidet nach Fahrzeit', async () => {
    const delegate = new StubIsochroneProvider([
      square(0, 0, 10, 10),
      square(0, 0, 20, 20),
    ]);
    const provider = new CachingIsochroneProvider(delegate);

    await provider.calculate(ORIGIN, OPTIONS);
    await provider.calculate(ORIGIN, { ...OPTIONS, maxTravelTimeMinutes: 45 });

    expect(delegate.calls).toHaveLength(2);
  });

  it('teilt parallele Anfragen denselben Provider-Call', async () => {
    const delegate = new StubIsochroneProvider([square(0, 0, 10, 10)]);
    const provider = new CachingIsochroneProvider(delegate);

    await Promise.all([
      provider.calculate(ORIGIN, OPTIONS),
      provider.calculate(ORIGIN, OPTIONS),
    ]);

    expect(delegate.calls).toHaveLength(1);
  });

  it('cached Fehler nicht', async () => {
    const failing = {
      maxTravelTimeMinutes: 60,
      calls: 0,
      async calculate() {
        this.calls += 1;
        throw new Error('boom');
      },
    };
    const provider = new CachingIsochroneProvider(failing);

    await expect(provider.calculate(ORIGIN, OPTIONS)).rejects.toThrow();
    await expect(provider.calculate(ORIGIN, OPTIONS)).rejects.toThrow();

    expect(failing.calls).toBe(2);
  });
});
