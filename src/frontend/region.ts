/**
 * Die Region -- das Land, in dem die App benutzt wird. Sie entscheidet zwei
 * Dinge: ob Entfernungen in Kilometern oder Meilen stehen, und welches Land in
 * der Adresszeile ungenannt bleiben darf.
 *
 * Bewusst die **Region**, nicht die Sprache. `en-GB` ist Englisch und Meilen,
 * `en-IE` ist Englisch und Kilometer -- die Sprache trennt das nicht. Und wer
 * diese App benutzt, kann sehr wohl auf Englisch in Deutschland suchen.
 *
 * Es gibt dafuer keinen Umschalter: Anders als Sprache, Kartenausschnitt und
 * Dunkelmodus ist das keine Vorliebe, sondern eine Tatsache ueber den Ort, an
 * dem jemand sitzt. Wird sie je falsch erkannt, gehoert ein Schalter her --
 * bis dahin waere er eine Frage, deren Antwort schon feststeht.
 */

/**
 * Die Mac-Huelle reicht die Region des Rechners hier herein, weil die
 * WKWebView sie **falsch** meldet.
 *
 * Gemessen am 14.09.2026: Steht macOS auf englischer Sprache in einem
 * nicht-englischen Land (`en-DE`, eine reale und gaengige Einstellung), meldet
 * `navigator.language` in der App `en-GB` -- WebKit bildet die Kombination auf
 * das naechstgelegene Standard-Englisch ab und **erfindet dabei die Region**.
 * Die Oberflaeche entschiede daraufhin auf Meilen und schriebe "Deutschland"
 * hinter jedes Ziel, auf einem Rechner, der in Deutschland steht.
 *
 * Reine Standardkombinationen kommen richtig an (`de-DE` -> `de-DE`,
 * `en-US` -> `en-US`); es ist also kein Fehler der Huelle, sondern eine
 * Abbildung in WebKit. Am Bundle liegt es nicht: `CFBundleDevelopmentRegion`,
 * `CFBundleLocalizations` und echte `.lproj`-Ordner aendern daran nichts,
 * alle drei nachgemessen. Foundation weiss es dagegen richtig
 * (`Locale.current.region` -> `DE`).
 */
declare global {
  interface Window {
    __hostRegion?: string;
  }
}

/** Zwei Buchstaben (DE, US) oder ein UN-M.49-Code (419). */
const REGION_CODE = /^[A-Za-z]{2}$|^\d{3}$/;

const clean = (value: string | undefined | null): string | null => {
  const trimmed = value?.trim() ?? '';
  return REGION_CODE.test(trimmed) ? trimmed.toUpperCase() : null;
};

/**
 * Reihenfolge: die Angabe der Huelle, dann eine ausdrueckliche Region in den
 * Browsersprachen, dann die Ergaenzung nach CLDR, sonst nichts.
 *
 * Der dritte Schritt ist noetig, weil Browser oft nur `de` ohne Land melden;
 * `new Intl.Locale('de').maximize()` macht daraus `de-Latn-DE`. Das ist eine
 * begruendete Vermutung, keine Auskunft -- fuer `en` lautet sie `US`, also
 * Meilen. Deshalb steht sie hinter der ausdruecklichen Angabe, nicht davor.
 *
 * `null` heisst "unbekannt" und nicht "Deutschland": Die Aufrufer entscheiden
 * dann auf den unauffaelligsten Fall -- Kilometer, und das Land wird genannt.
 */
export const detectRegion = (): string | null => {
  if (typeof window !== 'undefined') {
    const injected = clean(window.__hostRegion);
    if (injected !== null) return injected;
  }

  const tags =
    typeof navigator === 'undefined'
      ? []
      : (navigator.languages ?? [navigator.language]).filter(
          (tag): tag is string => typeof tag === 'string',
        );

  for (const tag of tags) {
    const region = clean(tag.split('-')[1]);
    if (region !== null) return region;
  }

  for (const tag of tags) {
    try {
      const region = clean(new Intl.Locale(tag).maximize().region);
      if (region !== null) return region;
    } catch {
      // Ein unbrauchbares Sprachkuerzel ist kein Fehler, nur keine Auskunft.
    }
  }

  return null;
};

/**
 * Einmal beim Laden bestimmt. Die Region aendert sich waehrend einer Sitzung
 * nicht -- sie bei jedem Rendern neu zu erfragen waere Aufwand ohne Frage.
 */
export const REGION: string | null = detectRegion();
