import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

/**
 * Ablagefach im Plattencache. Jeder Typ bringt seine eigene Haltedauer mit --
 * ein Straßennetz altert anders als ein Supermarkt.
 */
export type CacheNamespace = {
  readonly name: string;
  readonly maxAgeMs: number;
};

type Entry<T> = {
  /** Im Klartext mitgeschrieben, damit ein Eintrag von Hand lesbar bleibt. */
  key: string;
  storedAt: number;
  value: T;
};

const TAG = 'location-optimizer-cache';

/**
 * Cache auf der Festplatte, gemeinsam für alle Anfragen und über Neustarts
 * hinweg.
 *
 * Der Cache im Arbeitsspeicher verschwindet bei jedem Neustart -- im
 * Dev-Betrieb also bei jedem Dateispeichern. Damit landet jede Anfrage erneut
 * beim Provider, obwohl sich an Ort und Zeit nichts geändert hat. Genau das
 * verbietet Spec 10.
 *
 * Bewusst Dateien statt Datenbank: Der Cache darf jederzeit gelöscht werden,
 * ohne dass etwas fehlt. Er hält keine Nutzerdaten, nur wiederbeschaffbare
 * Provider-Antworten.
 */
export class FileStore {
  constructor(private readonly directory: string) {}

  async get<T>(namespace: CacheNamespace, key: string): Promise<T | null> {
    const path = this.pathOf(namespace, key);

    let raw: string;

    try {
      raw = await readFile(path, 'utf8');
    } catch {
      return null;
    }

    let entry: Entry<T>;

    try {
      entry = JSON.parse(raw) as Entry<T>;
    } catch {
      // Halb geschriebene oder fremde Datei: wegräumen, neu holen.
      await this.discard(path);
      return null;
    }

    const age = Date.now() - entry.storedAt;

    if (!Number.isFinite(entry.storedAt) || age < 0 || age > namespace.maxAgeMs) {
      // Ein abgelaufener Eintrag wird geloescht, nicht nur uebergangen --
      // sonst waechst der Cache mit Daten, die nie wieder jemand liest.
      await this.discard(path);
      return null;
    }

    return entry.value;
  }

  async set<T>(namespace: CacheNamespace, key: string, value: T): Promise<void> {
    const path = this.pathOf(namespace, key);
    const entry: Entry<T> = { key, storedAt: Date.now(), value };

    try {
      await mkdir(dirname(path), { recursive: true });
      // Erst daneben schreiben, dann umbenennen: Ein Absturz mittendrin
      // hinterlaesst sonst eine halbe Datei, die wie ein Treffer aussieht.
      const temporary = `${path}.${process.pid}.tmp`;
      await writeFile(temporary, JSON.stringify(entry), 'utf8');
      await rename(temporary, path);
    } catch {
      // Ein nicht beschreibbarer Cache ist ein Tempoproblem, kein Fehler.
    }
  }

  private async discard(path: string): Promise<void> {
    try {
      await rm(path, { force: true });
    } catch {
      // bewusst ignoriert
    }
  }

  /**
   * Der Schlüssel wird gehasht, weil er Kommas, Schrägstriche und Umlaute
   * enthalten kann -- als Dateiname wäre das ein Minenfeld.
   */
  private pathOf(namespace: CacheNamespace, key: string): string {
    const hash = createHash('sha1')
      .update(`${TAG}|${namespace.name}|${key}`)
      .digest('hex');
    return join(this.directory, namespace.name, `${hash}.json`);
  }
}
