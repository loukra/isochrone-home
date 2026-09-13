import type { TravelMode } from '../models/analysis.js';
import type { AreaFeature, Coordinate } from '../models/geo.js';

export type IsochroneOptions = {
  travelMode: TravelMode;
  maxTravelTimeMinutes: number;
};

export interface IsochroneProvider {
  calculate(origin: Coordinate, options: IsochroneOptions): Promise<AreaFeature>;
}
