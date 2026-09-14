/**
 * Die Symbole der Oberfläche, als Pfade statt als Zeichen.
 *
 * Ein `×` oder ein `▼` ist eine Glyphe der gerade eingesetzten Schrift: Sie
 * fällt je nach System anders aus, sitzt anders auf der Grundlinie und ist
 * mal kräftig, mal dünn. Ein Emoji ist noch schlimmer -- Windows liefert für
 * Flaggen überhaupt keine Glyphe und zeigt stattdessen zwei Buchstaben.
 * Deshalb zeichnet die App ihre Zeichen selbst; dieselbe Entscheidung, die im
 * Projekt schon für das Auge, den Haken und die POI-Symbole galt.
 *
 * Alle Symbole liegen auf einem 20x20-Raster, nehmen ihre Farbe über
 * `currentColor` und tragen `aria-hidden` -- benannt wird der Knopf, nicht
 * sein Bild.
 */

type IconProps = {
  /** Kantenlänge in Pixeln. Die Pfade sind auf 16 gezeichnet. */
  size?: number;
};

const box = (size: number) => ({
  viewBox: '0 0 20 20',
  width: size,
  height: size,
  'aria-hidden': true,
  focusable: false,
} as const);

/** Schliessen / Entfernen. Ersetzt das `×`. */
export const CloseIcon = ({ size = 16 }: IconProps) => (
  <svg {...box(size)}>
    <path
      d="M5.5 5.5 14.5 14.5M14.5 5.5 5.5 14.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
    />
  </svg>
);

/**
 * Aufklapp-Pfeil. Ersetzt `▼` und `►`; gedreht statt ausgetauscht, damit
 * beide Zustände garantiert gleich gross sind.
 */
export const CaretIcon = ({ open, size = 14 }: IconProps & { open: boolean }) => (
  // Die Drehung steht im Stylesheet, nicht hier: Ein Inline-Stil liesse sich
  // von `prefers-reduced-motion` nicht mehr anhalten.
  <svg {...box(size)} className="caret-icon" data-open={open}>
    <path d="M8 5.5 13.5 10 8 14.5Z" fill="currentColor" />
  </svg>
);

/** Der Pfeil im Auswahlfeld. Ein Winkel, kein volles Dreieck. */
export const ChevronIcon = ({ size = 14 }: IconProps) => (
  <svg {...box(size)}>
    <path
      d="m6 8.5 4 4 4-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

/** Haken. Übernehmen, und die Marke am gewählten Eintrag im Auswahlmenü. */
export const CheckIcon = ({ size = 18 }: IconProps) => (
  <svg {...box(size)}>
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

/** Auge auf/zu: Sichtbarkeit eines Ziels auf der Karte. */
export const EyeIcon = ({ open, size = 16 }: IconProps & { open: boolean }) => (
  <svg {...box(size)}>
    <path
      d="M10 4.2c3.6 0 6.6 2.3 8 5.8-1.4 3.5-4.4 5.8-8 5.8S3.4 13.5 2 10c1.4-3.5 4.4-5.8 8-5.8Z"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
    />
    <circle cx="10" cy="10" r="2.6" fill="currentColor" />
    {!open && <path d="M3.6 3.6 16.4 16.4" stroke="currentColor" strokeWidth="1.8" />}
  </svg>
);

/* --- Erscheinungsbild ------------------------------------------------------
   Sonne, Mond und ein halb gefüllter Kreis für „wie das System“. */

export const SunIcon = ({ size = 15 }: IconProps) => (
  <svg {...box(size)}>
    <circle cx="10" cy="10" r="3.6" fill="currentColor" />
    <path
      d="M10 2.2v2M10 15.8v2M2.2 10h2M15.8 10h2M4.5 4.5l1.4 1.4M14.1 14.1l1.4 1.4M15.5 4.5l-1.4 1.4M5.9 14.1l-1.4 1.4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    />
  </svg>
);

export const MoonIcon = ({ size = 15 }: IconProps) => (
  <svg {...box(size)}>
    <path
      d="M16 12.3A6.8 6.8 0 0 1 7.7 4a6.9 6.9 0 1 0 8.3 8.3Z"
      fill="currentColor"
    />
  </svg>
);

/** „Wie das System“: ein Kreis, zur Hälfte gefüllt. */
export const SystemIcon = ({ size = 15 }: IconProps) => (
  <svg {...box(size)}>
    <circle cx="10" cy="10" r="6.6" fill="none" stroke="currentColor" strokeWidth="1.6" />
    <path d="M10 3.4a6.6 6.6 0 0 1 0 13.2Z" fill="currentColor" />
  </svg>
);

/* --- Flaggen ---------------------------------------------------------------
   Als Pfade, nicht als Emoji: Windows kennt für Flaggen-Emoji keine Glyphen
   und zeigte dort bisher „DE“ bzw. „GB“. Das Seitenverhältnis ist auf 5:3
   vereinheitlicht, damit beide Schalter gleich breit sind. */

const flagBox = (size: number) => ({
  viewBox: '0 0 30 18',
  width: Math.round(size * (30 / 18)),
  height: size,
  'aria-hidden': true,
  focusable: false,
} as const);

export const FlagDe = ({ size = 13 }: IconProps) => (
  <svg {...flagBox(size)}>
    <rect width="30" height="6" fill="#000000" />
    <rect y="6" width="30" height="6" fill="#dd0000" />
    <rect y="12" width="30" height="6" fill="#ffce00" />
    <rect
      x="0.4"
      y="0.4"
      width="29.2"
      height="17.2"
      fill="none"
      stroke="currentColor"
      strokeOpacity="0.35"
      strokeWidth="0.8"
    />
  </svg>
);

/**
 * Union Jack, vereinfacht: Bei 13 Pixeln Höhe ist die versetzte Teilung der
 * Diagonalen ohnehin nicht mehr zu sehen, wohl aber das Muster.
 */
export const FlagGb = ({ size = 13 }: IconProps) => (
  <svg {...flagBox(size)}>
    <defs>
      <clipPath id="flag-gb-clip">
        <rect width="30" height="18" />
      </clipPath>
    </defs>
    <g clipPath="url(#flag-gb-clip)">
      <rect width="30" height="18" fill="#012169" />
      <path d="M0 0 30 18M30 0 0 18" stroke="#ffffff" strokeWidth="3.6" />
      <path d="M0 0 30 18M30 0 0 18" stroke="#c8102e" strokeWidth="2" />
      <path d="M15 0v18M0 9h30" stroke="#ffffff" strokeWidth="6" />
      <path d="M15 0v18M0 9h30" stroke="#c8102e" strokeWidth="3.6" />
    </g>
    <rect
      x="0.4"
      y="0.4"
      width="29.2"
      height="17.2"
      fill="none"
      stroke="currentColor"
      strokeOpacity="0.35"
      strokeWidth="0.8"
    />
  </svg>
);
