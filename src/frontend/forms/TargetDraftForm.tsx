import { useState, type FormEvent } from 'react';
import { missesHouseNumber } from '../address.js';
import { TRAVEL_MODES, type GeocodingCandidate, type TravelMode } from '../types.js';
import { useTexts } from '../i18n/index.js';
import { Select, type SelectOption } from '../components/Select.js';
import { NumberField } from '../components/NumberField.js';

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

  // Im Entwurf ist Platz: hier steht überall der volle Name, keine Kurzform.
  const modeOptions: readonly SelectOption<TravelMode>[] = TRAVEL_MODES.map((mode) => ({
    value: mode,
    label: texts.travelModes[mode],
  }));
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

      <span className="field">
        <span className="field__label">{texts.target.travelModeField}</span>
        <Select
          className="select--block"
          value={travelMode}
          options={modeOptions}
          onChange={setTravelMode}
          label={texts.target.travelModeField}
          disabled={busy}
        />
      </span>

      <span className="field">
        <span className="field__label">{texts.target.minutesField(maxMinutes)}</span>
        <NumberField
          className="numfield--block"
          value={minutes}
          onChange={setMinutes}
          min={1}
          max={maxMinutes}
          label={texts.target.minutesField(maxMinutes)}
          disabled={busy}
        />
      </span>

      {candidates.length > 0 && (
        <div className="candidates">
          <p className="candidates__hint">
            {missesHouseNumber(address, candidates)
              ? texts.target.noHouseNumber
              : texts.target.whichAddress}
          </p>
          {candidates.map((candidate) => (
            <button
              key={`${candidate.label}-${candidate.coordinate.latitude}`}
              type="button"
              className="candidate"
              onClick={() => onPickCandidate(candidate)}
              disabled={busy}
            >
              {candidate.label}
              {candidate.precision !== 'address' && (
                <span className="candidate__precision">
                  {texts.target.precision[candidate.precision]}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {error !== null && <p className="error">{error}</p>}

      <div className="card__actions">
        <button
          type="submit"
          disabled={!isValid || busy}
          data-tip={texts.target.submitHint}
        >
          {busy ? texts.target.submitting : texts.target.submit}
        </button>
        <button type="button" className="ghost" onClick={onCancel} disabled={busy}>
          {texts.target.cancel}
        </button>
      </div>
    </form>
  );
};
