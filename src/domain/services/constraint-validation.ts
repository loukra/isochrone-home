import {
  MAX_TRAVEL_TIME_MINUTES,
  MIN_TRAVEL_TIME_MINUTES,
  SUPPORTED_TRAVEL_MODES,
  type LocationAnalysisRequest,
  type LocationConstraint,
} from '../models/analysis.js';
import { DomainError } from '../models/errors.js';
import { isValidCoordinate } from '../models/geo.js';

const validateConstraint = (constraint: LocationConstraint): void => {
  if (constraint.name.trim().length === 0) {
    throw new DomainError('INVALID_INPUT', 'Jedes Ziel braucht einen Namen.');
  }

  if (constraint.address.trim().length === 0) {
    throw new DomainError(
      'INVALID_INPUT',
      `Für "${constraint.name}" fehlt der Ort bzw. die Adresse.`,
    );
  }

  const minutes = constraint.maxTravelTimeMinutes;

  if (!Number.isFinite(minutes) || minutes < MIN_TRAVEL_TIME_MINUTES) {
    throw new DomainError(
      'INVALID_INPUT',
      `Die maximale Fahrzeit für "${constraint.name}" muss mindestens ${MIN_TRAVEL_TIME_MINUTES} Minute betragen.`,
    );
  }

  if (minutes > MAX_TRAVEL_TIME_MINUTES) {
    throw new DomainError(
      'INVALID_INPUT',
      `Die maximale Fahrzeit für "${constraint.name}" darf höchstens ${MAX_TRAVEL_TIME_MINUTES} Minuten betragen.`,
    );
  }

  if (!SUPPORTED_TRAVEL_MODES.includes(constraint.travelMode)) {
    throw new DomainError(
      'INVALID_INPUT',
      `Das Verkehrsmittel "${constraint.travelMode}" wird derzeit nicht unterstützt.`,
    );
  }

  if (constraint.coordinate !== undefined && !isValidCoordinate(constraint.coordinate)) {
    throw new DomainError(
      'INVALID_INPUT',
      `Die übergebene Koordinate für "${constraint.name}" ist ungültig.`,
    );
  }
};

export const validateAnalysisRequest = (request: LocationAnalysisRequest): void => {
  if (request.constraints.length === 0) {
    throw new DomainError('INVALID_INPUT', 'Mindestens ein Ziel muss vorhanden sein.');
  }

  const seen = new Set<string>();

  for (const constraint of request.constraints) {
    if (seen.has(constraint.id)) {
      throw new DomainError('INVALID_INPUT', `Doppelte Ziel-ID: ${constraint.id}`);
    }
    seen.add(constraint.id);
    validateConstraint(constraint);
  }
};
