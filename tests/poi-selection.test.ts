import { describe, expect, it } from 'vitest';
import {
  groupKeyOf,
  groupPois,
  groupSelectionOf,
  isPoiSelected,
  normalizeLabel,
  poiKeyOf,
  rankOf,
  sortGroups,
  toggleGroup,
  toggleMember,
  UNNAMED_LABEL,
} from '../src/frontend/poi/selection.js';
import type { FoundPoi } from '../src/frontend/types.js';

const poi = (over: Partial<FoundPoi> = {}): FoundPoi => ({
  id: 'node/1',
  category: 'gym',
  name: 'Studio',
  coordinate: { latitude: 53, longitude: 8 },
  brand: null,
  website: null,
  sport: null,
  areaSquareMeters: null,
  distanceToRegionKm: 0,
  ...over,
});

describe('groupKeyOf', () => {
  it('bindet Filialen einer Kette an die Marke', () => {
    const a = poi({ id: 'node/1', brand: 'McFit' });
    const b = poi({ id: 'node/2', brand: 'McFit' });
    expect(groupKeyOf(a)).toBe(groupKeyOf(b));
  });

  it('bindet namenlose Orte an die OSM-ID', () => {
    expect(groupKeyOf(poi({ id: 'way/7', brand: null, name: UNNAMED_LABEL }))).toBe(
      'poi:way/7',
    );
  });

  it('vereint Marke und gleichlautenden Namen', () => {
    // OSM taggt uneinheitlich: dieselbe Kette traegt mal brand, mal nur name.
    expect(groupKeyOf(poi({ id: 'node/1', brand: 'clever fit' }))).toBe(
      groupKeyOf(poi({ id: 'node/2', brand: null, name: 'Clever Fit' })),
    );
  });

  it('bindet Studios ohne Marke an den Namen', () => {
    // Nur etwa die Haelfte der Studios traegt ein brand-Tag. Ohne den
    // Namensrueckfall haette dieselbe Kette in jeder Region einen anderen
    // Schluessel -- die Auswahl truege dann nicht ueber die Region hinaus.
    expect(groupKeyOf(poi({ id: 'node/1', name: 'clever fit' }))).toBe(
      groupKeyOf(poi({ id: 'node/2', name: 'Clever Fit' })),
    );
  });

  it('behandelt Schreibvarianten derselben Kette gleich', () => {
    expect(groupKeyOf(poi({ brand: 'clever fit' }))).toBe(
      groupKeyOf(poi({ id: 'node/9', brand: 'Clever-Fit' })),
    );
  });

  it('haelt Bahnhoefe einzeln, auch bei gleichem Betreiber', () => {
    // OSM setzt bei Bahnhoefen haeufig operator=Deutsche Bahn. Ohne
    // Sonderbehandlung stuenden dann alle Bahnhoefe in einer Zeile.
    const a = poi({ id: 'node/1', category: 'station', brand: 'Deutsche Bahn' });
    const b = poi({ id: 'node/2', category: 'station', brand: 'Deutsche Bahn' });

    expect(groupKeyOf(a)).toBe('poi:node/1');
    expect(groupKeyOf(a)).not.toBe(groupKeyOf(b));
  });

  it('benennt ortsgebundene Ziele nach dem Namen, nicht nach dem Betreiber', () => {
    // In OSM steht bei Bahnhoefen der Betreiber im brand/operator -- "DB
    // InfraGO AG" sagt nicht, welcher Bahnhof gemeint ist.
    const groups = groupPois([
      poi({ id: 'node/1', category: 'station', name: 'Hude', brand: 'DB InfraGO AG' }),
    ]);

    expect(groups[0]?.label).toBe('Hude');
  });

  it('gruppiert auch gleichnamige Bahnhoefe nicht', () => {
    const groups = groupPois([
      poi({ id: 'node/1', category: 'station', name: 'Bahnhof' }),
      poi({ id: 'node/2', category: 'station', name: 'Bahnhof' }),
    ]);

    expect(groups).toHaveLength(2);
  });

  it('ignoriert eine leere Marke', () => {
    expect(groupKeyOf(poi({ id: 'node/3', brand: '   ', name: UNNAMED_LABEL }))).toBe(
      'poi:node/3',
    );
  });
});

describe('normalizeLabel', () => {
  it('wandelt Umlaute korrekt um', () => {
    // Reihenfolge zählt: NFKD zuerst würde die Umlaute zerlegen.
    expect(normalizeLabel('Körperformen')).toBe('koerperformen');
    expect(normalizeLabel('Fitnessstraße')).toBe('fitnessstrasse');
  });
});

describe('groupPois', () => {
  it('fasst Filialen zu einer Zeile zusammen', () => {
    const groups = groupPois([
      poi({ id: 'node/1', brand: 'McFit', distanceToRegionKm: 3 }),
      poi({ id: 'node/2', brand: 'McFit', distanceToRegionKm: 1 }),
      poi({ id: 'node/3', name: 'Einzelstudio', distanceToRegionKm: 2 }),
    ]);

    expect(groups).toHaveLength(2);
    const mcfit = groups.find((g) => g.label === 'McFit');
    expect(mcfit?.members).toHaveLength(2);
    expect(mcfit?.isBrand).toBe(true);
  });

  it('fasst gleichnamige Studios ohne Marke zusammen', () => {
    const groups = groupPois([
      poi({ id: 'node/1', name: 'clever fit', distanceToRegionKm: 4 }),
      poi({ id: 'node/2', name: 'Clever Fit', distanceToRegionKm: 1 }),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.isBrand).toBe(false);
  });

  it('lässt namenlose Orte getrennt', () => {
    const groups = groupPois([
      poi({ id: 'node/1', name: UNNAMED_LABEL }),
      poi({ id: 'node/2', name: UNNAMED_LABEL }),
    ]);

    expect(groups).toHaveLength(2);
  });

  it('sortiert Gruppen nach der nächstgelegenen Filiale', () => {
    const groups = groupPois([
      poi({ id: 'node/1', brand: 'Fern', distanceToRegionKm: 9 }),
      poi({ id: 'node/2', brand: 'Nah', distanceToRegionKm: 1 }),
    ]);

    expect(groups.map((g) => g.label)).toEqual(['Nah', 'Fern']);
  });

  it('sortiert auch innerhalb einer Kette nach Entfernung', () => {
    const groups = groupPois([
      poi({ id: 'node/1', brand: 'K', distanceToRegionKm: 8 }),
      poi({ id: 'node/2', brand: 'K', distanceToRegionKm: 2 }),
    ]);

    expect(groups[0]?.members.map((m) => m.distanceToRegionKm)).toEqual([2, 8]);
  });

  it('liefert bei leerer Eingabe keine Gruppen', () => {
    expect(groupPois([])).toEqual([]);
  });
});

describe('sortGroups', () => {
  const labelsOf = (pois: Parameters<typeof groupPois>[0]) =>
    sortGroups(groupPois(pois), 'relevance').map((group) => group.label);

  it('stellt belegt große Flächen vor Ketten und Unbekanntes', () => {
    expect(
      labelsOf([
        poi({ id: 'node/1', name: 'Unbekannt', distanceToRegionKm: 0 }),
        poi({ id: 'node/2', brand: 'Kette', distanceToRegionKm: 0 }),
        poi({ id: 'node/3', name: 'Halle', areaSquareMeters: 1200 }),
      ]),
    ).toEqual(['Halle', 'Kette', 'Unbekannt']);
  });

  it('setzt belegt kleine Studios ganz nach unten', () => {
    // Eine gemessene Winzigkeit ist die einzige Angabe, die sicher ausschliesst
    // -- ein unbekanntes Studio koennte dagegen gross sein.
    expect(
      labelsOf([
        poi({ id: 'node/1', name: 'Winzig', areaSquareMeters: 27 }),
        poi({ id: 'node/2', name: 'Unbekannt' }),
      ]),
    ).toEqual(['Unbekannt', 'Winzig']);
  });

  it('ordnet große Flächen untereinander nach Größe', () => {
    expect(
      labelsOf([
        poi({ id: 'node/1', name: 'Mittel', areaSquareMeters: 700 }),
        poi({ id: 'node/2', name: 'Riesig', areaSquareMeters: 2400 }),
      ]),
    ).toEqual(['Riesig', 'Mittel']);
  });

  it('ordnet Ketten nach Anzahl der Filialen', () => {
    expect(
      labelsOf([
        poi({ id: 'node/1', brand: 'Einzeln', distanceToRegionKm: 0 }),
        poi({ id: 'node/2', brand: 'Viele', distanceToRegionKm: 5 }),
        poi({ id: 'node/3', brand: 'Viele', distanceToRegionKm: 6 }),
      ]),
    ).toEqual(['Viele', 'Einzeln']);
  });

  it('zählt eine Gruppe mit großer Filiale als groß', () => {
    const groups = groupPois([
      poi({ id: 'node/1', brand: 'Kette', areaSquareMeters: null }),
      poi({ id: 'node/2', brand: 'Kette', areaSquareMeters: 900 }),
    ]);

    expect(rankOf(groups[0] as (typeof groups)[number])).toBe(0);
  });

  it('lässt die Reihenfolge nach Entfernung unangetastet', () => {
    const groups = groupPois([
      poi({ id: 'node/1', name: 'Fern', distanceToRegionKm: 9 }),
      poi({ id: 'node/2', name: 'Nah', areaSquareMeters: 2000, distanceToRegionKm: 1 }),
    ]);

    expect(sortGroups(groups, 'distance').map((group) => group.label)).toEqual([
      'Nah',
      'Fern',
    ]);
  });

  it('verliert keinen Eintrag', () => {
    const groups = groupPois([
      poi({ id: 'node/1', name: 'A', areaSquareMeters: 5 }),
      poi({ id: 'node/2', name: 'B' }),
      poi({ id: 'node/3', name: 'C', areaSquareMeters: 5000 }),
    ]);

    expect(sortGroups(groups, 'relevance')).toHaveLength(3);
  });
});

describe('Auswahl von Gruppe und Filiale', () => {
  const branches = [
    poi({ id: 'node/1', brand: 'Netto', distanceToRegionKm: 1 }),
    poi({ id: 'node/2', brand: 'Netto', distanceToRegionKm: 2 }),
    poi({ id: 'node/3', brand: 'Netto', distanceToRegionKm: 3 }),
  ];
  const group = () => groupPois(branches)[0] as ReturnType<typeof groupPois>[number];

  it('wählt mit der Kette alle Filialen aus', () => {
    const keys = toggleGroup(group(), new Set());

    expect(groupSelectionOf(group(), keys)).toBe('all');
    expect(branches.every((b) => isPoiSelected(b, keys))).toBe(true);
  });

  it('meldet eine Teilauswahl als "some"', () => {
    const keys = toggleMember(group(), branches[1] as FoundPoi, new Set());

    expect(groupSelectionOf(group(), keys)).toBe('some');
    expect(isPoiSelected(branches[1] as FoundPoi, keys)).toBe(true);
    expect(isPoiSelected(branches[0] as FoundPoi, keys)).toBe(false);
  });

  it('löst die Kette auf, wenn eine Filiale abgewählt wird', () => {
    // Ohne das Aufloesen wuerde das Entfernen einer Filiale die ganze Kette
    // mitnehmen -- der Nutzer verlöre die anderen beiden ungewollt.
    const all = toggleGroup(group(), new Set());
    const keys = toggleMember(group(), branches[0] as FoundPoi, all);

    expect(isPoiSelected(branches[0] as FoundPoi, keys)).toBe(false);
    expect(isPoiSelected(branches[1] as FoundPoi, keys)).toBe(true);
    expect(groupSelectionOf(group(), keys)).toBe('some');
  });

  it('räumt Einzelschlüssel auf, wenn die Kette gewählt wird', () => {
    const partial = toggleMember(group(), branches[0] as FoundPoi, new Set());
    const keys = toggleGroup(group(), partial);

    expect(keys.has(poiKeyOf(branches[0] as FoundPoi))).toBe(false);
    expect(groupSelectionOf(group(), keys)).toBe('all');
  });

  it('nimmt eine vollständige Auswahl komplett zurück', () => {
    const all = toggleGroup(group(), new Set());
    const keys = toggleGroup(group(), all);

    expect(groupSelectionOf(group(), keys)).toBe('none');
    expect(keys.size).toBe(0);
  });

  it('zählt einzeln gewählte Filialen als vollständig, wenn alle drin sind', () => {
    let keys: ReadonlySet<string> = new Set();
    for (const branch of branches) keys = toggleMember(group(), branch, keys);

    expect(groupSelectionOf(group(), keys)).toBe('all');
  });
});
