import { useEffect, useMemo, useRef, useState } from 'react';
import { ApiError, checkLocations, fetchTravelTimes, geocode } from './api.js';
import { INTERSECTION_COLOR, POI_REGION_COLOR } from './colors.js';
import {
  TRAVEL_MODE_SHORT,
  type AreaFeature,
  type CheckedPlace,
  type Coordinate,
  type GeocodingCandidate,
  type LocationCheckResult,
  type Target,
  type TravelTimeLeg,
} from './types.js';

type Props = {
  intersection: AreaFeature | null;
  poiRegion: AreaFeature | null;
  /** Nur Ziele mit bestätigter Koordinate -- zu einem Entwurf gibt es nichts zu messen. */
  targets: Target[];
  /** Die geprüften Orte; überleben den Reload und werden neu bewertet. */
  places: CheckedPlace[];
  onAdd: (place: { label: string; coordinate: Coordinate }) => void;
  onRemove: (id: string) => void;
  onToggleOpen: (id: string) => void;
};

const messageOf = (error: unknown): string =>
  error instanceof ApiError
    ? error.message
    : 'Der Ort konnte gerade nicht geprüft werden.';

const formatMinutes = (minutes: number): string =>
  minutes < 1 ? 'unter 1 Min' : `${Math.round(minutes)} Min`;

/** Unter zehn Kilometern ist die Nachkommastelle eine Aussage, darüber Rauschen. */
const formatKilometers = (kilometers: number): string =>
  `${kilometers.toLocaleString('de-DE', {
    maximumFractionDigits: kilometers < 10 ? 1 : 0,
  })} km`;

/**
 * Erfüllt, nicht erfüllt, noch nicht entscheidbar -- als Zeichen, nicht als
 * Emoji: Die rendern je nach System unterschiedlich gross und bunt.
 */
const CheckBadge = ({
  state,
  color,
  title,
}: {
  state: boolean | null;
  color: string;
  title: string;
}) => (
  <span
    className={`check-badge check-badge--${state === null ? 'unknown' : state ? 'yes' : 'no'}`}
    style={state === true ? { background: color, borderColor: color } : undefined}
    title={title}
    role="img"
    aria-label={title}
  >
    <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
      {state === true && (
        <path
          d="M3.5 8.4 6.6 11.5 12.5 5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
      {state === false && (
        <path
          d="M4.5 4.5 11.5 11.5M11.5 4.5 4.5 11.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
        />
      )}
      {state === null && (
        <path
          d="M4.5 8h7"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
        />
      )}
    </svg>
  </span>
);

/** Eine Zeile der Fahrzeitliste: Ziel links, gemessene Strecke rechts. */
const TravelRow = ({
  target,
  leg,
}: {
  target: Target;
  leg: TravelTimeLeg | undefined;
}) => {
  const minutes = leg?.durationMinutes ?? null;
  // Verglichen wird die angezeigte Zahl, nicht die rohe: Sonst stünde bei einer
  // Grenze von 20 Minuten "20 Min" in Rot, weil es in Wahrheit 20,4 waren.
  const over = minutes === null ? 0 : Math.round(minutes) - target.maxTravelTimeMinutes;

  return (
    <li className="travel-list__row">
      <span className="travel-list__target">
        <span className="travel-list__name">{target.name}</span>
        <span className="travel-list__mode">
          {TRAVEL_MODE_SHORT[target.travelMode]} · max. {target.maxTravelTimeMinutes} Min
        </span>
      </span>

      {minutes === null ? (
        <span
          className="travel-list__value hint"
          title="Der Kartendienst kennt dorthin keine Route."
        >
          keine Route
        </span>
      ) : (
        <span className={over > 0 ? 'travel-list__value error' : 'travel-list__value'}>
          <span className="travel-list__duration">{formatMinutes(minutes)}</span>
          {leg?.distanceKm !== null && leg?.distanceKm !== undefined && (
            <span className="travel-list__distance">
              {formatKilometers(leg.distanceKm)}
            </span>
          )}
          {over > 0 && <span className="travel-list__over">+{over} Min</span>}
        </span>
      )}
    </li>
  );
};

const verdictText = (state: boolean | null, yes: string, no: string, open: string) =>
  state === null ? open : state ? yes : no;

type CardProps = {
  place: CheckedPlace;
  verdict: LocationCheckResult | undefined;
  targets: Target[];
  /** Ändert sich, sobald ein Zielpunkt oder ein Verkehrsmittel wechselt. */
  targetSignature: string;
  onToggleOpen: () => void;
  onRemove: () => void;
};

/**
 * Eine Kachel je geprüftem Ort: zugeklappt die beiden Haken, aufgeklappt die
 * Fahrzeit zu jedem Ziel.
 *
 * Gemessen wird erst beim Aufklappen, und genau das ist die Trennlinie aus dem
 * Bedienablauf: Das Urteil ist reine Geometrie und kostet nichts, also läuft es
 * von allein für alle Kacheln. Die Fahrzeiten kosten Providerkontingent -- der
 * Klick auf die Kachel *ist* die Frage danach.
 */
const CheckedPlaceCard = ({
  place,
  verdict,
  targets,
  targetSignature,
  onToggleOpen,
  onRemove,
}: CardProps) => {
  const [legs, setLegs] = useState<TravelTimeLeg[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Wofür die Zahlen unten gelten. Verhindert eine Messung je Aufklappen. */
  const measured = useRef<string | null>(null);

  useEffect(() => {
    if (!place.open || targetSignature === '') return;
    if (measured.current === targetSignature) return;

    let abgeloest = false;
    setBusy(true);

    fetchTravelTimes(place.coordinate, targets)
      .then((next) => {
        if (abgeloest) return;
        measured.current = targetSignature;
        setLegs(next.legs);
        setError(null);
      })
      .catch((reason: unknown) => {
        // Die alte Liste bleibt stehen und wird nur abgeblendet: Sie
        // verschwinden zu lassen, würde die Seitenleiste zusammenfallen lassen
        // und sagt nichts, was der Fehler daneben nicht besser sagt.
        if (!abgeloest) setError(messageOf(reason));
      })
      .finally(() => {
        if (!abgeloest) setBusy(false);
      });

    return () => {
      abgeloest = true;
    };
    // targets absichtlich nicht in den Abhängigkeiten: Die Signatur sagt
    // bereits, ob sich daran etwas Messbares geändert hat.
  }, [place.open, place.coordinate, targetSignature]);

  const legsById = new Map((legs ?? []).map((leg) => [leg.constraintId, leg]));
  const inIntersection = verdict?.inIntersection ?? null;
  const inPoiRegion = verdict?.inPoiRegion ?? null;

  return (
    <li className="place-card">
      <div className="place-card__head">
        <button
          type="button"
          className="place-card__toggle"
          onClick={onToggleOpen}
          aria-expanded={place.open}
        >
          <span className="poi-cond__caret">{place.open ? '▼' : '►'}</span>
          <span className="place-card__label">{place.label}</span>
        </button>

        <span className="place-card__badges">
          <CheckBadge
            state={inIntersection}
            color={INTERSECTION_COLOR}
            title={verdictText(
              inIntersection,
              'Hauptkriterien erfüllt',
              'Hauptkriterien nicht erfüllt',
              'Noch keine gemeinsame Region berechnet',
            )}
          />
          <CheckBadge
            state={inPoiRegion}
            color={POI_REGION_COLOR}
            title={verdictText(
              inPoiRegion,
              'Auch die gewählten Orte sind erreichbar',
              'Die gewählten Orte sind von hier nicht erreichbar',
              'Noch keine Orte übernommen',
            )}
          />
        </span>

        <button
          type="button"
          className="poi-cond__remove"
          onClick={onRemove}
          aria-label={`${place.label} entfernen`}
          title="Ort entfernen"
        >
          ×
        </button>
      </div>

      {place.open && (
        <div className="place-card__body">
          <p
            className={
              inIntersection === null ? 'hint' : inIntersection ? 'success' : 'error'
            }
          >
            {verdictText(
              inIntersection,
              'Liegt in der gemeinsamen Region.',
              'Liegt außerhalb der gemeinsamen Region.',
              'Führe zuerst eine Analyse durch, damit eine gemeinsame Region vorliegt.',
            )}
          </p>
          <p
            className={inPoiRegion === null ? 'hint' : inPoiRegion ? 'success' : 'error'}
          >
            {verdictText(
              inPoiRegion,
              'Auch die gewählten Orte sind von hier erreichbar.',
              'Die gewählten Orte sind von hier nicht erreichbar.',
              'Übernimm zuerst mindestens eine Auswahl unter „Orte in der Nähe“.',
            )}
          </p>

          {/*
            Die Haken oben sagen nur "drin oder draußen". Erst die Fahrzeit sagt
            *wie knapp* -- und bei einem Ort außerhalb, welches Ziel daran schuld
            ist. Die Orte aus Schritt 3 (Studios, Bahnhöfe) bleiben bewusst
            draußen: Bei achtzig Treffern wäre das eine Tabelle statt einer
            Antwort.
          */}
          {targets.length === 0 ? (
            <p className="hint">
              Lege zuerst ein Ziel an, dann steht hier die Fahrzeit dorthin.
            </p>
          ) : (
            <>
              {error !== null && <p className="error">{error}</p>}

              {legs === null ? (
                <p className="hint">
                  {busy ? 'Fahrzeiten werden berechnet…' : 'Noch keine Fahrzeiten.'}
                </p>
              ) : (
                <ul
                  className={busy ? 'travel-list is-stale' : 'travel-list'}
                  // Während nachgemessen wird, gehören die Zahlen noch zum
                  // vorigen Stand. Sichtbar veraltet ist ehrlich.
                  aria-busy={busy}
                >
                  {targets.map((target) => (
                    <TravelRow
                      key={target.id}
                      target={target}
                      leg={legsById.get(target.id)}
                    />
                  ))}
                </ul>
              )}

              <p className="hint">
                Gemessen auf der schnellsten Route, ohne Verkehrslage. Direkt an der
                Grenze kann die Isochrone minimal abweichen.
              </p>
            </>
          )}
        </div>
      )}
    </li>
  );
};

/** Eigenständiger Tab: Orte sammeln und gegen beide Regionen prüfen. */
export const LocationCheckPanel = ({
  intersection,
  poiRegion,
  targets,
  places,
  onAdd,
  onRemove,
  onToggleOpen,
}: Props) => {
  const [query, setQuery] = useState('');
  const [candidates, setCandidates] = useState<GeocodingCandidate[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verdicts, setVerdicts] = useState<Record<string, LocationCheckResult>>({});

  /**
   * Die Urteile werden nicht gespeichert, sondern abgeleitet: Gemerkt wird nur
   * der Ort. So stimmen sie nach einem Reload wieder -- und sie folgen
   * späteren Änderungen an Analyse und Ortsauswahl, statt eine veraltete
   * Antwort stehen zu lassen. Alle Orte in einem Aufruf: Die Flächen im Rumpf
   * sind gross, die Punkte winzig.
   */
  const placeKey = places.map((place) => place.id).join('|');

  useEffect(() => {
    if (places.length === 0) {
      setVerdicts({});
      return;
    }

    let abgeloest = false;
    const pruefung = places.map((place) => place.id);

    checkLocations(
      places.map((place) => place.coordinate),
      intersection,
      poiRegion,
    )
      .then((next) => {
        if (abgeloest) return;
        setVerdicts(
          Object.fromEntries(
            pruefung.flatMap((id, index) => {
              const result = next.results[index];
              return result === undefined ? [] : [[id, result] as const];
            }),
          ),
        );
        setError(null);
      })
      .catch((reason: unknown) => {
        if (!abgeloest) setError(messageOf(reason));
      });

    return () => {
      abgeloest = true;
    };
    // placeKey statt places: Ein Aufklappen ändert die Liste, aber kein Urteil.
  }, [placeKey, intersection, poiRegion]);

  /**
   * Gemessen wird nur, was die Messung ändert: Zielpunkte und Verkehrsmittel.
   * Die erlaubte Fahrzeit steht bewusst *nicht* im Schlüssel -- sie verschiebt
   * nur die Grenze, an der die Zahl rot wird, nicht die Zahl selbst. Ein
   * geänderter Regler kostet so kein Kontingent.
   */
  const targetSignature = useMemo(
    () =>
      targets
        .map(
          (target) =>
            `${target.id}:${target.coordinate?.latitude},${target.coordinate?.longitude}:${target.travelMode}`,
        )
        .join('|'),
    [targets],
  );

  const busyRef = useRef(busy);
  busyRef.current = busy;

  const pick = (candidate: GeocodingCandidate): void => {
    setCandidates([]);

    // Derselbe Ort zweimal in der Liste wäre zweimal dieselbe Antwort -- und
    // die zweite Kachel würde die erste verdecken.
    const bekannt = places.some(
      (place) =>
        place.coordinate.latitude === candidate.coordinate.latitude &&
        place.coordinate.longitude === candidate.coordinate.longitude,
    );

    if (bekannt) {
      setError(`„${candidate.label}“ steht bereits in der Liste.`);
      return;
    }

    setQuery('');
    onAdd({ label: candidate.label, coordinate: candidate.coordinate });
  };

  const submit = async () => {
    // Der Knopf ist während der Suche gesperrt, die Enter-Taste war es nicht.
    if (busyRef.current) return;

    const trimmed = query.trim();
    if (trimmed === '') {
      setError('Bitte gib einen Ort oder eine Adresse ein.');
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const found = await geocode(trimmed);
      if (found.candidates.length === 0) {
        setError(`Der Ort „${trimmed}“ konnte nicht gefunden werden.`);
      } else if (found.candidates.length === 1) {
        pick(found.candidates[0]!);
      } else {
        setCandidates(found.candidates);
      }
    } catch (reason) {
      setError(messageOf(reason));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="location-check" aria-labelledby="location-check-title">
      <h2 id="location-check-title">Orte prüfen</h2>
      <p className="hint">
        Sammle Adressen und sieh auf einen Blick, welche die Hauptkriterien (hell) und
        welche zusätzlich die gewählten Orte (dunkel) erfüllen.
      </p>

      <label>
        Ort oder Adresse
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void submit();
          }}
          placeholder="z. B. Musterstraße 1, Oldenburg"
        />
      </label>
      <button
        type="button"
        className="primary"
        onClick={() => void submit()}
        disabled={busy}
      >
        {busy ? 'Suche…' : 'Ort hinzufügen'}
      </button>

      {error !== null && <p className="error">{error}</p>}

      {candidates.length > 0 && (
        <div className="candidates">
          <p className="candidates__hint">Bitte wähle den passenden Treffer:</p>
          {candidates.map((candidate) => (
            <button
              key={`${candidate.coordinate.latitude},${candidate.coordinate.longitude}`}
              type="button"
              className="candidate"
              onClick={() => pick(candidate)}
              disabled={busy}
            >
              {candidate.label}
            </button>
          ))}
        </div>
      )}

      {places.length === 0 ? (
        <p className="hint">
          Noch kein Ort geprüft. Jeder hinzugefügte Ort bleibt in der Liste und wird neu
          bewertet, sobald sich Ziele oder Auswahl ändern.
        </p>
      ) : (
        <ul className="place-cards">
          {places.map((place) => (
            <CheckedPlaceCard
              key={place.id}
              place={place}
              verdict={verdicts[place.id]}
              targets={targets}
              targetSignature={targetSignature}
              onToggleOpen={() => onToggleOpen(place.id)}
              onRemove={() => onRemove(place.id)}
            />
          ))}
        </ul>
      )}
    </section>
  );
};
