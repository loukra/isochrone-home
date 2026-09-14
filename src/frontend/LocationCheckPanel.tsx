import { useEffect, useMemo, useRef, useState } from 'react';
import { checkLocations, fetchTravelTimes, geocode } from './api.js';
import { INTERSECTION_COLOR, POI_REGION_COLOR } from './colors.js';
import {
  type AreaFeature,
  type CheckedPlace,
  type Coordinate,
  type GeocodingCandidate,
  type LocationCheckResult,
  type Target,
  type TravelTimeLeg,
} from './types.js';
import { useTexts, type Texts } from './i18n/index.js';
import { translateError } from './i18n/errors.js';
import { CaretIcon, CloseIcon } from './components/icons.js';

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

const formatMinutes = (texts: Texts, minutes: number): string =>
  minutes < 1 ? texts.address.underOneMinute : texts.address.minutes(Math.round(minutes));

/** Unter zehn Kilometern ist die Nachkommastelle eine Aussage, darüber Rauschen. */
const formatKilometers = (texts: Texts, kilometers: number): string =>
  `${kilometers.toLocaleString(texts.app.locale, {
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
    data-tip={title}
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
  const texts = useTexts();
  const minutes = leg?.durationMinutes ?? null;
  // Verglichen wird die angezeigte Zahl, nicht die rohe: Sonst stünde bei einer
  // Grenze von 20 Minuten "20 Min" in Rot, weil es in Wahrheit 20,4 waren.
  const over = minutes === null ? 0 : Math.round(minutes) - target.maxTravelTimeMinutes;

  return (
    <li className="travel-list__row">
      <span className="travel-list__target">
        <span className="travel-list__name">{target.name}</span>
        <span className="travel-list__mode">
          {texts.travelModesShort[target.travelMode]} ·{' '}
          {texts.address.limit(target.maxTravelTimeMinutes)}
        </span>
      </span>

      {minutes === null ? (
        <span
          className="travel-list__value hint"
          data-tip={texts.address.noRoute}
        >
          {texts.address.noRouteShort}
        </span>
      ) : (
        <span className={over > 0 ? 'travel-list__value error' : 'travel-list__value'}>
          <span className="travel-list__duration">{formatMinutes(texts, minutes)}</span>
          {leg?.distanceKm !== null && leg?.distanceKm !== undefined && (
            <span className="travel-list__distance">
              {formatKilometers(texts, leg.distanceKm)}
            </span>
          )}
          {over > 0 && (
            <span className="travel-list__over">{texts.address.overBy(over)}</span>
          )}
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
  const texts = useTexts();
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
        if (!abgeloest) setError(translateError(texts, reason));
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
          <span className="poi-cond__caret">
            <CaretIcon open={place.open} />
          </span>
          <span className="place-card__label">{place.label}</span>
        </button>

        <span className="place-card__badges">
          <CheckBadge
            state={inIntersection}
            color={INTERSECTION_COLOR}
            title={verdictText(
              inIntersection,
              texts.address.targetsMet,
              texts.address.targetsUnmet,
              texts.address.targetsUnknown,
            )}
          />
          <CheckBadge
            state={inPoiRegion}
            color={POI_REGION_COLOR}
            title={verdictText(
              inPoiRegion,
              texts.address.placesMet,
              texts.address.placesUnmet,
              texts.address.placesUnknown,
            )}
          />
        </span>

        <button
          type="button"
          className="poi-cond__remove"
          onClick={onRemove}
          aria-label={texts.address.removeLabel(place.label)}
          data-tip={texts.address.removeTitle}
        >
          <CloseIcon />
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
              texts.address.insideRegion,
              texts.address.outsideRegion,
              texts.address.regionMissing,
            )}
          </p>
          <p
            className={inPoiRegion === null ? 'hint' : inPoiRegion ? 'success' : 'error'}
          >
            {verdictText(
              inPoiRegion,
              texts.address.placesReachable,
              texts.address.placesUnreachable,
              texts.address.placesMissing,
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
            <p className="hint">{texts.address.needsTargets}</p>
          ) : (
            <>
              {error !== null && <p className="error">{error}</p>}

              {legs === null ? (
                <p className="hint">
                  {busy ? texts.address.travelTimesBusy : texts.address.travelTimesEmpty}
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

              <p className="hint">{texts.address.travelTimesHint}</p>
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
  const texts = useTexts();
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
        if (!abgeloest) setError(translateError(texts, reason));
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
      setError(texts.address.duplicate(candidate.label));
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
      setError(texts.address.empty);
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const found = await geocode(trimmed);
      if (found.candidates.length === 0) {
        setError(texts.address.notFound(trimmed));
      } else if (found.candidates.length === 1) {
        pick(found.candidates[0]!);
      } else {
        setCandidates(found.candidates);
      }
    } catch (reason) {
      setError(translateError(texts, reason));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="location-check" aria-labelledby="location-check-title">
      <h2 id="location-check-title">{texts.address.heading}</h2>
      <p className="hint">{texts.address.intro}</p>

      <label>
        {texts.address.queryField}
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void submit();
          }}
          placeholder={texts.address.placeholder}
        />
      </label>
      <button
        type="button"
        className="primary"
        onClick={() => void submit()}
        disabled={busy}
      >
        {busy ? texts.address.adding : texts.address.add}
      </button>

      {error !== null && <p className="error">{error}</p>}

      {candidates.length > 0 && (
        <div className="candidates">
          <p className="candidates__hint">{texts.address.chooseMatch}</p>
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
        <p className="hint">{texts.address.emptyList}</p>
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
