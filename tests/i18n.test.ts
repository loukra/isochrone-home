import { describe, expect, it } from 'vitest';
import { de } from '../src/frontend/i18n/de.js';
import { en } from '../src/frontend/i18n/en.js';

/**
 * Der Typ `Texts` erzwingt bereits, dass jede Sprache alle Schlüssel hat. Was
 * er *nicht* prüft: leere Zeichenketten, eine Funktion mit zu wenigen
 * Parametern, und ein vergessener Eintrag in `errors.byCode` -- das ist ein
 * `Record<string, ...>` und nimmt jede Menge an.
 *
 * Genau das sind die Fehler, die beim Übersetzen passieren und in der
 * Oberfläche erst auffallen, wenn ein Nutzer davorsteht.
 */

type Node = Record<string, unknown>;

const walk = (value: unknown, path: string, into: Map<string, string>): void => {
  if (typeof value === 'function') {
    into.set(path, `function/${(value as (...args: unknown[]) => unknown).length}`);
    return;
  }

  if (value !== null && typeof value === 'object') {
    for (const [key, child] of Object.entries(value as Node)) {
      walk(child, path === '' ? key : `${path}.${key}`, into);
    }
    return;
  }

  into.set(path, value === null ? 'null' : typeof value);
};

const shapeOf = (catalogue: unknown): Map<string, string> => {
  const shape = new Map<string, string>();
  walk(catalogue, '', shape);
  return shape;
};

describe('Textkataloge', () => {
  const german = shapeOf(de);
  const english = shapeOf(en);

  it('haben dieselben Schlüssel', () => {
    expect([...english.keys()].sort()).toEqual([...german.keys()].sort());
  });

  it('haben je Schlüssel dieselbe Art und dieselbe Parameterzahl', () => {
    for (const [key, kind] of german) {
      expect(english.get(key), `Schlüssel ${key}`).toBe(kind);
    }
  });

  it('enthalten keine leeren Texte', () => {
    for (const catalogue of [de, en]) {
      for (const [key, value] of shapeOf(catalogue)) {
        if (value === 'string') {
          const text = key
            .split('.')
            .reduce<unknown>((node, part) => (node as Node)[part], catalogue);
          expect(String(text).trim(), `Schlüssel ${key}`).not.toBe('');
        }
      }
    }
  });

  it('übersetzen dieselben Fehlercodes', () => {
    expect(Object.keys(en.errors.byCode).sort()).toEqual(
      Object.keys(de.errors.byCode).sort(),
    );
  });

  it('setzen Platzhalter tatsächlich ein', () => {
    expect(de.target.addressNotFound('Oldenburg')).toContain('Oldenburg');
    expect(en.target.addressNotFound('Oldenburg')).toContain('Oldenburg');
    expect(de.apply.button(3, de.apply.placeMany)).toContain('3');
    expect(en.apply.button(3, en.apply.placeMany)).toContain('3');
  });
});
