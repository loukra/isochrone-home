import type { PoiCategory } from '../types.js';
import { useTexts } from '../i18n/index.js';

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
  const texts = useTexts();
  const unit = selectedPlaces === 1 ? texts.apply.placeOne : texts.apply.placeMany;

  return (
    <div className="poi-apply">
      {error !== null && <p className="error">{error}</p>}

      {selectedPlaces > MAX_PLACES && (
        <p className="error">{texts.apply.tooMany(selectedPlaces, MAX_PLACES)}</p>
      )}

      {regionEmpty && (
        <p className="error">
          {texts.apply.regionEmpty}
          {blocking.length > 0
            ? texts.apply.blockedBy(
                blocking.map((category) => texts.categories[category]).join(', '),
              )
            : texts.apply.blockedByCombination}
        </p>
      )}

      <button
        type="button"
        className="primary"
        onClick={onApply}
        disabled={busy || disabled || selectedPlaces > MAX_PLACES}
      >
        {busy
          ? texts.apply.busy(selectedPlaces, unit)
          : texts.apply.button(selectedPlaces, unit)}
      </button>

      {/*
        Eine Zeile, immer -- der Knopf soll nicht auf und ab wandern, nur weil
        sich der Grund aendert, warum gerade nichts zu tun ist.
      */}
      <p className="hint poi-apply__note">
        {selectedPlaces === 0
          ? texts.apply.nothingSelected
          : upToDate && !busy
            ? texts.apply.upToDate
            : texts.apply.selected(selectedPlaces, unit)}
      </p>
    </div>
  );
};
