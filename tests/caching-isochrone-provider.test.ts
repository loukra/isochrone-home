import { describe, expect, it } from 'vitest';
import { CachingIsochroneProvider } from '../src/infrastructure/isochrone/caching-isochrone-provider.js';
import { square, StubIsochroneProvider } from './helpers/fixtures.js';

const OPTIONS = {
  travelMode: 'driving' as const,
  maxTravelTimeMinutes: 30,
  direction: 'toTarget' as const,
};
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

  it('unterscheidet nach Verkehrsmittel', async () => {
    // Sonst bekäme das Fahrrad die Autofläche desselben Ortes serviert.
    const delegate = new StubIsochroneProvider([
      square(0, 0, 10, 10),
      square(0, 0, 3, 3),
    ]);
    const provider = new CachingIsochroneProvider(delegate);

    await provider.calculate(ORIGIN, OPTIONS);
    await provider.calculate(ORIGIN, { ...OPTIONS, travelMode: 'cycling' });

    expect(delegate.calls).toHaveLength(2);
  });

  it('unterscheidet nach Fahrtrichtung', async () => {
    // Hin- und Rueckweg sind verschiedene Flaechen. Ohne die Richtung im
    // Schluessel bekaeme der zweite Aufruf die Flaeche des ersten -- und die
    // Schnittmenge der beiden waere dann immer eine Flaeche mit sich selbst,
    // also genau die einseitige Aussage, die abgeschafft werden sollte.
    const delegate = new StubIsochroneProvider([
      square(0, 0, 10, 10),
      square(0, 0, 3, 3),
    ]);
    const provider = new CachingIsochroneProvider(delegate);

    await provider.calculate(ORIGIN, { ...OPTIONS, direction: 'toTarget' });
    await provider.calculate(ORIGIN, { ...OPTIONS, direction: 'fromTarget' });

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
