import type { FoundPoi, PoiCategory } from '../types.js';

/**
 * Schlüssel der Gruppe, zu der ein Ort gehört.
 *
 * Filialen einer Kette teilen sich einen Schlüssel: Wer "McFit" auswählt,
 * meint alle McFit -- auch die in einer Region, die er noch nicht gesucht hat.
 * Nur etwa die Hälfte der Studios trägt ein brand-Tag; für die übrigen ist der
 * Name der einzige Bezug, der über eine Region hinaus trägt. Erst wenn auch der
 * fehlt, hängt die Auswahl an der OSM-ID -- und gilt dann nur für diesen Ort.
 */
/**
 * Kategorien, in denen eine Kette austauschbar ist: Wer McFit will, meint jede
 * Filiale. Ein Bahnhof ist dagegen an seinen Ort gebunden -- und trägt in OSM
 * häufig `operator=Deutsche Bahn`, was sonst *alle* Bahnhöfe zu einer einzigen
 * Zeile zusammenfassen würde.
 */
const CHAIN_CATEGORIES: ReadonlySet<PoiCategory> = new Set<PoiCategory>([
  'gym',
  'supermarket',
]);

/**
 * Beschriftung einer Zeile. Bei Ketten benennt die Marke die Gruppe besser als
 * der Name einer Filiale -- bei ortsgebundenen Zielen ist es umgekehrt: Dort
 * steht im brand/operator der Betreiber ("DB InfraGO AG"), und der sagt nichts
 * darüber, welcher Bahnhof gemeint ist.
 */
export const labelOf = (poi: {
  category: PoiCategory;
  brand: string | null;
  name: string | null;
}): string | null =>
  CHAIN_CATEGORIES.has(poi.category) ? (poi.brand?.trim() || poi.name) : poi.name;

export const groupKeyOf = (poi: {
  category: PoiCategory;
  brand: string | null;
  name: string | null;
  id: string;
}): string => {
  if (!CHAIN_CATEGORIES.has(poi.category)) return `poi:${poi.id}`;

  // Marke und Name teilen sich bewusst einen Namensraum: In Oldenburg traegt
  // eine clever-fit-Filiale ein brand-Tag, die naechste nur den Namen. Mit
  // getrennten Praefixen stuenden sie als zwei Ketten in der Liste.
  const label = normalizeLabel(poi.brand ?? '') || normalizeLabel(poi.name ?? '');

  // Ohne Marke und ohne Namen bleibt nur die OSM-Kennung: Namenlose Orte
  // dürfen nicht zu einer Kette zusammengefasst werden.
  if (label.length > 0) return `place:${label}`;

  return `poi:${poi.id}`;
};

export const normalizeLabel = (label: string): string =>
  label
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .normalize('NFKD')
    .replace(/[^a-z0-9]/g, '');

export type PoiGroup = {
  key: string;
  /** `null` bei Orten ohne Namen -- die Oberfläche setzt den Text ein. */
  label: string | null;
  /** Nach Entfernung sortiert; das nächste zuerst. */
  members: FoundPoi[];
  isBrand: boolean;
};

/** Fasst Filialen derselben Kette zu einer Zeile zusammen. */
export const groupPois = (pois: FoundPoi[]): PoiGroup[] => {
  const groups = new Map<string, PoiGroup>();

  for (const poi of pois) {
    const key = groupKeyOf(poi);
    const existing = groups.get(key);

    if (existing === undefined) {
      groups.set(key, {
        key,
        label: labelOf(poi),
        members: [poi],
        isBrand: CHAIN_CATEGORIES.has(poi.category) && poi.brand !== null,
      });
    } else {
      existing.members.push(poi);

      // Eine Marke benennt die Gruppe besser als der Name einer Filiale.
      if (!existing.isBrand && CHAIN_CATEGORIES.has(poi.category) && poi.brand !== null) {
        existing.label = poi.brand.trim();
        existing.isBrand = true;
      }
    }
  }

  for (const group of groups.values()) {
    group.members.sort((a, b) => a.distanceToRegionKm - b.distanceToRegionKm);
  }

  return [...groups.values()].sort(
    (a, b) =>
      (a.members[0]?.distanceToRegionKm ?? 0) - (b.members[0]?.distanceToRegionKm ?? 0),
  );
};

export type PoiSortMode = 'relevance' | 'distance';

/**
 * Ab dieser Grundfläche ist ein Studio sicher kein Hinterhofraum. Der Wert
 * stammt aus den Oldenburger Daten: dort trennen sich die bekannten Ketten
 * sauber bei rund 590 m² von den Kleinststudios.
 */
export const LARGE_AREA_SQM = 600;

/** Darunter passt keine nennenswerte Geräteauswahl hinein. */
export const SMALL_AREA_SQM = 300;

/** Grösste Filiale der Gruppe; null, wenn OSM für keine eine Fläche kennt. */
export const largestAreaOf = (group: PoiGroup): number | null => {
  let largest: number | null = null;

  for (const member of group.members) {
    const area = member.areaSquareMeters;
    if (area === null) continue;
    if (largest === null || area > largest) largest = area;
  }

  return largest;
};

/**
 * Rang, **kein** Filter: Nichts verschwindet, es steht nur weiter unten.
 *
 * 0 grosse Fläche — der einzige harte Beleg für Grösse, den OSM hergibt.
 * 1 Kette (Marke oder mehrere Filialen) — meist gross, aber ohne Beleg.
 * 2 unbekannt — OSM kennt weder Fläche noch Marke; kann alles sein.
 * 3 belegt klein — eine gemessene Fläche unter {@link SMALL_AREA_SQM} ist die
 *   einzige Aussage, die ein Studio sicher ausschliesst.
 */
export const rankOf = (group: PoiGroup): number => {
  const area = largestAreaOf(group);

  if (area !== null && area >= LARGE_AREA_SQM) return 0;
  if (group.isBrand || group.members.length > 1) return 1;
  if (area !== null && area < SMALL_AREA_SQM) return 3;
  return 2;
};

const nearestKm = (group: PoiGroup): number =>
  group.members[0]?.distanceToRegionKm ?? Infinity;

const withinRank = (rank: number, a: PoiGroup, b: PoiGroup): number => {
  if (rank === 0) return (largestAreaOf(b) ?? 0) - (largestAreaOf(a) ?? 0);

  if (rank === 1) {
    // Mehr Filialen sind ein stärkeres Kettenindiz als eine kurze Anfahrt.
    const byBranches = b.members.length - a.members.length;
    if (byBranches !== 0) return byBranches;
  }

  return nearestKm(a) - nearestKm(b);
};

/**
 * Bringt brauchbare Treffer nach oben. `distance` liefert die Reihenfolge aus
 * {@link groupPois} unverändert zurück -- die ist bereits nach Entfernung.
 */
export const sortGroups = (groups: PoiGroup[], mode: PoiSortMode): PoiGroup[] => {
  if (mode === 'distance') return groups;

  return [...groups].sort((a, b) => {
    const byRank = rankOf(a) - rankOf(b);
    if (byRank !== 0) return byRank;

    const within = withinRank(rankOf(a), a, b);
    if (within !== 0) return within;

    // Stabile Reihenfolge, damit die Liste bei jedem Rendern gleich aussieht.
    return a.key.localeCompare(b.key);
  });
};

/** Schlüssel genau dieses einen Ortes. */
export const poiKeyOf = (poi: { id: string }): string => `poi:${poi.id}`;

/**
 * Ein Ort zählt als gewählt, wenn entweder seine ganze Kette angehakt ist oder
 * er selbst. Beide Schreibweisen stehen nebeneinander im selben Set: Die Kette
 * trägt über Regionsgrenzen hinweg, die Einzelwahl erlaubt Ausnahmen.
 */
export const isPoiSelected = (
  poi: { category: PoiCategory; brand: string | null; name: string | null; id: string },
  keys: ReadonlySet<string>,
): boolean => keys.has(poiKeyOf(poi)) || keys.has(groupKeyOf(poi));

export type GroupSelection = 'none' | 'some' | 'all';

export const groupSelectionOf = (
  group: PoiGroup,
  keys: ReadonlySet<string>,
): GroupSelection => {
  if (keys.has(group.key)) return 'all';

  const chosen = group.members.filter((member) => keys.has(poiKeyOf(member))).length;
  if (chosen === 0) return 'none';
  return chosen === group.members.length ? 'all' : 'some';
};

/** Ganze Kette an- oder abwählen. Teilweise gewählt zählt als "noch nicht ganz". */
export const toggleGroup = (group: PoiGroup, keys: ReadonlySet<string>): Set<string> => {
  const next = new Set(keys);
  const wasComplete = groupSelectionOf(group, keys) === 'all';

  // Einzelmarkierungen dieser Gruppe gehen in der Gruppenentscheidung auf.
  for (const member of group.members) next.delete(poiKeyOf(member));

  if (wasComplete) next.delete(group.key);
  else next.add(group.key);

  return next;
};

/**
 * Eine einzelne Filiale umschalten. Hängt die ganze Kette am Gruppenschlüssel,
 * wird dieser zuerst in Einzelschlüssel aufgelöst -- sonst liesse sich eine
 * Filiale nicht abwählen, ohne alle anderen zu verlieren.
 */
export const toggleMember = (
  group: PoiGroup,
  poi: FoundPoi,
  keys: ReadonlySet<string>,
): Set<string> => {
  const next = new Set(keys);

  if (next.has(group.key)) {
    next.delete(group.key);
    for (const member of group.members) next.add(poiKeyOf(member));
  }

  const key = poiKeyOf(poi);
  if (next.has(key)) next.delete(key);
  else next.add(key);

  return next;
};
