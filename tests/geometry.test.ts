import { describe, expect, it } from 'vitest';
import { boundsOf, intersectAreas } from '../src/domain/services/geometry.js';
import { square } from './helpers/fixtures.js';

describe('intersectAreas', () => {
  it('gibt bei genau einer Fläche diese Fläche zurück', () => {
    const only = square(0, 0, 10, 10);
    expect(intersectAreas([only])).toBe(only);
  });

  it('schneidet zwei überlappende Flächen', () => {
    const result = intersectAreas([square(0, 0, 10, 10), square(5, 5, 15, 15)]);

    expect(result).not.toBeNull();
    expect(boundsOf([result!])).toEqual([5, 5, 10, 10]);
  });

  it('schneidet mehrere Flächen sukzessive', () => {
    const result = intersectAreas([
      square(0, 0, 10, 10),
      square(2, 2, 12, 12),
      square(4, 4, 14, 14),
    ]);

    expect(result).not.toBeNull();
    expect(boundsOf([result!])).toEqual([4, 4, 10, 10]);
  });

  it('liefert null wenn es keine gemeinsame Fläche gibt', () => {
    expect(intersectAreas([square(0, 0, 5, 5), square(10, 10, 15, 15)])).toBeNull();
  });

  it('liefert null sobald ein Zwischenergebnis leer ist', () => {
    const result = intersectAreas([
      square(0, 0, 5, 5),
      square(10, 10, 15, 15),
      square(0, 0, 20, 20),
    ]);

    expect(result).toBeNull();
  });

  it('liefert null bei leerer Eingabe', () => {
    expect(intersectAreas([])).toBeNull();
  });
});

describe('boundsOf', () => {
  it('umfasst Flächen und Punkte', () => {
    const bounds = boundsOf([square(0, 0, 10, 10)], [{ latitude: 20, longitude: -5 }]);
    expect(bounds).toEqual([-5, 0, 10, 20]);
  });

  it('liefert null ohne Eingaben', () => {
    expect(boundsOf([], [])).toBeNull();
  });
});
