import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * Die Sprechblase, die sonst das Betriebssystem stellt.
 *
 * `title` ist bequem, aber das Kästchen dazu zeichnet der Rechner: andere
 * Schrift, andere Farben, eigene Verzögerung, und im Dunkelmodus hell. Damit
 * blieb ausgerechnet der letzte Rest der Oberfläche fremd.
 *
 * Statt jedes Element in eine eigene Komponente zu wickeln, hört **eine**
 * Schicht am Dokument zu und zeigt die Blase für alles, was `data-tip` trägt.
 * Das hält die Umstellung auf einen Attributnamen je Stelle beschränkt -- und
 * greift auch für Knöpfe, die gar nicht aus React kommen, etwa die von
 * MapLibre.
 */

/** So lange wie die Blase des Systems wartet -- sofort wäre Gezappel. */
const DELAY_MS = 450;
const GAP = 8;
const EDGE = 8;

const TOOLTIP_ID = 'app-tooltip';

type Bubble = {
  text: string;
  left: number;
  top: number;
  /** Über oder unter dem Element -- oben ist die Regel, unten der Rückfall. */
  below: boolean;
};

export const TooltipLayer = () => {
  const [bubble, setBubble] = useState<Bubble | null>(null);
  const timer = useRef<number | null>(null);
  /** Das Element, dem gerade eine Beschreibung angehängt ist. */
  const described = useRef<Element | null>(null);

  useEffect(() => {
    const clearTimer = () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = null;
    };

    /*
     * Die Blase ist auch für Vorleseprogramme da: Solange sie steht, verweist
     * das Element über `aria-describedby` darauf. Ohne das ginge beim Umstieg
     * von `title` auf `data-tip` genau die Zusatzangabe verloren, für die es
     * den Tooltip überhaupt gibt.
     */
    const detach = () => {
      described.current?.removeAttribute('aria-describedby');
      described.current = null;
    };

    const hide = () => {
      clearTimer();
      detach();
      setBubble(null);
    };

    const show = (target: Element) => {
      const text = target.getAttribute('data-tip');
      if (text === null || text === '') return;

      clearTimer();
      timer.current = window.setTimeout(() => {
        /*
         * Nicht über ein aufgeklapptes Menü. Ein Klick auf ein Auswahlfeld
         * blendet die Blase zwar aus (pointerdown), holt aber sofort den Fokus
         * -- und `focusin` startet sie neu. Eine halbe Sekunde später stand sie
         * dann genau über den obersten Einträgen des Menüs, das man gerade
         * geöffnet hatte. Geprüft wird erst hier, nicht beim Öffnen des
         * Timers: Beim `focusin` steht `aria-expanded` noch auf false.
         */
        if (target.getAttribute('aria-expanded') === 'true') return;

        const rect = target.getBoundingClientRect();
        // Unter das Element, wenn oben kein Platz ist -- in der Kopfzeile der
        // Seitenleiste ist das der Normalfall.
        const below = rect.top < 46;
        setBubble({
          text,
          left: rect.left + rect.width / 2,
          top: below ? rect.bottom + GAP : rect.top - GAP,
          below,
        });
        target.setAttribute('aria-describedby', TOOLTIP_ID);
        described.current = target;
      }, DELAY_MS);
    };

    const onOver = (event: Event) => {
      const target = (event.target as Element | null)?.closest?.('[data-tip]');
      if (target == null) return;
      show(target);
    };

    const onOut = (event: Event) => {
      const target = (event.target as Element | null)?.closest?.('[data-tip]');
      if (target == null) return;
      hide();
    };

    document.addEventListener('pointerover', onOver);
    document.addEventListener('pointerout', onOut);
    document.addEventListener('focusin', onOver);
    document.addEventListener('focusout', onOut);
    // Weg, sobald etwas passiert: ein Klick, eine Taste, ein Bildlauf. Eine
    // stehengebliebene Blase verdeckt sonst genau das, was man angeklickt hat.
    document.addEventListener('pointerdown', hide);
    document.addEventListener('keydown', hide);
    window.addEventListener('scroll', hide, true);

    return () => {
      document.removeEventListener('pointerover', onOver);
      document.removeEventListener('pointerout', onOut);
      document.removeEventListener('focusin', onOver);
      document.removeEventListener('focusout', onOut);
      document.removeEventListener('pointerdown', hide);
      document.removeEventListener('keydown', hide);
      window.removeEventListener('scroll', hide, true);
      clearTimer();
      detach();
    };
  }, []);

  if (bubble === null) return null;

  return createPortal(
    <div
      id={TOOLTIP_ID}
      role="tooltip"
      className={bubble.below ? 'tooltip tooltip--below' : 'tooltip'}
      style={{
        left: `clamp(${EDGE}px, ${bubble.left}px, calc(100vw - ${EDGE}px))`,
        top: bubble.top,
      }}
    >
      {bubble.text}
    </div>,
    document.body,
  );
};
