import { describe, expect, it } from 'vitest';
import { unionBounds } from '../src/frontend/bounds.js';
import type { BoundingBox } from '../src/frontend/types.js';

describe('unionBounds', () => {
  it('liefert null ohne Boxen', () => {
    expect(unionBounds([])).toBeNull();
  });

  it('liefert null wenn alle Boxen fehlen', () => {
    expect(unionBounds([null, null])).toBeNull();
  });

  it('gibt eine einzelne Box unveraendert zurueck', () => {
    const box: BoundingBox = [7, 51, 8, 52];
    expect(unionBounds([box])).toEqual(box);
  });

  it('umfasst mehrere Boxen', () => {
    const a: BoundingBox = [7.1, 51.5, 7.9, 52.2];
    const b: BoundingBox = [6.9, 51.2, 7.8, 51.8];
    expect(unionBounds([a, b])).toEqual([6.9, 51.2, 7.9, 52.2]);
  });

  it('ignoriert fehlende Boxen zwischen vorhandenen', () => {
    const a: BoundingBox = [7, 51, 8, 52];
    const b: BoundingBox = [9, 53, 10, 54];
    expect(unionBounds([a, null, b])).toEqual([7, 51, 10, 54]);
  });
});
