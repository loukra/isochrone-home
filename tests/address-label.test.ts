import { describe, expect, it } from 'vitest';
import { labelOf, type AddressParts } from '../src/infrastructure/geocoding/address-label.js';

/**
 * Die Bezeichnung eines Treffers setzt die App, nicht der Anbieter.
 *
 * Alle Bestandteile hier stammen aus **echten** Photon-Antworten, abgerufen am
 * 14.09.2026 (`lang=de`, `limit=1`). Der Live-Durchlauf war die Quelle, der
 * Test bleibt offline -- echte API-Aufrufe gehören nicht in Unit-Tests, sonst
 * scheitern sie, wenn ein fremder Dienst hakt, und messen dessen Verfügbarkeit
 * statt dieser Regeln.
 *
 * Genau dieser Durchlauf hat drei Fehler aufgedeckt, die keine Fixture zuvor
 * traf. Sie stehen unten je als eigener Fall.
 */

const oldenburg: AddressParts = {
  houseNumber: '7',
  street: 'Wehdestraße',
  place: 'Oldenburg',
  state: 'Niedersachsen',
  country: 'Deutschland',
  postalCode: '26123',
  countryCode: 'DE',
};

const westerstede: AddressParts = {
  name: 'Westerstede',
  county: 'Landkreis Ammerland',
  state: 'Niedersachsen',
  country: 'Deutschland',
  postalCode: '26655',
  countryCode: 'DE',
};

const paris: AddressParts = {
  houseNumber: '10',
  street: 'Rue de Rivoli',
  place: 'Paris',
  state: 'Île-de-France',
  country: 'Frankreich',
  postalCode: '75004',
  countryCode: 'FR',
};

const london: AddressParts = {
  houseNumber: '10',
  name: '10 Downing Street',
  street: 'Downing Street',
  place: 'London',
  state: 'England',
  country: 'Vereinigtes Königreich',
  postalCode: 'SW1A 2AA',
  countryCode: 'GB',
};

const newYork: AddressParts = {
  houseNumber: '650',
  name: '650 Fifth Avenue',
  street: '5th Avenue',
  place: 'New York',
  state: 'NY',
  country: 'Vereinigte Staaten von Amerika',
  postalCode: '10019',
  countryCode: 'US',
};

describe('labelOf', () => {
  /**
   * Die Zeile folgt dem Land des **Treffers**, nicht dem des Nutzers: Wer von
   * Deutschland aus in London sucht, will die Londoner Schreibweise sehen.
   */
  describe('Form der Zeile je Land', () => {
    it('setzt die Postleitzahl im deutschsprachigen Raum vor den Ort', () => {
      expect(labelOf(oldenburg, 'x', 'DE')).toBe('Wehdestraße 7, 26123 Oldenburg');
    });

    it('stellt die Hausnummer in Frankreich voran', () => {
      // Gefunden im Live-Durchlauf: Vorher stand hier "Rue de Rivoli 10" --
      // die deutsche Reihenfolge, auf eine französische Adresse angewandt.
      expect(labelOf(paris, 'x', 'FR')).toBe('10 Rue de Rivoli, 75004 Paris');
    });

    it('setzt die Postleitzahl in Grossbritannien hinter den Ort, ohne Komma', () => {
      // Gefunden im Live-Durchlauf: Vorher "London, SW1A 2AA" -- ein Komma,
      // das auf keinem britischen Umschlag steht.
      expect(labelOf(london, 'x', 'GB')).toBe('10 Downing Street, London SW1A 2AA');
    });

    it('nennt in den USA das Bundesland als eigenen Abschnitt', () => {
      // Ohne "NY" beantwortet die Zeile nicht, welches Springfield gemeint ist
      // -- den Namen gibt es in über dreissig Staaten.
      expect(labelOf(newYork, 'x', 'US')).toBe('650 Fifth Avenue, New York, NY 10019');
    });

    it('gibt einem unbekannten Land die Vorgabeform', () => {
      // Höchstens ungewohnt sortiert, nie falsch: Alle Bestandteile stehen da.
      const somewhere: AddressParts = {
        street: 'Kerkstraat',
        houseNumber: '1',
        place: 'Groningen',
        postalCode: '9745CC',
        country: 'Niederlande',
        countryCode: 'NL',
      };
      expect(labelOf(somewhere, 'x', 'NL')).toBe('Kerkstraat 1, 9745CC Groningen');
    });
  });

  describe('das eigene Land bleibt ungenannt', () => {
    it('schweigt daheim', () => {
      expect(labelOf(oldenburg, 'x', 'DE')).not.toContain('Deutschland');
    });

    it('nennt es im Ausland', () => {
      // Dieselbe Adresse, anderer Nutzer -- jetzt unterscheidet das Land etwas.
      expect(labelOf(oldenburg, 'x', 'FR')).toBe(
        'Wehdestraße 7, 26123 Oldenburg, Deutschland',
      );
      expect(labelOf(paris, 'x', 'DE')).toBe('10 Rue de Rivoli, 75004 Paris, Frankreich');
    });

    it('nennt es, wenn die Region unbekannt ist', () => {
      // Eine Zeile zu lang ist besser als eine, die ein Land verschweigt, das
      // sehr wohl etwas unterschieden hätte.
      expect(labelOf(oldenburg, 'x', null)).toContain('Deutschland');
    });
  });

  describe('ist der Ort selbst der Treffer', () => {
    it('ordnet der Kreis ein, statt den Namen zu wiederholen', () => {
      expect(labelOf(westerstede, 'x', 'DE')).toBe('Westerstede, Landkreis Ammerland');
    });

    it('laesst die Postleitzahl weg', () => {
      // Gefunden im Live-Durchlauf: Vorher "Westerstede, 26655 Landkreis
      // Ammerland". Die Zahl gehört zum Ort, und der steht bereits links --
      // an einen Landkreis geklebt ergibt sie keine Adresse. Zudem hat eine
      // Stadt viele Postleitzahlen; eine davon zu zeigen führte in die Irre.
      expect(labelOf(westerstede, 'x', 'DE')).not.toContain('26655');
    });
  });

  it('faellt auf die Eingabe zurueck, wenn nichts Verwertbares kommt', () => {
    expect(labelOf({}, 'Astruper Straße 28', 'DE')).toBe('Astruper Straße 28');
  });
});
