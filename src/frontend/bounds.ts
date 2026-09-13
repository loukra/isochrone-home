import type { BoundingBox } from './types.js';

/**
 * Vereinigt die vom Backend gelieferten Bounding-Boxen, damit die Karte auf
 * alle aktiven Ziele fittet (Spec 9). Reine Min/Max-Arithmetik auf fertigen
 * Boxen -- hier wird keine Geometrie berechnet.
 */
export const unionBounds = (boxes: Array<BoundingBox | null>): BoundingBox | null => {
  const present = boxes.filter((box): box is BoundingBox => box !== null);
  const first = present[0];
  if (first === undefined) return null;

  return present.reduce<BoundingBox>(
    (acc, box) => [
      Math.min(acc[0], box[0]),
      Math.min(acc[1], box[1]),
      Math.max(acc[2], box[2]),
      Math.max(acc[3], box[3]),
    ],
    first,
  );
};
