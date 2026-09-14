import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { ChevronIcon, CheckIcon } from './icons.js';

export type SelectOption<T extends string> = {
  value: T;
  label: string;
  /**
   * Kürzere Fassung, nur für den Knopf. Gedacht für enge Zeilen wie die
   * Kopfzeile der Zielkarte, in der neben dem Verkehrsmittel noch Name, Zeit,
   * Auge und × stehen: Dort steht "Rad", im aufgeklappten Menü "Fahrrad".
   * Benannt wird immer die lange Fassung.
   */
  shortLabel?: string;
  /** Optionales Bild links vom Text, etwa die Flagge beim Sprachschalter. */
  icon?: ReactNode;
};

type SelectProps<T extends string> = {
  /** `null` heisst "nichts gewählt" -- dann steht `placeholder` im Knopf. */
  value: T | null;
  options: readonly SelectOption<T>[];
  onChange: (value: T) => void;
  /** Zugänglicher Name des Feldes. Pflicht, es gibt kein sichtbares Label. */
  label: string;
  placeholder?: string;
  /** Text der Sprechblase. Landet als `data-tip`, nicht als `title` -- die
      Blase zeichnet die App selbst, siehe TooltipLayer.tsx. */
  title?: string;
  disabled?: boolean;
  className?: string;
  /**
   * `icon` zeigt im Knopf nur das Bild der Auswahl. Gedacht für den
   * Sprachschalter, wo die Flagge steht und der Name im zugänglichen Namen.
   */
  trigger?: 'label' | 'icon';
};

/** Höhe einer Zeile im Menü, für die Schätzung vor dem ersten Messen. */
const ROW_HEIGHT = 30;
const MENU_PADDING = 10;
const GAP = 4;
const EDGE = 8;

type Position = { left: number; width: number } & (
  | { top: number; bottom?: undefined }
  | { bottom: number; top?: undefined }
);

/**
 * Ein Auswahlfeld, das die Seite selbst zeichnet.
 *
 * Ein natives `<select>` lässt sich am Rahmen gestalten, aber das aufgeklappte
 * Menü gehört dem Betriebssystem: andere Schrift, andere Farben, anderer
 * Dunkelmodus. Genau daran war die Oberfläche als fremd zu erkennen. Diese
 * Fassung folgt dem ARIA-Muster "Select-Only Combobox": Der Knopf trägt
 * `role="combobox"`, die Tastaturbedienung bleibt die gewohnte, und der Fokus
 * wandert nicht in die Liste -- die gerade betonte Zeile wird über
 * `aria-activedescendant` benannt.
 *
 * Das Menü hängt an `document.body`, nicht an seinem Feld: Die Seitenleiste
 * scrollt, und ein Menü darin würde an ihrer Kante abgeschnitten. Weil es dann
 * nicht mitscrollt, schliesst es beim Scrollen -- das ist ehrlicher, als es
 * neben seinem Feld stehen zu lassen.
 */
export const Select = <T extends string>({
  value,
  options,
  onChange,
  label,
  placeholder,
  title,
  disabled = false,
  className,
  trigger = 'label',
}: SelectProps<T>) => {
  const id = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<Position | null>(null);

  const selectedIndex = options.findIndex((option) => option.value === value);
  const [activeIndex, setActiveIndex] = useState(0);
  const selected = selectedIndex === -1 ? null : options[selectedIndex];

  /** Setzt das Menü unter das Feld -- oder darüber, wenn unten kein Platz ist. */
  const place = useCallback(() => {
    const button = triggerRef.current;
    if (button === null) return;

    const rect = button.getBoundingClientRect();
    const measured = menuRef.current?.offsetHeight;
    const height = measured ?? options.length * ROW_HEIGHT + MENU_PADDING;
    const below = window.innerHeight - rect.bottom - GAP - EDGE;
    const above = rect.top - GAP - EDGE;
    // Nach oben nur, wenn es unten wirklich nicht reicht und oben mehr ist:
    // Ein Menü, das ohne Not nach oben klappt, verdeckt das Feld darüber.
    const flip = height > below && above > below;

    setPosition({
      left: rect.left,
      width: rect.width,
      ...(flip
        ? { bottom: window.innerHeight - rect.top + GAP }
        : { top: rect.bottom + GAP }),
    });
  }, [options.length]);

  const openMenu = useCallback(
    (index: number) => {
      if (disabled) return;
      setActiveIndex(index);
      place();
      setOpen(true);
    },
    [disabled, place],
  );

  const close = useCallback(() => {
    setOpen(false);
    setPosition(null);
  }, []);

  const commit = useCallback(
    (index: number) => {
      const option = options[index];
      if (option !== undefined) onChange(option.value);
      close();
      triggerRef.current?.focus();
    },
    [close, onChange, options],
  );

  /*
   * Nach dem ersten Bild steht die echte Höhe fest -- erst dann lässt sich
   * sicher sagen, ob nach unten Platz war. Im selben Durchgang wird das Menü
   * waagerecht in den Sichtbereich geschoben; die Felder sitzen teils dicht am
   * rechten Rand der Seitenleiste.
   */
  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!open || menu === null) return;

    const width = menu.offsetWidth;
    const maxLeft = window.innerWidth - width - EDGE;
    setPosition((current) => {
      if (current === null) return current;
      const left = Math.max(EDGE, Math.min(current.left, maxLeft));
      return left === current.left ? current : { ...current, left };
    });

    menu.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [open, activeIndex]);

  /*
   * Zu, sobald daneben geklickt oder gescrollt wird. `pointerdown` statt
   * `click`, damit das Menü nicht noch den Klick abfängt, der es schliesst.
   * Das Scroll-Ereignis muss in der Erfassungsphase kommen: Es kommt von der
   * scrollenden Seitenleiste, nicht vom Dokument.
   */
  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) === true) return;
      if (menuRef.current?.contains(target) === true) return;
      close();
    };

    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);

    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open, close]);

  const step = (delta: number) => {
    const start = open ? activeIndex : selectedIndex === -1 ? 0 : selectedIndex;
    const next = Math.max(0, Math.min(options.length - 1, start + delta));
    if (open) setActiveIndex(next);
    else openMenu(next);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        step(1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        step(-1);
        break;
      case 'Home':
        if (!open) break;
        event.preventDefault();
        setActiveIndex(0);
        break;
      case 'End':
        if (!open) break;
        event.preventDefault();
        setActiveIndex(options.length - 1);
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        if (open) commit(activeIndex);
        else openMenu(selectedIndex === -1 ? 0 : selectedIndex);
        break;
      case 'Escape':
        if (!open) break;
        event.preventDefault();
        close();
        break;
      case 'Tab':
        // Kein preventDefault: Der Fokus soll weiterwandern dürfen.
        if (open) close();
        break;
      default:
        break;
    }
  };

  const menuId = `${id}-menu`;
  const activeId = open ? `${id}-option-${activeIndex}` : undefined;
  const shownLabel = selected?.label ?? placeholder ?? '';
  const triggerLabel = selected?.shortLabel ?? shownLabel;

  return (
    <div className={className === undefined ? 'select' : `select ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        className="select__trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-activedescendant={activeId}
        aria-label={`${label}: ${shownLabel}`}
        data-tip={title}
        disabled={disabled}
        onClick={() => (open ? close() : openMenu(selectedIndex === -1 ? 0 : selectedIndex))}
        onKeyDown={onKeyDown}
      >
        {selected?.icon !== undefined && (
          <span className="select__icon">{selected.icon}</span>
        )}
        {trigger === 'label' && (
          <span className="select__value">{triggerLabel}</span>
        )}
        <span className="select__caret">
          <ChevronIcon />
        </span>
      </button>

      {open &&
        position !== null &&
        createPortal(
          <ul
            ref={menuRef}
            id={menuId}
            role="listbox"
            aria-label={label}
            className="select__menu"
            style={{
              left: position.left,
              minWidth: position.width,
              ...(position.top === undefined
                ? { bottom: position.bottom }
                : { top: position.top }),
            }}
          >
            {options.map((option, index) => (
              <li
                key={option.value}
                id={`${id}-option-${index}`}
                role="option"
                aria-selected={option.value === value}
                data-active={index === activeIndex}
                className="select__option"
                // `pointerdown` statt `click`: Der Knopf verliert den Fokus
                // sonst, bevor die Auswahl ankommt.
                onPointerDown={(event) => {
                  event.preventDefault();
                  commit(index);
                }}
                onPointerEnter={() => setActiveIndex(index)}
              >
                {option.icon !== undefined && (
                  <span className="select__icon">{option.icon}</span>
                )}
                <span className="select__option-label">{option.label}</span>
                {option.value === value && (
                  <span className="select__check">
                    <CheckIcon size={13} />
                  </span>
                )}
              </li>
            ))}
          </ul>,
          document.body,
        )}
    </div>
  );
};
