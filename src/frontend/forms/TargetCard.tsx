import { useState } from 'react';
import {
  TRAVEL_MODES,
  TRAVEL_MODE_LABELS,
  TRAVEL_MODE_SHORT,
  type Target,
  type TravelMode,
} from '../types.js';

type TargetCardProps = {
  target: Target;
  maxMinutes: number;
  onRemove: (id: string) => void;
  onChangeMinutes: (id: string, minutes: number) => void;
  onChangeTravelMode: (id: string, mode: TravelMode) => void;
  onToggleVisible: (id: string) => void;
  onRetry: (id: string) => void;
};

/** Auge auf/zu. Inline statt Emoji -- die rendern je nach System anders. */
const EyeIcon = ({ open }: { open: boolean }) => (
  <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
    <path
      d="M10 4.2c3.6 0 6.6 2.3 8 5.8-1.4 3.5-4.4 5.8-8 5.8S3.4 13.5 2 10c1.4-3.5 4.4-5.8 8-5.8Z"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
    />
    <circle cx="10" cy="10" r="2.6" fill="currentColor" />
    {!open && (
      <path d="M3.6 3.6 16.4 16.4" stroke="currentColor" strokeWidth="1.8" />
    )}
  </svg>
);

/** Haken zum Übernehmen. Ebenfalls inline, aus demselben Grund wie das Auge. */
const CheckIcon = () => (
  <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
    <path
      d="m3.5 10.5 4 4 9-9.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

/** Ein bereits bestätigtes Ziel. Änderungen werden ebenfalls bestätigt. */
export const TargetCard = ({
  target,
  maxMinutes,
  onRemove,
  onChangeMinutes,
  onChangeTravelMode,
  onToggleVisible,
  onRetry,
}: TargetCardProps) => {
  const [minutes, setMinutes] = useState(String(target.maxTravelTimeMinutes));

  const parsed = Number.parseInt(minutes, 10);
  const changed = parsed !== target.maxTravelTimeMinutes;
  const valid = Number.isInteger(parsed) && parsed > 0 && parsed <= maxMinutes;
  const pending = changed && valid;

  return (
    <div className="card">
      <div className="card__head">
        <span className="dot" style={{ background: target.color }} />
        <strong>{target.name}</strong>

        <select
          className="card__mode"
          value={target.travelMode}
          onChange={(event) =>
            onChangeTravelMode(target.id, event.target.value as TravelMode)
          }
          disabled={target.status === 'loading'}
          aria-label={`Verkehrsmittel ${target.name}`}
          title={TRAVEL_MODE_LABELS[target.travelMode]}
        >
          {TRAVEL_MODES.map((mode) => (
            <option key={mode} value={mode}>
              {TRAVEL_MODE_SHORT[mode]}
            </option>
          ))}
        </select>

        <form
          className="card__minutes"
          onSubmit={(event) => {
            event.preventDefault();
            if (!pending) return;
            onChangeMinutes(target.id, parsed);
          }}
        >
          <input
            type="number"
            min={1}
            max={maxMinutes}
            value={minutes}
            onChange={(event) => setMinutes(event.target.value)}
            disabled={target.status === 'loading'}
            aria-label={`Reisezeit ${target.name} in Minuten`}
          />
          <span>Min.</span>
          {/* Immer da, nur unsichtbar, wenn es nichts zu übernehmen gibt: Ein
              erst beim Tippen erscheinender Knopf schöbe die ganze Kopfzeile
              nach links -- unter dem Zeiger weg, der eben noch auf dem Pfeil
              des Zahlenfeldes stand, und auf den Knopf darunter. */}
          <button
            type="submit"
            className={pending ? 'card__apply' : 'card__apply card__apply--idle'}
            disabled={!pending || target.status === 'loading'}
            title="Geänderte Reisezeit übernehmen"
            aria-label={`Reisezeit ${target.name} übernehmen`}
          >
            <CheckIcon />
          </button>
        </form>

        <button
          type="button"
          className={target.visible ? 'card__eye' : 'card__eye card__eye--off'}
          onClick={() => onToggleVisible(target.id)}
          aria-pressed={!target.visible}
          aria-label={`Isochrone ${target.name} ${
            target.visible ? 'ausblenden' : 'einblenden'
          }`}
          title={
            target.visible
              ? 'Auf der Karte ausblenden (zählt weiter mit)'
              : 'Wieder einblenden'
          }
        >
          <EyeIcon open={target.visible} />
        </button>

        <button
          type="button"
          className="remove"
          onClick={() => onRemove(target.id)}
          aria-label={`${target.name} entfernen`}
        >
          ×
        </button>
      </div>

      <p className="card__address">
        {target.resolvedLabel ?? target.address}
        {!target.visible && <span className="card__hidden"> · ausgeblendet</span>}
      </p>

      {target.status === 'loading' && (
        <p className="hint">
          Isochrone wird berechnet ({TRAVEL_MODE_LABELS[target.travelMode]})…
        </p>
      )}

      {target.status === 'error' && (
        <p className="error">
          {target.error}{' '}
          <button type="button" className="link" onClick={() => onRetry(target.id)}>
            Erneut versuchen
          </button>
        </p>
      )}
    </div>
  );
};
