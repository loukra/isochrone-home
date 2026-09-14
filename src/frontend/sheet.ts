import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react';

/**
 * Das Blatt, das auf dem Telefon über der Karte liegt.
 *
 * Auf dem Schreibtisch stehen Bedienung und Karte nebeneinander -- man ändert
 * eine Zeit und sieht die Fläche im selben Blick. Untereinander gestapelt geht
 * das nicht mehr: Die Seitenleiste allein ist höher als der Schirm, die Karte
 * begänne unterhalb der Faltkante. Deshalb liegt die Karte fest im Hintergrund
 * und die Bedienung als ziehbares Blatt darüber.
 *
 * Wie hoch das Blatt steht, entscheidet der Nutzer -- es fährt **nie** von
 * allein. Dieselbe Regel wie beim Kartenausschnitt: Ein bestätigtes Ziel das
 * Blatt einklappen zu lassen wäre eine zweite, ungefragte Antwort, und wer
 * gerade das nächste Ziel anlegen will, müsste es jedes Mal zurückziehen.
 */
export type SheetSnap = 'peek' | 'half' | 'full';

/**
 * Die beiden oberen Rastpunkte als Anteil der Fensterhöhe. „half" ist die
 * Vorgabe, weil nur dort beides zugleich zu sehen ist -- Liste und Karte;
 * „full" ist das Arbeiten in der Liste.
 *
 * „peek" steht nicht dabei: Es wird **gemessen**, nicht gesetzt -- siehe
 * `pinnedHeight`.
 */
const SNAP_FRACTION: Record<SheetSnap, number> = { peek: 0, half: 0.6, full: 0.92 };

const SNAPS: readonly SheetSnap[] = ['peek', 'half', 'full'];

/** Darunter ist es kein Zug, sondern ein Tipp mit unruhigem Finger. */
const TAP_TOLERANCE_PX = 4;

/**
 * Auch wenn nichts angeheftet ist (Tab „Adressen prüfen", Dock leer), bleibt
 * ein Streifen stehen: Ein Blatt aus nur einem Griff sähe nach Fehler aus.
 */
const MIN_PEEK_FRACTION = 0.1;
const MAX_HEIGHT_FRACTION = 0.96;

/**
 * Wie hoch das eingeklappte Blatt sein muss, damit nichts übereinanderliegt.
 *
 * Am Blatt hängen zwei Dinge fest: der Griff oben und das Dock unten, beide
 * klebend. Ist das Blatt kürzer als ihre Summe, schieben sie sich übereinander
 * -- und weil der Griff obenauf liegen muss (sonst käme man nicht mehr heran),
 * verschwindet ausgerechnet der einzige Knopf der App darunter. Gemessen statt
 * geraten, weil das Dock atmet: eine Fehlermeldung, eine laufende Suche in der
 * Statusleiste, und es ist eine Zeile höher.
 */
const pinnedHeight = (sheet: HTMLElement): number => {
  const handle = sheet.querySelector('.sheet-handle');
  const dock = sheet.querySelector('.dock');

  return (
    (handle?.getBoundingClientRect().height ?? 0) +
    (dock?.getBoundingClientRect().height ?? 0)
  );
};

export const useSheet = (sheet: RefObject<HTMLElement | null>) => {
  const [snap, setSnap] = useState<SheetSnap>('half');
  /** Die gemessene Höhe des eingeklappten Blattes, in Pixeln. */
  const [peek, setPeek] = useState(0);
  /**
   * Die Höhe während des Ziehens, in Pixeln. Sonst `null`: Dann gelten die
   * Rastpunkte aus dem Stylesheet, und die rechnen in `dvh` -- nur die kennen
   * die ein- und ausfahrende Adressleiste von iOS.
   */
  const [dragHeight, setDragHeight] = useState<number | null>(null);

  // Der Griff ist immer gleich hoch, das Dock nicht -- also nachmessen, sobald
  // sich eines von beidem aendert, statt einmal beim Einhaengen.
  useEffect(() => {
    const element = sheet.current;
    if (element === null) return;

    const measure = (): void => {
      setPeek(Math.max(pinnedHeight(element), window.innerHeight * MIN_PEEK_FRACTION));
    };

    measure();

    const observer = new ResizeObserver(measure);
    for (const part of [element.querySelector('.sheet-handle'), element.querySelector('.dock')]) {
      if (part !== null) observer.observe(part);
    }
    window.addEventListener('resize', measure);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [sheet]);

  const peekRef = useRef(peek);
  peekRef.current = peek;

  const cycle = useCallback(() => {
    setSnap((current) => SNAPS[(SNAPS.indexOf(current) + 1) % SNAPS.length]!);
  }, []);

  const cycleRef = useRef(cycle);
  cycleRef.current = cycle;

  const nearestSnap = useCallback((height: number): SheetSnap => {
    const heightOf = (candidate: SheetSnap): number =>
      candidate === 'peek' ? peekRef.current : SNAP_FRACTION[candidate] * window.innerHeight;

    let best: SheetSnap = SNAPS[0]!;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const candidate of SNAPS) {
      const distance = Math.abs(heightOf(candidate) - height);
      if (distance < bestDistance) {
        best = candidate;
        bestDistance = distance;
      }
    }

    return best;
  }, []);

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const element = sheet.current;
      if (element === null) return;

      const handle = event.currentTarget;
      const startY = event.clientY;
      const startHeight = element.getBoundingClientRect().height;
      let moved = false;

      // Ohne Fangen verliert der Griff den Finger, sobald er die 38 Pixel
      // breite Leiste verlässt -- und das tut er beim Ziehen sofort.
      handle.setPointerCapture(event.pointerId);

      const heightAt = (pointer: PointerEvent): number =>
        startHeight + (startY - pointer.clientY);

      const move = (pointer: PointerEvent): void => {
        if (Math.abs(pointer.clientY - startY) > TAP_TOLERANCE_PX) moved = true;
        // Nach unten ist beim eingeklappten Blatt Schluss -- tiefer gaebe es
        // keine Raststellung, und der Griff laege auf dem Knopf.
        setDragHeight(
          Math.min(
            Math.max(heightAt(pointer), peekRef.current),
            window.innerHeight * MAX_HEIGHT_FRACTION,
          ),
        );
      };

      const finish = (pointer: PointerEvent): void => {
        handle.removeEventListener('pointermove', move);
        handle.removeEventListener('pointerup', finish);
        handle.removeEventListener('pointercancel', finish);
        setDragHeight(null);

        // Ein Tipp ist kein Zug: Ohne Bewegung ist der Griff ein Knopf, der
        // zum nächsten Rastpunkt weiterschaltet.
        if (moved) setSnap(nearestSnap(heightAt(pointer)));
        else cycleRef.current();
      };

      handle.addEventListener('pointermove', move);
      handle.addEventListener('pointerup', finish);
      handle.addEventListener('pointercancel', finish);
    },
    [nearestSnap, sheet],
  );

  return {
    snap,
    dragging: dragHeight !== null,
    /**
     * `--sheet-peek` ist die gemessene Höhe des eingeklappten Blattes, `--sheet`
     * die während des Ziehens. Beide stehen am Raster, nicht am Blatt: Die Karte
     * liest dieselbe Variable, damit die Herkunftsangabe nicht darunter
     * verschwindet.
     */
    style: {
      '--sheet-peek': `${peek}px`,
      ...(dragHeight === null ? {} : { '--sheet': `${dragHeight}px` }),
    } as CSSProperties,
    onPointerDown,
    cycle,
  };
};
