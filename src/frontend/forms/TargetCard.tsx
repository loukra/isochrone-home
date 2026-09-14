import { useState } from 'react';
import { TRAVEL_MODES, type Target, type TravelMode } from '../types.js';
import { useTexts } from '../i18n/index.js';
import { Select, type SelectOption } from '../components/Select.js';
import { NumberField } from '../components/NumberField.js';
import { CheckIcon, CloseIcon, EyeIcon } from '../components/icons.js';

type TargetCardProps = {
  target: Target;
  maxMinutes: number;
  onRemove: (id: string) => void;
  onChangeMinutes: (id: string, minutes: number) => void;
  onChangeTravelMode: (id: string, mode: TravelMode) => void;
  onToggleVisible: (id: string) => void;
  onRetry: (id: string) => void;
};

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
  const texts = useTexts();
  const [minutes, setMinutes] = useState(String(target.maxTravelTimeMinutes));

  const parsed = Number.parseInt(minutes, 10);
  const changed = parsed !== target.maxTravelTimeMinutes;
  const valid = Number.isInteger(parsed) && parsed > 0 && parsed <= maxMinutes;
  const pending = changed && valid;

  const modeOptions: readonly SelectOption<TravelMode>[] = TRAVEL_MODES.map((mode) => ({
    value: mode,
    label: texts.travelModes[mode],
    shortLabel: texts.travelModesShort[mode],
  }));

  return (
    <div className="card">
      <div className="card__head">
        <span className="dot" style={{ background: target.color }} />
        <strong>{target.name}</strong>

        {/*
          Kurzform im Knopf ("Rad"), voller Name im Menü ("Fahrrad"): In der
          Kopfzeile stehen daneben noch Name, Zeit, Auge und ×, im Menü ist
          Platz. Der zugängliche Name nennt ohnehin die lange Fassung.
        */}
        <Select
          className="card__mode select--compact"
          value={target.travelMode}
          options={modeOptions}
          onChange={(mode) => onChangeTravelMode(target.id, mode)}
          label={texts.target.travelModeLabel(target.name)}
          title={texts.travelModes[target.travelMode]}
          disabled={target.status === 'loading'}
        />

        <form
          className="card__minutes"
          onSubmit={(event) => {
            event.preventDefault();
            if (!pending) return;
            onChangeMinutes(target.id, parsed);
          }}
        >
          <NumberField
            className="numfield--narrow"
            value={minutes}
            onChange={setMinutes}
            min={1}
            max={maxMinutes}
            label={texts.target.minutesLabel(target.name)}
            disabled={target.status === 'loading'}
          />
          <span>{texts.target.minutesUnit}</span>
          {/* Immer da, nur unsichtbar, wenn es nichts zu übernehmen gibt: Ein
              erst beim Tippen erscheinender Knopf schöbe die ganze Kopfzeile
              nach links -- unter dem Zeiger weg, der gerade auf dem Pfeil
              des Zahlenfeldes stand, und auf den Knopf darunter. */}
          <button
            type="submit"
            className={pending ? 'card__apply' : 'card__apply card__apply--idle'}
            disabled={!pending || target.status === 'loading'}
            data-tip={texts.target.applyTitle}
            aria-label={texts.target.applyLabel(target.name)}
          >
            <CheckIcon />
          </button>
        </form>

        <button
          type="button"
          className={target.visible ? 'card__eye' : 'card__eye card__eye--off'}
          onClick={() => onToggleVisible(target.id)}
          aria-pressed={!target.visible}
          aria-label={
            target.visible
              ? texts.target.hideLabel(target.name)
              : texts.target.showLabel(target.name)
          }
          data-tip={target.visible ? texts.target.hideTitle : texts.target.showTitle}
        >
          <EyeIcon open={target.visible} />
        </button>

        <button
          type="button"
          className="remove"
          onClick={() => onRemove(target.id)}
          aria-label={texts.target.removeLabel(target.name)}
        >
          <CloseIcon />
        </button>
      </div>

      {/*
        Kein "· ausgeblendet" mehr hinter der Adresse: Das durchgestrichene
        Auge daneben sagt dasselbe, und der Zusatz brach die Zeile bei langen
        Adressen um -- die Karte wurde dadurch je nach Adresse höher.
      */}
      <p className="card__address">{target.resolvedLabel ?? target.address}</p>

      {target.status === 'loading' && (
        <p className="hint">
          {texts.target.computing(texts.travelModes[target.travelMode])}
        </p>
      )}

      {target.status === 'error' && (
        <p className="error">
          {target.error}{' '}
          <button type="button" className="link" onClick={() => onRetry(target.id)}>
            {texts.target.retry}
          </button>
        </p>
      )}
    </div>
  );
};
