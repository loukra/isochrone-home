import { useState, type FormEvent } from 'react';
import { TRAVEL_MODES, type GeocodingCandidate, type TravelMode } from '../types.js';
import { useTexts } from '../i18n/index.js';

export type DraftValues = {
  name: string;
  address: string;
  maxTravelTimeMinutes: number;
  travelMode: TravelMode;
};

type TargetDraftFormProps = {
  maxMinutes: number;
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
  maxMinutes,
  color,
  busy,
  error,
  candidates,
  onConfirm,
  onPickCandidate,
  onCancel,
}: TargetDraftFormProps) => {
  const texts = useTexts();
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [minutes, setMinutes] = useState('30');
  const [travelMode, setTravelMode] = useState<TravelMode>('driving');

  const parsedMinutes = Number.parseInt(minutes, 10);
  const isValid =
    name.trim().length > 0 &&
    address.trim().length > 0 &&
    Number.isInteger(parsedMinutes) &&
    parsedMinutes > 0 &&
    parsedMinutes <= maxMinutes;

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!isValid || busy) return;
    onConfirm({
      name: name.trim(),
      address: address.trim(),
      maxTravelTimeMinutes: parsedMinutes,
      travelMode,
    });
  };

  return (
    <form className="card card--draft" onSubmit={handleSubmit}>
      <div className="card__head">
        <span className="dot" style={{ background: color }} />
        <strong>{texts.target.heading}</strong>
      </div>

      <label>
        {texts.target.nameField}
        <input
          autoFocus
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={texts.target.namePlaceholder}
          disabled={busy}
        />
      </label>

      <label>
        {texts.target.addressField}
        <input
          value={address}
          onChange={(event) => setAddress(event.target.value)}
          placeholder={texts.target.addressPlaceholder}
          disabled={busy}
        />
      </label>

      <label>
        {texts.target.travelModeField}
        <select
          value={travelMode}
          onChange={(event) => setTravelMode(event.target.value as TravelMode)}
          disabled={busy}
        >
          {TRAVEL_MODES.map((mode) => (
            <option key={mode} value={mode}>
              {texts.travelModes[mode]}
            </option>
          ))}
        </select>
      </label>

      <label>
        {texts.target.minutesField(maxMinutes)}
        <input
          type="number"
          min={1}
          max={maxMinutes}
          value={minutes}
          onChange={(event) => setMinutes(event.target.value)}
          disabled={busy}
        />
      </label>

      {candidates.length > 0 && (
        <div className="candidates">
          <p className="candidates__hint">{texts.target.whichAddress}</p>
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
        <button type="submit" disabled={!isValid || busy} title={texts.target.submitHint}>
          {busy ? texts.target.submitting : texts.target.submit}
        </button>
        <button type="button" className="ghost" onClick={onCancel} disabled={busy}>
          {texts.target.cancel}
        </button>
      </div>
    </form>
  );
};
