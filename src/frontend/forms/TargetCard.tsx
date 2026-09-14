import { useState, type FormEvent } from 'react';
import {
  TRAVEL_MODES,
  type GeocodingCandidate,
  type Target,
  type TravelMode,
} from '../types.js';
import { useTexts } from '../i18n/index.js';
import { Select, type SelectOption } from '../components/Select.js';
import { NumberField } from '../components/NumberField.js';
import { CheckIcon, CloseIcon, EyeIcon, PencilIcon } from '../components/icons.js';

/** Was am Ziel geändert werden kann, ohne die Kopfzeile zu bedienen. */
export type TargetEditValues = { name: string; address: string };

/**
 * Der laufende Bearbeitungsvorgang. `null` heisst: Die Karte zeigt ihre
 * Adresse, kein Formular. Der Zustand liegt in `App`, weil immer nur **ein**
 * Ziel bearbeitet wird und die Adressvorschläge vom selben Aufruf kommen wie
 * beim Anlegen.
 */
export type TargetEdit = {
  busy: boolean;
  error: string | null;
  candidates: GeocodingCandidate[];
};

type TargetCardProps = {
  target: Target;
  maxMinutes: number;
  edit: TargetEdit | null;
  onRemove: (id: string) => void;
  onChangeMinutes: (id: string, minutes: number) => void;
  onChangeTravelMode: (id: string, mode: TravelMode) => void;
  onToggleVisible: (id: string) => void;
  onRetry: (id: string) => void;
  onStartEdit: (id: string) => void;
  onCancelEdit: () => void;
  onSubmitEdit: (id: string, values: TargetEditValues) => void;
  onPickEditCandidate: (candidate: GeocodingCandidate) => void;
};

/** Ein bereits bestätigtes Ziel. Änderungen werden ebenfalls bestätigt. */
export const TargetCard = ({
  target,
  maxMinutes,
  edit,
  onRemove,
  onChangeMinutes,
  onChangeTravelMode,
  onToggleVisible,
  onRetry,
  onStartEdit,
  onCancelEdit,
  onSubmitEdit,
  onPickEditCandidate,
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

      {edit !== null ? (
        /*
          Das Formular ersetzt die Adresszeile, die Kopfzeile bleibt stehen:
          Dort steht der *gespeicherte* Name, im Feld der getippte -- und
          Verkehrsmittel und Zeit bleiben nebenbei bedienbar.

          Frisch eingehängt, sobald die Bearbeitung beginnt; dadurch stehen die
          Felder ohne Nachführen auf dem aktuellen Stand des Ziels.
        */
        <TargetEditFields
          target={target}
          edit={edit}
          onSubmit={(values) => onSubmitEdit(target.id, values)}
          onCancel={onCancelEdit}
          onPickCandidate={onPickEditCandidate}
        />
      ) : (
        /*
          Kein "· ausgeblendet" mehr hinter der Adresse: Das durchgestrichene
          Auge daneben sagt dasselbe, und der Zusatz brach die Zeile bei langen
          Adressen um -- die Karte wurde dadurch je nach Adresse höher.

          Der Stift steht hier und nicht in der Kopfzeile: Dort teilen sich
          Name, Verkehrsmittel, Zeit, Haken, Auge und × schon 293 px, und nur
          der Name kann schrumpfen -- gemessen blieben ihm mit einem vierten
          Zeichen noch 25,8 px für die 41 px von "Arbeit", also "A…". Diese
          Zeile ist dagegen fast leer, und sie zeigt genau das, was der Stift
          ändert.
        */
        <div className="card__address">
          <span>{target.resolvedLabel ?? target.address}</span>
          <button
            type="button"
            className="card__edit"
            onClick={() => onStartEdit(target.id)}
            aria-label={texts.target.editLabel(target.name)}
            data-tip={texts.target.editTitle}
            disabled={target.status === 'loading'}
          >
            <PencilIcon />
          </button>
        </div>
      )}

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

type TargetEditFieldsProps = {
  target: Target;
  edit: TargetEdit;
  onSubmit: (values: TargetEditValues) => void;
  onCancel: () => void;
  onPickCandidate: (candidate: GeocodingCandidate) => void;
};

/**
 * Die beiden Felder, die die Kopfzeile nicht bedienen kann. Eigene Komponente,
 * damit sie ihren Anfangsstand beim Einhängen aus dem Ziel nimmt -- ein
 * Nachführen per Effekt überschriebe sonst, was gerade getippt wird.
 */
const TargetEditFields = ({
  target,
  edit,
  onSubmit,
  onCancel,
  onPickCandidate,
}: TargetEditFieldsProps) => {
  const texts = useTexts();
  const [name, setName] = useState(target.name);
  const [address, setAddress] = useState(target.address);

  const valid = name.trim().length > 0 && address.trim().length > 0;

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!valid || edit.busy) return;
    onSubmit({ name: name.trim(), address: address.trim() });
  };

  return (
    <form
      className="card__form"
      onSubmit={handleSubmit}
      // Abbrechen mit Escape: Das Formular liegt mitten in einer Liste, und
      // der Weg zum Knopf führt sonst an jedem Feld darunter vorbei.
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return;
        event.stopPropagation();
        onCancel();
      }}
    >
      <label>
        {texts.target.nameField}
        <input
          autoFocus
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={texts.target.namePlaceholder}
          disabled={edit.busy}
        />
      </label>

      <label>
        {texts.target.addressField}
        <input
          value={address}
          onChange={(event) => setAddress(event.target.value)}
          placeholder={texts.target.addressPlaceholder}
          disabled={edit.busy}
        />
      </label>

      {edit.candidates.length > 0 && (
        <div className="candidates">
          <p className="candidates__hint">{texts.target.whichAddress}</p>
          {edit.candidates.map((candidate) => (
            <button
              key={`${candidate.label}-${candidate.coordinate.latitude}`}
              type="button"
              className="candidate"
              onClick={() => onPickCandidate(candidate)}
              disabled={edit.busy}
            >
              {candidate.label}
            </button>
          ))}
        </div>
      )}

      {edit.error !== null && <p className="error">{edit.error}</p>}

      <div className="card__actions">
        <button type="submit" disabled={!valid || edit.busy}>
          {edit.busy ? texts.target.editSaving : texts.target.editSave}
        </button>
        <button type="button" className="ghost" onClick={onCancel} disabled={edit.busy}>
          {texts.target.cancel}
        </button>
      </div>
    </form>
  );
};
