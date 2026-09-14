import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { REGION } from './region.js';

/**
 * Drei Stellungen, nicht zwei -- dieselbe Bauart wie beim Dunkelmodus.
 * "Wie die Region" ist keine dritte Einheit, sondern die Ansage, nicht waehlen
 * zu wollen.
 *
 * Der Schalter ist noetig, weil die Vorgabe nachweislich danebenliegen kann:
 * In der Mac-Huelle meldet die WKWebView bei der Systemeinstellung "englische
 * Sprache, deutsches Land" die Region **GB** statt DE (gemessen am
 * 14.09.2026, siehe `region.ts`). Die Huelle reicht die richtige Region zwar
 * herein, aber eine Vorgabe, die einmal falsch sein konnte, braucht einen Weg,
 * sie zu uebergehen.
 */
export type UnitChoice = 'region' | 'metric' | 'imperial';

/** Was am Ende wirklich in der Zeile steht. */
export type UnitSystem = 'metric' | 'imperial';

export const UNIT_CHOICES: readonly UnitChoice[] = ['region', 'metric', 'imperial'];

/**
 * Eigener Schluessel mit dem alten Praefix -- aus demselben Grund wie bei
 * Sprache, Ausschnitt und Dunkelmodus: Ein Schluessel ist eine Adresse, kein
 * Name.
 *
 * Gespeichert wird die **Wahl**, nicht das Ergebnis: "region" muss "region"
 * bleiben, sonst froere der erste Besuch die gerade geltende Einheit fuer
 * immer ein -- wer umzieht, bekaeme weiter die alte.
 */
const UNIT_KEY = 'location-optimizer:units:v1';

/**
 * Wo Strassenentfernungen in Meilen stehen. Eine kurze Liste, keine Bibliothek:
 * Es sind vier Laender, und sie aendern sich nicht im Takt eines Releases.
 *
 * Grossbritannien gehoert dazu, obwohl es sonst weitgehend metrisch misst --
 * auf Verkehrsschildern stehen dort Meilen, und um Entfernungen geht es hier.
 * Irland dagegen nicht, und genau daran haengt, warum die Einheit an der
 * Region haengen muss und nicht an der Sprache: `en-GB` und `en-IE` sind
 * dieselbe Sprache und verschiedene Einheiten.
 */
const IMPERIAL_REGIONS = new Set(['US', 'GB', 'MM', 'LR']);

/**
 * Die Einheit, die zu einer Region gehoert.
 *
 * Eine unbekannte Region ergibt Kilometer -- die Einheit, die weltweit ueberall
 * ausser in diesen vier Laendern gilt. Raten muss hier in die haeufigere
 * Richtung schiefliegen.
 */
export const unitSystemFor = (region: string | null): UnitSystem =>
  region !== null && IMPERIAL_REGIONS.has(region) ? 'imperial' : 'metric';

const isChoice = (value: unknown): value is UnitChoice =>
  typeof value === 'string' && (UNIT_CHOICES as readonly string[]).includes(value);

const readChoice = (): UnitChoice => {
  try {
    const stored = localStorage.getItem(UNIT_KEY);
    if (isChoice(stored)) return stored;
  } catch {
    // Blockierter Speicher ist kein Fehler, nur keine Erinnerung.
  }

  return 'region';
};

type UnitContextValue = {
  choice: UnitChoice;
  units: UnitSystem;
  setChoice: (choice: UnitChoice) => void;
};

const UnitContext = createContext<UnitContextValue | null>(null);

export const UnitProvider = ({ children }: { children: ReactNode }) => {
  const [choice, setChoiceState] = useState<UnitChoice>(readChoice);

  const setChoice = useCallback((next: UnitChoice) => {
    setChoiceState(next);
    try {
      localStorage.setItem(UNIT_KEY, next);
    } catch {
      // siehe oben
    }
  }, []);

  const units = choice === 'region' ? unitSystemFor(REGION) : choice;

  const value = useMemo<UnitContextValue>(
    () => ({ choice, units, setChoice }),
    [choice, units, setChoice],
  );

  return <UnitContext.Provider value={value}>{children}</UnitContext.Provider>;
};

export const useUnitChoice = (): UnitContextValue => {
  const value = useContext(UnitContext);

  if (value === null) {
    throw new Error('useUnits muss innerhalb von <UnitProvider> aufgerufen werden.');
  }

  return value;
};

/** Nur die Einheit -- der haeufige Fall, ueberall dort, wo etwas angezeigt wird. */
export const useUnits = (): UnitSystem => useUnitChoice().units;

const KM_PER_MILE = 1.609344;

const UNIT_LABEL: Record<UnitSystem, string> = { metric: 'km', imperial: 'mi' };

/**
 * Der Zahlenwert in der Einheit, die angezeigt wird. Getrennt herausgegeben,
 * weil zwei Stellen ihn brauchen: die Formatierung und die Entscheidung, ob
 * ein Ort noch als "in der Region" gilt. Zweimal umzurechnen hiesse, dass die
 * beiden irgendwann auseinanderlaufen.
 */
export const toDisplayUnit = (kilometres: number, units: UnitSystem): number =>
  units === 'imperial' ? kilometres / KM_PER_MILE : kilometres;

/**
 * Entfernung samt Einheit, so wie sie in der Zeile steht.
 *
 * Die Einheit steht bewusst **nicht** in den Textkatalogen: Sie haengt an der
 * Region, die Kataloge haengen an der Sprache, und `en-GB` und `en-IE` sind
 * dieselbe Sprache mit verschiedenen Einheiten. Der Katalog bekommt deshalb
 * die fertige Angabe gereicht ("2,3 km") und setzt nur noch den Satz darum.
 *
 * Das Zahlenformat kommt dagegen sehr wohl aus der Sprache -- im Deutschen
 * 2,3 km, im Englischen 2.3 km.
 */
export const formatDistance = (
  kilometres: number,
  units: UnitSystem,
  locale: string,
  maximumFractionDigits = 1,
): string =>
  `${toDisplayUnit(kilometres, units).toLocaleString(locale, {
    maximumFractionDigits,
  })} ${UNIT_LABEL[units]}`;
