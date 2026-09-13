import type { PoiCategory } from '../../domain/models/poi.js';

/**
 * Kategorie -> OSM-Tags. Provider-Wissen, bleibt in der Infrastruktur.
 * Mehrere Ausdrücke pro Kategorie werden verodert.
 *
 * Die Zahlen in den Kommentaren sind am 13.09.2026 in der Referenzregion
 * (Oldenburg und Umland, 53,05–53,25 N / 8,10–8,35 O) gemessen. Sie
 * begründen, warum ein zweiter Ausdruck kein Zierrat ist: Wo ein Tag allein
 * einen nennenswerten Teil der Wirklichkeit verschweigt, fehlen die Orte
 * sonst *unbemerkt*.
 */
export const OSM_FILTERS: Record<PoiCategory, string[]> = {
  gym: ['[leisure=fitness_centre]'],
  supermarket: ['[shop=supermarket]'],
  /**
   * `railway=halt` ist kein Nebenfall: OSM trennt den Bahnhof (mit Weichen)
   * vom Haltepunkt ohne Weichen. In der Referenzregion sind 28 von 69
   * Bahnstationen Haltepunkte -- darunter Ganderkesee, Schierbrok,
   * Oldenburg-Wechloy. Wer zum Pendeln einen Anschluss sucht, meint genau die.
   */
  station: [
    '[railway=station]',
    '[railway=halt]',
    '[public_transport=station][train=yes]',
  ],
  /**
   * Kita und Kindergarten sind in OSM **dasselbe** Tag -- eine eigene
   * Kita-Kategorie neben dem Kindergarten lieferte zweimal dieselbe Liste.
   * `amenity=childcare` ist die Krippe bzw. Kindertagespflege und ein eigener
   * Tag: 22 Orte neben 113 Kindergärten, also keine Handvoll Ausreisser.
   * Zusammen 132 Treffer.
   */
  kindergarten: ['[amenity=kindergarten]', '[amenity=childcare]'],
  /**
   * Grund-, weiterführende und Förderschulen tragen alle `amenity=school`;
   * die Schulform steckt in `isced:level`/`school:DE` und ist zu lückenhaft
   * getaggt, um daraus eigene Kategorien zu machen.
   */
  school: ['[amenity=school]'],
  /**
   * "Schwimmbad" ist in OSM kein einzelner Tag. Hallen- und Freibäder stehen
   * meist als `leisure=sports_centre` + `sport=swimming` (7) oder
   * `leisure=water_park` (3), Thermen als `amenity=public_bath` (1).
   *
   * `leisure=swimming_pool` ist eigentlich das Becken und trifft auch
   * Gartenpools -- ausgeschlossen wird nur, was OSM selbst als privat
   * ausweist (7 von 21). Der Rest bleibt drin: Ein Hallenbad, das nur so
   * getaggt ist, fehlte sonst unbemerkt, während ein Gartenpool sichtbar in
   * der Liste steht und dank der Flächensortierung ganz unten landet.
   *
   * Zusammen 24 Treffer, davon 13 mit Namen (Hallenbad Rastede, Freibad
   * Flötenteich ...). Dass ein Bad mit mehreren Becken mehrfach auftaucht,
   * ist harmlos: Es genügt, *eines* anzuhaken.
   */
  pool: [
    '[leisure=sports_centre][sport~"swimming"]',
    '[leisure=water_park]',
    '[amenity=public_bath]',
    '[leisure=swimming_pool][access!=private]',
  ],
  /**
   * Praxen tragen `amenity=doctors` (148 Treffer). `healthcare=doctor` (141)
   * war in der Referenzregion vollstaendig darin enthalten -- die Vereinigung
   * ergab exakt dieselben 148 -- steht aber fuer Gegenden daneben, in denen
   * nur der healthcare-Schluessel gesetzt ist. Overpass vereinigt ohne
   * Dubletten, der zweite Ausdruck kostet also nichts.
   * `amenity=hospital` bleibt draussen -- ein Krankenhaus ist kein Hausarzt.
   */
  doctor: ['[amenity=doctors]', '[healthcare=doctor]'],
};
