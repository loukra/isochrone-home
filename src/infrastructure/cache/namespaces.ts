import type { CacheNamespace } from './file-store.js';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/**
 * Haltedauer je Datentyp. Die Zahlen sind keine Geschmacksfrage, sondern
 * folgen daraus, wie schnell die jeweilige Wirklichkeit altert.
 */
export const cacheNamespaces = (config: {
  isochroneDays: number;
  poiHours: number;
  geocodeDays: number;
  routeDays: number;
}): {
  isochrones: CacheNamespace;
  pois: CacheNamespace;
  geocoding: CacheNamespace;
  routes: CacheNamespace;
} => ({
  /**
   * Isochronen: Straßennetze ändern sich in Monaten, und ORS baut seinen
   * Routing-Graphen periodisch neu -- dieselbe Anfrage liefert danach ein
   * anderes Polygon. Eine Woche begrenzt den Irrtum und kostet bei fünf Zielen
   * fünf Anfragen pro Woche.
   *
   * Der Name trägt die Glättung (siehe SMOOTHING im ORS-Adapter). Ohne sie
   * blieben die Schlüssel aus lat, lon, Verkehrsmittel und Minuten gleich,
   * zeigten aber auf Flächen, die noch mit der Vorgabe des Dienstes gerechnet
   * wurden: Eine Woche lang läge eine Mischung aus altem und neuem Umriss in
   * derselben Schnittmenge -- unsichtbar falsch, genau der Fall, gegen den es
   * die Haltedauer überhaupt gibt.
   */
  isochrones: { name: 'isochrones-s0', maxAgeMs: config.isochroneDays * DAY },

  /**
   * Orte: Studios und Supermärkte machen tatsächlich auf und zu. Ein Tag ist
   * kurz genug, dass eine Neueröffnung auftaucht, und lang genug, dass eine
   * Suchsitzung den öffentlichen Overpass-Server nicht mehrfach belastet.
   */
  pois: { name: 'pois', maxAgeMs: config.poiHours * HOUR },

  /**
   * Adressen: Ein Ort bleibt, wo er ist. Hier geht es nur darum, dass die
   * Datenbasis des Geocoders gelegentlich korrigiert wird.
   *
   * Der Namensraum trägt die Fassung des Adapters, aus demselben Grund wie die
   * Glättung bei den Isochronen: Die Schlüssel sind die Eingaben des Nutzers
   * und ändern sich nicht, die abgelegten Bezeichnungen und die zweite,
   * strukturierte Anfrage schon. Ohne den Wechsel stünde dreißig Tage lang
   * "NI, Germany" neben frisch gesetzten deutschen Bezeichnungen -- und der
   * Ortsteil-Zentroid, gegen den die Nachfrage gebaut ist, käme weiter aus
   * der Platte.
   */
  geocoding: { name: 'geocoding-v2', maxAgeMs: config.geocodeDays * DAY },

  /**
   * Fahrzeiten: dieselbe Wirklichkeit wie bei den Isochronen -- beide beruhen
   * auf demselben Routing-Graphen und veralten deshalb im selben Takt. Die
   * Tageszeit steckt bewusst nicht im Schlüssel: ORS rechnet ohne Verkehrslage,
   * eine Messung um acht Uhr ergibt dasselbe wie eine um drei.
   */
  routes: { name: 'routes', maxAgeMs: config.routeDays * DAY },
});
