import { useId, type ChangeEvent } from 'react';

type NumberFieldProps = {
  /** Roh, nicht als Zahl: Beim Tippen steht hier zwischendurch auch "" oder "1". */
  value: string;
  onChange: (raw: string) => void;
  min: number;
  max: number;
  label: string;
  disabled?: boolean;
  className?: string;
};

/**
 * Ein Zahlenfeld mit selbstgezeichneten Pfeilen.
 *
 * `input type="number"` behalten wir -- davon kommt die Ziffern-Tastatur auf
 * dem Handy und die Bedienung mit den Pfeiltasten. Was das Betriebssystem
 * beisteuert, sind allein die beiden Pfeilchen am rechten Rand, und die sehen
 * überall anders aus. Also weg damit (`appearance: none` im Stylesheet) und
 * selbst gestellt.
 *
 * Sie stehen **immer** da, nicht erst beim Überfahren: Ein Feld, das unter dem
 * Zeiger die Breite wechselt, schiebt in der Kopfzeile der Zielkarte alles
 * daneben zur Seite -- derselbe Grund, aus dem der Haken zum Übernehmen
 * dauerhaft Platz hält.
 */
export const NumberField = ({
  value,
  onChange,
  min,
  max,
  label,
  disabled = false,
  className,
}: NumberFieldProps) => {
  const id = useId();

  /** Schrittweise ändern. Leeres Feld zählt als Untergrenze, nicht als 0. */
  const step = (delta: number) => {
    const current = Number.parseInt(value, 10);
    const base = Number.isInteger(current) ? current : min;
    const next = Math.max(min, Math.min(max, base + delta));
    onChange(String(next));
  };

  const current = Number.parseInt(value, 10);
  const atMin = Number.isInteger(current) && current <= min;
  const atMax = Number.isInteger(current) && current >= max;

  return (
    <span className={className === undefined ? 'numfield' : `numfield ${className}`}>
      <input
        id={id}
        className="numfield__input"
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={value}
        disabled={disabled}
        aria-label={label}
        onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(event.target.value)}
      />
      {/*
        Die Pfeile sind für die Tastatur unsichtbar: Wer im Feld steht, ändert
        den Wert ohnehin mit den Pfeiltasten, und zwei zusätzliche Stationen im
        Tab-Lauf wären pro Ziel zwei mehr.
      */}
      <span className="numfield__steps" aria-hidden="true">
        <button
          type="button"
          className="numfield__step"
          tabIndex={-1}
          disabled={disabled || atMax}
          onClick={() => step(1)}
        >
          <svg viewBox="0 0 10 6" width="9" height="5" aria-hidden="true" focusable="false">
            <path d="M1 5 5 1l4 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <button
          type="button"
          className="numfield__step"
          tabIndex={-1}
          disabled={disabled || atMin}
          onClick={() => step(-1)}
        >
          <svg viewBox="0 0 10 6" width="9" height="5" aria-hidden="true" focusable="false">
            <path d="M1 1 5 5l4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </span>
    </span>
  );
};
