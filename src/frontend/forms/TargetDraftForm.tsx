import { useState, type FormEvent } from 'react';
import type { GeocodingCandidate } from '../types.js';

export type DraftValues = {
  name: string;
  address: string;
  maxTravelTimeMinutes: number;
};

type TargetDraftFormProps = {
  color: string;
  busy: boolean;
  error: string | null;
  candidates: GeocodingCandidate[];
  onConfirm: (values: DraftValues) => void;
  onPickCandidate: (candidate: GeocodingCandidate) => void;
  onCancel: () => void;
};

/**
 * Entwurf eines Ziels. Löst **nur** bei Enter bzw. Klick auf "Uebernehmen"
 * eine Anfrage aus -- nie beim Tippen (Spec 10).
 */
export const TargetDraftForm = ({
  color,
  busy,
  error,
  candidates,
  onConfirm,
  onPickCandidate,
  onCancel,
}: TargetDraftFormProps) => {
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [minutes, setMinutes] = useState('30');

  const parsedMinutes = Number.parseInt(minutes, 10);
  const isValid =
    name.trim().length > 0 &&
    address.trim().length > 0 &&
    Number.isInteger(parsedMinutes) &&
    parsedMinutes > 0;

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!isValid || busy) return;
    onConfirm({
      name: name.trim(),
      address: address.trim(),
      maxTravelTimeMinutes: parsedMinutes,
    });
  };

  return (
    <form className="card card--draft" onSubmit={handleSubmit}>
      <div className="card__head">
        <span className="dot" style={{ background: color }} />
        <strong>Neues Ziel</strong>
      </div>

      <label>
        Name
        <input
          autoFocus
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Eltern A"
          disabled={busy}
        />
      </label>

      <label>
        Ort / Adresse
        <input
          value={address}
          onChange={(event) => setAddress(event.target.value)}
          placeholder="Münster"
          disabled={busy}
        />
      </label>

      <label>
        Max. Fahrzeit (Minuten)
        <input
          type="number"
          min={1}
          max={120}
          value={minutes}
          onChange={(event) => setMinutes(event.target.value)}
          disabled={busy}
        />
      </label>

      {candidates.length > 0 && (
        <div className="candidates">
          <p className="candidates__hint">Welchen Ort meinst du?</p>
          {candidates.map((candidate) => (
            <button
              key={`${candidate.label}-${candidate.coordinate.latitude}`}
              type="button"
              className="candidate"
              onClick={() => onPickCandidate(candidate)}
              disabled={busy}
            >
              {candidate.label}
            </button>
          ))}
        </div>
      )}

      {error !== null && <p className="error">{error}</p>}

      <div className="card__actions">
        <button type="submit" disabled={!isValid || busy}>
          {busy ? 'Berechne…' : 'Übernehmen (Enter)'}
        </button>
        <button type="button" className="ghost" onClick={onCancel} disabled={busy}>
          Abbrechen
        </button>
      </div>
    </form>
  );
};
