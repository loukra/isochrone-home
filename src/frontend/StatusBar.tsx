import { useEffect, useState } from 'react';
import { useTexts } from './i18n/index.js';

type StatusBarProps = {
  /** Was gerade läuft, in der Reihenfolge des Ablaufs. Leer = Ruhe. */
  activities: string[];
};

/** Ab hier ist es keine Reaktionszeit mehr, sondern Warten. */
const SLOW_AFTER_SECONDS = 8;

/**
 * Zeigt an, was die App gerade tut.
 *
 * Ohne das wirkt eine langsame Antwort wie ein Absturz: Die Eingaben sind
 * gesperrt, der Knopf reagiert nicht, und nichts erklärt warum. Overpass
 * braucht unter Last real bis zu einer Minute -- das ist erträglich, wenn man
 * es sieht, und unerträglich, wenn man rät.
 */
export const StatusBar = ({ activities }: StatusBarProps) => {
  const texts = useTexts();
  const busy = activities.length > 0;
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (!busy) {
      setSeconds(0);
      return;
    }

    const startedAt = Date.now();
    const timer = setInterval(
      () => setSeconds(Math.floor((Date.now() - startedAt) / 1000)),
      1000,
    );

    return () => clearInterval(timer);
  }, [busy, activities[0]]);

  if (!busy) return null;

  const [current, ...rest] = activities;
  const slow = seconds >= SLOW_AFTER_SECONDS;

  return (
    <div
      className="status"
      role="status"
      aria-live="polite"
      // Beim Überfahren steht alles da, auch was in der Zeile keinen Platz hat.
      title={activities.join('\n')}
    >
      <span className="status__spinner" aria-hidden="true" />
      <span className="status__text">
        {current}
        {rest.length > 0 && (
          <span className="status__more">{texts.status.more(rest.length)}</span>
        )}
      </span>
      {seconds > 2 && (
        <span className="status__time">{texts.status.seconds(seconds)}</span>
      )}
      {slow && (
        <span className="status__slow">{texts.status.slow}</span>
      )}
    </div>
  );
};
