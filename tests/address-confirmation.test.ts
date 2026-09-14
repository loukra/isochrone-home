import { describe, expect, it } from 'vitest';
import {
  asksForHouseNumber,
  missesHouseNumber,
  soleAnswer,
} from '../src/frontend/address.js';
import type { GeocodingCandidate } from '../src/frontend/types.js';

const candidate = (
  precision: GeocodingCandidate['precision'],
  label = 'irgendwo',
): GeocodingCandidate => ({
  label,
  coordinate: { latitude: 53, longitude: 8 },
  precision,
});

describe('asksForHouseNumber', () => {
  it.each([
    ['Astruper Straße 28, Hatten', true],
    ['Astruper Straße 28a, Hatten', true],
    ['Burnhörn 32, 26655 Westerstede', true],
    ['Wehdestr 7', true],
    ['Oldenburg', false],
    // Die Postleitzahl ist keine Hausnummer -- sonst waere jede Stadt mit PLZ
    // eine Frage nach einem Haus und muesste bestaetigt werden.
    ['26123 Oldenburg', false],
    ['Landkreis Ammerland', false],
    // Der Punkt rettet die Hausnummerlose: "17." ist keine.
    ['Straße des 17. Juni, Berlin', false],
  ])('%s -> %s', (query, expected) => {
    expect(asksForHouseNumber(query)).toBe(expected);
  });
});

describe('soleAnswer', () => {
  it('uebernimmt einen einzelnen Haustreffer ohne Rueckfrage', () => {
    const only = candidate('address');
    expect(soleAnswer('Astruper Straße 28, Hatten', [only])).toBe(only);
  });

  /**
   * Der gemessene Fehler: Auf "Astruper Straße 28, Hatten" kam genau ein
   * Treffer -- der Mittelpunkt der Strasse, 405 m neben dem Haus -- und die
   * Oberflaeche uebernahm ihn wortlos.
   */
  it('fragt nach, wenn auf eine Hausnummer nur eine Strasse kommt', () => {
    expect(soleAnswer('Astruper Straße 28, Hatten', [candidate('street')])).toBeNull();
  });

  it('fragt nach, wenn auf eine Hausnummer nur ein Ortsteil kommt', () => {
    expect(soleAnswer('Burnhörn 32 Ocholt Westerstede', [candidate('place')])).toBeNull();
  });

  it('uebernimmt einen Ort, wenn auch nach einem Ort gefragt war', () => {
    const only = candidate('place', 'Oldenburg');
    expect(soleAnswer('Oldenburg', [only])).toBe(only);
  });

  it('fragt bei mehreren Treffern immer nach', () => {
    expect(
      soleAnswer('Oldenburg', [candidate('address'), candidate('address')]),
    ).toBeNull();
  });

  it('liefert null, wenn es nichts gibt', () => {
    expect(soleAnswer('Nirgendwo', [])).toBeNull();
  });
});

describe('missesHouseNumber', () => {
  it('meldet, dass kein Treffer ein Haus ist', () => {
    expect(
      missesHouseNumber('Astruper Straße 28, Hatten', [
        candidate('street'),
        candidate('place'),
      ]),
    ).toBe(true);
  });

  it('schweigt, sobald ein Haus dabei ist', () => {
    expect(
      missesHouseNumber('Astruper Straße 28, Hatten', [
        candidate('address'),
        candidate('street'),
      ]),
    ).toBe(false);
  });

  it('schweigt, wenn gar nicht nach einem Haus gefragt war', () => {
    expect(missesHouseNumber('Oldenburg', [candidate('place')])).toBe(false);
  });
});
