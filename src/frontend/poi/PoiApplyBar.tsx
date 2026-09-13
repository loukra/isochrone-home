import { CATEGORY_LABELS } from './PoiConditionCard.js';
import type { PoiCategory } from '../types.js';

/** Serverseitige Obergrenze aus poiRegionRequestSchema. */
export const MAX_PLACES = 25;

type PoiApplyBarProps = {
  busy: boolean;
  /** Nichts zu rechnen -- alles steht auf dem aktuellen Stand. */
  upToDate: boolean;
  /** Zusaetzlich gesperrt (kein Ziel bereit, laeuft schon). */
  disabled: boolean;
  error: string | null;
  /** Bedingungen, die für sich allein nichts übrig lassen. */
  blocking: PoiCategory[];
  /** Einzelne Orte hinter der Auswahl -- jeder kostet einen Isochronen-Call. */
  selectedPlaces: number;
  /** "Übernehmen" lief und hat keine gemeinsame Fläche ergeben. */
  regionEmpty: boolean;
  onApply: () => void;
};

/**
 * Der einzige Knopf der App -- und er steht genau dort, wo etwas kostet:
 * Jeder *neu* angehakte Ort ist eine echte Isochrone beim Provider. Alles
 * Kostenlose (Schnittmenge, Ortssuche) laeuft von allein, sonst waere der
 * Knopf eine Frage, deren Antwort immer "ja" lautet.
 *
 * Er sitzt unten angedockt, nicht am Ende der Liste: Bei drei Bedingungen mit
 * je achtzig Treffern lag er sonst hunderte Pixel unter dem sichtbaren Rand --
 * man hakte oben etwas an und musste zum Einloesen erst scrollen.
 */
export const PoiApplyBar = ({
  busy,
  upToDate,
  disabled,
  error,
  blocking,
  selectedPlaces,
  regionEmpty,
  onApply,
}: PoiApplyBarProps) => {
  const orte = selectedPlaces === 1 ? 'Ort' : 'Orte';

  return (
    <div className="poi-apply">
      {error !== null && <p className="error">{error}</p>}

      {selectedPlaces > MAX_PLACES && (
        <p className="error">
          {selectedPlaces} Orte ausgewählt — höchstens {MAX_PLACES} auf einmal. Nimm ein
          paar Häkchen heraus.
        </p>
      )}

      {regionEmpty && (
        <p className="error">
          Kein Bereich erfüllt alle Bedingungen gleichzeitig.
          {blocking.length > 0
            ? ` Schuld ist: ${blocking.map((category) => CATEGORY_LABELS[category]).join(', ')}.`
            : ' Jede Bedingung für sich passt — erst die Kombination ist zu streng.'}
        </p>
      )}

      <button
        type="button"
        className="primary"
        onClick={onApply}
        disabled={busy || disabled || selectedPlaces > MAX_PLACES}
      >
        {busy
          ? `Berechne ${selectedPlaces} ${orte}…`
          : `Erreichbarkeit berechnen (${selectedPlaces} ${orte})`}
      </button>

      {/*
        Eine Zeile, immer -- der Knopf soll nicht auf und ab wandern, nur weil
        sich der Grund aendert, warum gerade nichts zu tun ist.
      */}
      <p className="hint poi-apply__note">
        {selectedPlaces === 0
          ? 'Noch nichts ausgewählt — die Bedingungen sind inaktiv.'
          : upToDate && !busy
            ? 'Die verengte Region ist auf dem aktuellen Stand.'
            : `${selectedPlaces} ${orte} angehakt.`}
      </p>
    </div>
  );
};
