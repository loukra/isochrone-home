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

/**
 * Die Postleitzahl-Erkennung war fuenfstellig-deutsch. Sie ist nur dafuer da,
 * eine Postleitzahl nicht faelschlich fuer eine Hausnummer zu halten -- und
 * lag damit ausserhalb Deutschlands regelmaessig daneben.
 *
 * Die Richtung des Fehlers zaehlt hier mehr als seine Haeufigkeit: Einmal zu
 * viel zu fragen kostet einen Klick, einmal zu wenig einen still verschobenen
 * Punkt.
 */
describe('Postleitzahlen anderer Laender', () => {
  it('haelt eine niederlaendische Postleitzahl nicht fuer eine Hausnummer', () => {
    expect(asksForHouseNumber('9745 CC Groningen')).toBe(false);
    expect(asksForHouseNumber('9745CC Groningen')).toBe(false);
  });

  it('haelt eine britische Postleitzahl nicht fuer eine Hausnummer', () => {
    expect(asksForHouseNumber('London SW1A 2AA')).toBe(false);
  });

  it('haelt eine kanadische Postleitzahl nicht fuer eine Hausnummer', () => {
    expect(asksForHouseNumber('Ottawa K1A 0B1')).toBe(false);
  });

  it('erkennt ZIP+4 als Postleitzahl', () => {
    expect(asksForHouseNumber('Springfield, IL 62704-1234')).toBe(false);
  });

  it('erkennt die Hausnummer trotzdem, wenn eine danebensteht', () => {
    expect(asksForHouseNumber('10 Downing Street, London SW1A 2AA')).toBe(true);
    expect(asksForHouseNumber('Kerkstraat 1, 9745 CC Groningen')).toBe(true);
    expect(asksForHouseNumber('350 Fifth Avenue, New York, NY 10019')).toBe(true);
  });

  /**
   * Bewusst festgehalten: Eine rein vierstellige Postleitzahl gilt weiter als
   * Hausnummer, weil sie von einer nicht zu unterscheiden ist. Das kostet in
   * Oesterreich und der Schweiz eine Rueckfrage -- sichtbar, und damit die
   * harmlose Seite des Irrtums.
   */
  it('fragt bei vierstelligen Postleitzahlen lieber einmal zu viel', () => {
    expect(asksForHouseNumber('1010 Wien')).toBe(true);
  });
});
