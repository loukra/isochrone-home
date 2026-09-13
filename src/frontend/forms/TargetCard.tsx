import { useState } from 'react';
import type { Target } from '../types.js';

type TargetCardProps = {
  target: Target;
  maxMinutes: number;
  onRemove: (id: string) => void;
  onChangeMinutes: (id: string, minutes: number) => void;
  onRetry: (id: string) => void;
};

/** Ein bereits bestätigtes Ziel. Änderungen werden ebenfalls bestätigt. */
export const TargetCard = ({
  target,
  maxMinutes,
  onRemove,
  onChangeMinutes,
  onRetry,
}: TargetCardProps) => {
  const [minutes, setMinutes] = useState(String(target.maxTravelTimeMinutes));

  const parsed = Number.parseInt(minutes, 10);
  const changed = parsed !== target.maxTravelTimeMinutes;
  const valid = Number.isInteger(parsed) && parsed > 0 && parsed <= maxMinutes;

  return (
    <div className="card">
      <div className="card__head">
        <span className="dot" style={{ background: target.color }} />
        <strong>{target.name}</strong>
        <button
          type="button"
          className="remove"
          onClick={() => onRemove(target.id)}
          aria-label={`${target.name} entfernen`}
        >
          ×
        </button>
      </div>

      <p className="card__address">{target.resolvedLabel ?? target.address}</p>

      <form
        className="card__minutes"
        onSubmit={(event) => {
          event.preventDefault();
          if (!valid || !changed) return;
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
        />
        <span>Minuten</span>
        {changed && valid && (
          <button type="submit" disabled={target.status === 'loading'}>
            Übernehmen
          </button>
        )}
      </form>

      {target.status === 'loading' && <p className="hint">Isochrone wird berechnet…</p>}

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
