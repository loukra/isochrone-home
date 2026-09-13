import { describe, expect, it } from 'vitest';
import { validateAnalysisRequest } from '../src/domain/services/constraint-validation.js';
import { TRAVEL_MODES, type TravelMode } from '../src/domain/models/analysis.js';
import { DomainError } from '../src/domain/models/errors.js';
import { constraint } from './helpers/fixtures.js';

const expectInvalid = (request: Parameters<typeof validateAnalysisRequest>[0]) => {
  try {
    validateAnalysisRequest(request);
  } catch (error) {
    expect(error).toBeInstanceOf(DomainError);
    expect((error as DomainError).code).toBe('INVALID_INPUT');
    return;
  }
  throw new Error('Erwartete einen DomainError, es wurde keiner geworfen.');
};

describe('validateAnalysisRequest', () => {
  it('akzeptiert ein gültiges Ziel', () => {
    expect(() =>
      validateAnalysisRequest({ constraints: [constraint('a')] }),
    ).not.toThrow();
  });

  it('lehnt eine leere Zielliste ab', () => {
    expectInvalid({ constraints: [] });
  });

  it('lehnt eine Fahrzeit von 0 ab', () => {
    expectInvalid({ constraints: [constraint('a', { maxTravelTimeMinutes: 0 })] });
  });

  it('lehnt eine negative Fahrzeit ab', () => {
    expectInvalid({ constraints: [constraint('a', { maxTravelTimeMinutes: -5 })] });
  });

  it('lehnt eine zu grosse Fahrzeit ab', () => {
    expectInvalid({ constraints: [constraint('a', { maxTravelTimeMinutes: 5000 })] });
  });

  it('lehnt einen leeren Ort ab', () => {
    expectInvalid({ constraints: [constraint('a', { address: '   ' })] });
  });

  it('lehnt einen leeren Namen ab', () => {
    expectInvalid({ constraints: [constraint('a', { name: '' })] });
  });

  it('lehnt doppelte IDs ab', () => {
    expectInvalid({ constraints: [constraint('a'), constraint('a')] });
  });

  it('akzeptiert jedes unterstützte Verkehrsmittel', () => {
    for (const travelMode of TRAVEL_MODES) {
      expect(() =>
        validateAnalysisRequest({ constraints: [constraint('a', { travelMode })] }),
      ).not.toThrow();
    }
  });

  it('lehnt ein nicht unterstütztes Verkehrsmittel ab', () => {
    // Kommt so nur aus einer veralteten oder manipulierten Anfrage.
    expectInvalid({
      constraints: [constraint('a', { travelMode: 'teleport' as TravelMode })],
    });
  });

  it('lehnt eine ungültige Koordinate ab', () => {
    expectInvalid({
      constraints: [constraint('a', { coordinate: { latitude: 999, longitude: 0 } })],
    });
  });
});
