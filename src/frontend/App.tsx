import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  analyze,
  checkLocations,
  fetchIsochrone,
  fetchMapConfig,
  geocode,
  refinePoiRegion,
  searchPois,
} from './api.js';
import { unionBounds } from './bounds.js';
import { colorAt } from './colors.js';
import { TargetCard, type TargetEditValues } from './forms/TargetCard.js';
import { TargetDraftForm, type DraftValues } from './forms/TargetDraftForm.js';
import { MapView } from './map/MapView.js';
import { StatusBar } from './StatusBar.js';
import { LocationCheckPanel } from './LocationCheckPanel.js';
import { PoiPanel } from './poi/PoiPanel.js';
import { PoiApplyBar } from './poi/PoiApplyBar.js';
import { type PoiCondition } from './poi/PoiConditionCard.js';
import { useTexts } from './i18n/index.js';
import { LanguageSwitch } from './i18n/LanguageSwitch.js';
import { ThemeSwitch } from './components/ThemeSwitch.js';
import { TooltipLayer } from './components/TooltipLayer.js';
import { useTheme } from './theme.js';
import { useSheet } from './sheet.js';
import { translateError } from './i18n/errors.js';
import {
  canSortByRelevance,
  defaultSortMode,
  groupPois,
  isPoiSelected,
  toggleGroup,
  toggleMember,
  type PoiGroup,
} from './poi/selection.js';
import {
  clearState,
  loadPoiSelection,
  loadState,
  savePoiSelection,
  saveState,
} from './storage.js';
import type {
  AnalysisResponse,
  AreaFeature,
  CheckedPlace,
  Coordinate,
  FoundPoi,
  GeocodingCandidate,
  LocationCheckResult,
  MapFocus,
  PoiCategory,
  Target,
  TravelMode,
} from './types.js';

type AnalysisState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'done'; result: AnalysisResponse; stale: boolean }
  | { kind: 'error'; message: string };

const newCondition = (category: PoiCategory): PoiCondition => ({
  category,
  // Das Auto als Vorgabe, wie bei den Zielen: Es ist die weiteste Reichweite
  // und damit die Annahme, die am wenigsten still etwas ausschließt.
  travelMode: 'driving',
  minutes: 10,
  pois: [],
  busy: false,
  error: null,
  open: true,
  // "Große zuerst" nur, wo eine Grundfläche etwas aussagt -- siehe
  // `canSortByRelevance` in poi/selection.ts.
  sortMode: defaultSortMode(category),
});

/** Einmalig beim Start gelesen, damit ein Reload die Ziele nicht verwirft. */
const restored = loadState();
const restoredSelection = loadPoiSelection();

export const App = () => {
  const texts = useTexts();
  const [activeTab, setActiveTab] = useState<'analysis' | 'location-check'>('analysis');
  /*
   * Beide Kartenstile, hell und dunkel. Welcher gilt, entscheidet nicht dieser
   * Zustand, sondern das Erscheinungsbild -- deshalb liegen sie zusammen und
   * werden erst beim Rendern auseinandersortiert.
   */
  const [mapStyles, setMapStyles] = useState<{ light: string; dark: string } | null>(
    null,
  );
  const { appearance } = useTheme();
  /** Die im Tab "Orte prüfen" gesammelten Adressen; überleben den Reload. */
  const [checkedPlaces, setCheckedPlaces] = useState<CheckedPlace[]>(
    restored?.checkedPlaces ?? [],
  );
  /**
   * Das Urteil je geprüftem Ort. Es steht hier und nicht in der Kachel, weil
   * die Info-Box am Haus auf der Karte dieselbe Antwort geben muss -- zweimal
   * zu prüfen hiesse zwei Antworten auf dieselbe Frage.
   */
  const [verdicts, setVerdicts] = useState<Record<string, LocationCheckResult>>({});
  const [verdictError, setVerdictError] = useState<string | null>(null);
  /** Das zuletzt auf der Karte angeklickte Haus; seine Kachel steht im Bild. */
  const [focusedPlaceId, setFocusedPlaceId] = useState<string | null>(null);
  /** Auftrag an die Karte, einen angeklickten Ort zu zeigen -- siehe MapFocus. */
  const [mapFocus, setMapFocus] = useState<MapFocus | null>(null);
  const focusStamp = useRef(0);
  /**
   * Das Blatt über der Karte -- nur auf schmalen Schirmen sichtbar, siehe
   * `sheet.ts`. Oben bleibt `data-snap` wirkungslos: Die Regeln dazu stehen
   * sämtlich im Medienblock.
   */
  const sidebarRef = useRef<HTMLElement | null>(null);
  const sheet = useSheet(sidebarRef);
  /** Providerabhaengige Obergrenze; kommt aus der Backend-Konfiguration. */
  const [maxMinutes, setMaxMinutes] = useState(60);
  const [targets, setTargets] = useState<Target[]>(restored?.targets ?? []);
  const [colorCursor, setColorCursor] = useState(restored?.colorCursor ?? 0);

  const [draftOpen, setDraftOpen] = useState((restored?.targets.length ?? 0) === 0);
  const [draftBusy, setDraftBusy] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<GeocodingCandidate[]>([]);
  const [pendingDraft, setPendingDraft] = useState<DraftValues | null>(null);

  /*
    Bearbeitetes Ziel. Immer hoechstens eines: Zwei offene Formulare haetten
    zwei Stapel Adressvorschlaege, und in der Seitenleiste waere nicht zu
    sehen, welcher zu welchem gehoert.
  */
  const [editTargetId, setEditTargetId] = useState<string | null>(null);
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [editCandidates, setEditCandidates] = useState<GeocodingCandidate[]>([]);
  const [pendingEdit, setPendingEdit] = useState<TargetEditValues | null>(null);

  const [conditions, setConditions] = useState<PoiCondition[]>(() =>
    restored?.pois !== null && restored?.pois !== undefined
      ? restored.pois.conditions.map((condition, index, all) => ({
          category: condition.category,
          travelMode: condition.travelMode,
          minutes: condition.minutes,
          // Nur die erste offene überlebt: Ein Stand aus der Zeit vor dem
          // Akkordeon kann mehrere mitbringen.
          open:
            condition.open &&
            all.findIndex((other) => other.open) === index,
          // Ein Stand von vor dieser Regel kann "Große zuerst" für eine
          // Kategorie mitbringen, in der es das nicht mehr gibt.
          sortMode: canSortByRelevance(condition.category)
            ? condition.sortMode
            : 'distance',
          // Die Treffer kommen gleich vom Backend, nicht aus dem Browser.
          pois: [],
          busy: false,
          error: null,
        }))
      : [newCondition('gym')],
  );
  const [poiBusy, setPoiBusy] = useState(false);
  const [poiError, setPoiError] = useState<string | null>(null);
  /** Hervorgehobene Punkte -- eine Kettenzeile hebt alle ihre Filialen hervor. */
  const [focusedPoiIds, setFocusedPoiIds] = useState<ReadonlySet<string>>(new Set());
  /** Ort mit offener Info-Box; immer höchstens einer. */
  const [popupPoiId, setPopupPoiId] = useState<string | null>(null);
  /** Kategorien, die für sich allein nichts übrig lassen. */
  const [blocking, setBlocking] = useState<PoiCategory[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(
    () => new Set(restoredSelection),
  );
  /** Seit dem letzten "Übernehmen" geänderte Auswahl. */
  const [selectionDirty, setSelectionDirty] = useState(false);
  /** Ergebnis von "Übernehmen": Region, die einen gewählten Ort erreicht. */
  const [poiRegion, setPoiRegion] = useState<AreaFeature | null>(null);
  /** true, sobald "Übernehmen" lief und nichts übrig blieb. */
  const [poiRegionEmpty, setPoiRegionEmpty] = useState(false);

  const [analysis, setAnalysis] = useState<AnalysisState>({ kind: 'idle' });

  /**
   * Was aus dem gespeicherten Stand noch nachzuholen ist. Kein State, sondern
   * eine Merkliste, die Schritt für Schritt abgearbeitet wird, sobald die
   * jeweilige Voraussetzung dasteht -- Isochronen vor Analyse, Analyse vor
   * Ortssuche, Ortssuche vor der verengten Region.
   */
  const pendingRestore = useRef({
    analysis: restored?.analysisWasDone ?? false,
    searches: new Set<PoiCategory>(
      (restored?.pois?.conditions ?? [])
        .filter((condition) => condition.searched)
        .map((condition) => condition.category),
    ),
    region: restored?.pois?.applied ?? false,
  });

  /** Letzte gerechnete Zielkombination -- verhindert Dauerfeuer der Analyse. */
  const lastAnalysed = useRef<string | null>(null);

  /**
   * Die Bedingungen als Ref, damit der Schnittmengen-Effekt sie lesen kann,
   * ohne bei jeder Listenänderung erneut zu feuern.
   */
  const conditionsRef = useRef(conditions);
  conditionsRef.current = conditions;

  /**
   * Was in Schritt 3 zuletzt getan war. Verschiebt sich die Region, wird das
   * hier nachgezogen statt weggeworfen -- eine geänderte Fahrzeit soll die
   * Arbeit an den Bahnhöfen nicht vernichten.
   */
  const stepThree = useRef({
    searched: new Set<PoiCategory>(pendingRestore.current.searches),
    applied: pendingRestore.current.region,
  });

  useEffect(() => {
    fetchMapConfig()
      .then((config) => {
        setMapStyles({ light: config.mapStyleUrl, dark: config.mapStyleUrlDark });
        setMaxMinutes(config.maxTravelTimeMinutes);
      })
      .catch(() => setMapStyles(null));
  }, []);

  /** Jede Zieländerung entwertet ein vorhandenes Analyse-Ergebnis. */
  const markAnalysisStale = useCallback(() => {
    // "Veraltet" heißt: muss neu gerechnet werden -- deshalb hier auch die
    // Signatur freigeben. Sonst bliebe die gemeinsame Region dauerhaft weg,
    // wenn eine Änderung an den *fertigen* Zielen nichts ändert: Ein Ziel zu
    // löschen, dessen Isochrone gescheitert war, lässt die Signatur gleich,
    // der Effekt hält sich für erledigt, und die helle Fläche käme erst bei
    // der nächsten beliebigen Änderung zurück.
    lastAnalysed.current = null;
    setAnalysis((current) =>
      current.kind === 'done' ? { ...current, stale: true } : { kind: 'idle' },
    );
  }, []);

  const loadIsochrone = useCallback(async (target: Target) => {
    setTargets((current) =>
      current.map((item) =>
        item.id === target.id ? { ...item, status: 'loading', error: null } : item,
      ),
    );

    try {
      const response = await fetchIsochrone(target);
      setTargets((current) =>
        current.map((item) =>
          item.id === target.id
            ? {
                ...item,
                status: 'ready',
                coordinate: response.coordinate,
                isochrone: response.layer.geometry,
                bounds: response.bounds,
                error: null,
              }
            : item,
        ),
      );
    } catch (error) {
      setTargets((current) =>
        current.map((item) =>
          item.id === target.id
            ? { ...item, status: 'error', error: translateError(texts, error) }
            : item,
        ),
      );
    }
  }, []);

  const addCheckedPlace = useCallback(
    (place: { label: string; coordinate: Coordinate }) => {
      setCheckedPlaces((current) => [
        ...current,
        {
          id: `place-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          label: place.label,
          coordinate: place.coordinate,
          // Ein frisch geprüfter Ort ist der, den man sehen will.
          open: true,
        },
      ]);
    },
    [],
  );

  const removeCheckedPlace = useCallback((id: string) => {
    setCheckedPlaces((current) => current.filter((place) => place.id !== id));
  }, []);

  /**
   * Auftrag an die Karte, etwas zu zeigen. Die laufende Nummer macht aus zwei
   * gleichen Aufträgen zwei -- sonst spränge ein zweiter Klick auf dieselbe
   * Zeile nirgendwohin, weil sich am Zustand nichts geändert hätte.
   */
  const showOnMap = useCallback((points: Coordinate[]) => {
    if (points.length === 0) return;
    focusStamp.current += 1;
    setMapFocus({ points, stamp: focusStamp.current });
  }, []);

  const toggleCheckedPlace = useCallback((id: string) => {
    setCheckedPlaces((current) =>
      current.map((place) => (place.id === id ? { ...place, open: !place.open } : place)),
    );
  }, []);

  /**
   * Der Name in der Kachel fährt die Karte hin -- und tut sonst nichts. Beides
   * an einen Knopf zu hängen hiess: Wer nachsehen wollte, wo der Ort liegt,
   * bekam die Kachel mitsamt Fahrzeitmessung dazu, und wer die Zahlen zuklappte,
   * verlor dafür seinen Ausschnitt. Aufgeklappt wird am Pfeil daneben.
   */
  const showCheckedPlaceOnMap = useCallback(
    (id: string) => {
      const place = checkedPlaces.find((item) => item.id === id);
      if (place !== undefined) showOnMap([place.coordinate]);
    },
    [checkedPlaces, showOnMap],
  );

  /**
   * Klick auf ein Haus auf der Karte. Die Info-Box dort nennt nur die beiden
   * Urteile; alles Weitere -- die Fahrzeit zu jedem Ziel -- steht in der
   * Kachel, also wird die aufgeschlagen. Dass damit gemessen wird, ist
   * dieselbe Trennlinie wie sonst: Das Aufklappen *ist* die Frage danach.
   */
  const openCheckedPlace = useCallback((id: string) => {
    setActiveTab('location-check');
    setFocusedPlaceId(id);
    setCheckedPlaces((current) =>
      current.map((place) => (place.id === id ? { ...place, open: true } : place)),
    );
  }, []);

  /** Die Info-Box ist zu -- die Hervorhebung der Kachel gehörte zu ihr. */
  const closeCheckedPlace = useCallback((id: string) => {
    setFocusedPlaceId((current) => (current === id ? null : current));
  }, []);

  // Jede Aenderung sofort sichern, damit auch ein harter Reload nichts verliert.
  useEffect(() => {
    if (targets.length === 0) {
      // Ohne Ziele gibt es nichts Sinnvolles wiederherzustellen.
      clearState();
      return;
    }

    saveState({
      targets,
      colorCursor,
      // Nur der Merkzettel: Ein veraltetes Ergebnis wird ohnehin verworfen.
      analysisWasDone: analysis.kind === 'done' && !analysis.stale,
      checkedPlaces,
      pois: {
        conditions: conditions.map(
          ({ category, travelMode, minutes, open, sortMode, pois: found }) => ({
            category,
            travelMode,
            minutes,
            open,
            sortMode,
            searched: found.length > 0,
          }),
        ),
        applied: poiRegion !== null,
      },
    });
  }, [targets, colorCursor, analysis, conditions, poiRegion, checkedPlaces]);

  // Wiederhergestellte Ziele ohne Geometrie einmalig nachladen.
  const refetchedRef = useRef(false);

  useEffect(() => {
    if (refetchedRef.current) return;
    refetchedRef.current = true;

    // Kein Ziel bringt mehr eine Geometrie mit -- alle werden nachgeladen. Das
    // trifft im Backend den Plattencache und kostet kein Kontingent.
    for (const target of restored?.targets ?? []) {
      void loadIsochrone(target);
    }
  }, [loadIsochrone]);

  /** Schritt 1: Ziel bestätigen -> geocodieren -> Isochrone anzeigen. */
  const confirmDraft = useCallback(
    async (values: DraftValues, candidate?: GeocodingCandidate) => {
      setDraftBusy(true);
      setDraftError(null);

      try {
        let chosen = candidate;

        if (chosen === undefined) {
          const { candidates: found } = await geocode(values.address);

          if (found.length === 0) {
            setDraftError(
              texts.target.addressNotFound(values.address),
            );
            setDraftBusy(false);
            return;
          }

          if (found.length > 1) {
            // Nutzer entscheidet, welcher Treffer gemeint ist.
            setCandidates(found);
            setPendingDraft(values);
            setDraftBusy(false);
            return;
          }

          chosen = found[0];
        }

        if (chosen === undefined) return;

        const target: Target = {
          id: `target-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          name: values.name,
          address: values.address,
          maxTravelTimeMinutes: values.maxTravelTimeMinutes,
          travelMode: values.travelMode,
          color: colorAt(colorCursor),
          visible: true,
          status: 'loading',
          coordinate: chosen.coordinate,
          resolvedLabel: chosen.label,
          isochrone: null,
          bounds: null,
          error: null,
        };

        setColorCursor((value) => value + 1);
        setTargets((current) => [...current, target]);
        setCandidates([]);
        setPendingDraft(null);
        setDraftOpen(false);
        markAnalysisStale();

        await loadIsochrone(target);
      } catch (error) {
        setDraftError(translateError(texts, error));
      } finally {
        setDraftBusy(false);
      }
    },
    [colorCursor, loadIsochrone, markAnalysisStale],
  );

  /** Ein offenes Formular gehoert zu seinem Ziel und geht mit ihm. */
  const closeTargetEdit = useCallback(() => {
    setEditTargetId(null);
    setEditBusy(false);
    setEditError(null);
    setEditCandidates([]);
    setPendingEdit(null);
  }, []);

  const startTargetEdit = useCallback(
    (id: string) => {
      closeTargetEdit();
      setEditTargetId(id);
    },
    [closeTargetEdit],
  );

  const removeTarget = useCallback(
    (id: string) => {
      setTargets((current) => current.filter((target) => target.id !== id));
      if (editTargetId === id) closeTargetEdit();
      markAnalysisStale();
    },
    [editTargetId, closeTargetEdit, markAnalysisStale],
  );

  /**
   * Name und Adresse eines bestehenden Ziels aendern -- der Teil, den die
   * Kopfzeile nicht bedienen kann.
   *
   * Drei Faelle, und sie kosten unterschiedlich viel:
   *
   * - **Nur der Name.** Ein Ziel umzubenennen verschiebt keinen Punkt. Kein
   *   Adressbuch, keine Isochrone, kein veraltetes Ergebnis.
   * - **Andere Schreibweise, derselbe Ort.** Das Adressbuch antwortet mit
   *   derselben Koordinate; dann bleibt die Flaeche stehen. Eine korrigierte
   *   Hausnummer darf nicht die ganze Schnittmenge kosten.
   * - **Anderer Ort.** Wie eine geaenderte Reisezeit: Isochrone sofort neu,
   *   Analyse-Ergebnis veraltet.
   */
  const submitTargetEdit = useCallback(
    async (id: string, values: TargetEditValues, candidate?: GeocodingCandidate) => {
      const target = targets.find((item) => item.id === id);
      if (target === undefined) return;

      const name = values.name.trim();
      const address = values.address.trim();
      if (name.length === 0 || address.length === 0) return;

      // Umbenennen ist keine Anfrage wert -- die Adresse steht ja noch.
      if (candidate === undefined && address === target.address) {
        if (name !== target.name) {
          setTargets((current) =>
            current.map((item) => (item.id === id ? { ...item, name } : item)),
          );
        }
        closeTargetEdit();
        return;
      }

      setEditBusy(true);
      setEditError(null);

      try {
        let chosen = candidate;

        if (chosen === undefined) {
          const { candidates: found } = await geocode(address);

          if (found.length === 0) {
            setEditError(texts.target.addressNotFound(address));
            setEditBusy(false);
            return;
          }

          if (found.length > 1) {
            // Nutzer entscheidet, welcher Treffer gemeint ist.
            setEditCandidates(found);
            setPendingEdit({ name, address });
            setEditBusy(false);
            return;
          }

          chosen = found[0];
        }

        if (chosen === undefined) return;

        // Ohne bisherige Koordinate gibt es nichts zu behalten -- dann gilt
        // der Ort als verschoben und die Flaeche wird geholt.
        const previous = target.coordinate;
        const moved =
          previous === null ||
          chosen.coordinate.latitude !== previous.latitude ||
          chosen.coordinate.longitude !== previous.longitude;

        // Auch ohne Ortswechsel neu holen, wenn gar keine Flaeche daliegt:
        // Ein gescheitertes Ziel behielte sonst seinen Fehler, obwohl der
        // Nutzer gerade die Adresse repariert hat.
        const refetch = moved || target.isochrone === null;

        const next: Target = {
          ...target,
          name,
          address,
          coordinate: chosen.coordinate,
          resolvedLabel: chosen.label,
          ...(moved ? { isochrone: null, bounds: null } : {}),
        };

        setTargets((current) => current.map((item) => (item.id === id ? next : item)));
        closeTargetEdit();

        if (!refetch) return;

        // Nur ein anderer Ort entwertet die Schnittmenge. Wird ein
        // gescheitertes Ziel fertig, merkt die Signatur das von selbst --
        // sie zaehlt nur die fertigen Ziele.
        if (moved) markAnalysisStale();

        await loadIsochrone(next);
      } catch (error) {
        setEditError(translateError(texts, error));
      } finally {
        setEditBusy(false);
      }
    },
    [targets, texts, closeTargetEdit, loadIsochrone, markAnalysisStale],
  );

  const changeMinutes = useCallback(
    (id: string, minutes: number) => {
      const updated = targets.find((target) => target.id === id);
      if (updated === undefined) return;

      const next: Target = {
        ...updated,
        maxTravelTimeMinutes: minutes,
        isochrone: null,
        bounds: null,
      };
      setTargets((current) => current.map((item) => (item.id === id ? next : item)));
      markAnalysisStale();
      void loadIsochrone(next);
    },
    [targets, loadIsochrone, markAnalysisStale],
  );

  /**
   * Verkehrsmittel wechseln. Wie bei der Zeit: die alte Isochrone gilt nicht
   * mehr und wird sofort neu geholt, das Analyse-Ergebnis wird veraltet.
   * Ein Select-Wechsel ist bereits eine Bestätigung -- kein Tastendruck-Call.
   */
  const changeTravelMode = useCallback(
    (id: string, travelMode: TravelMode) => {
      const updated = targets.find((target) => target.id === id);
      if (updated === undefined || updated.travelMode === travelMode) return;

      const next: Target = { ...updated, travelMode, isochrone: null, bounds: null };
      setTargets((current) => current.map((item) => (item.id === id ? next : item)));
      markAnalysisStale();
      void loadIsochrone(next);
    },
    [targets, loadIsochrone, markAnalysisStale],
  );

  /**
   * Nur die Karte. Kein Neuladen, keine veraltete Analyse -- bei vielen Zielen
   * ueberlagern sich die Flaechen, und das Ergebnis darf davon nicht abhaengen.
   */
  const toggleVisible = useCallback((id: string) => {
    setTargets((current) =>
      current.map((target) =>
        target.id === id ? { ...target, visible: !target.visible } : target,
      ),
    );
  }, []);

  const retry = useCallback(
    (id: string) => {
      const target = targets.find((item) => item.id === id);
      if (target !== undefined) void loadIsochrone(target);
    },
    [targets, loadIsochrone],
  );

  const readyTargets = useMemo(
    () => targets.filter((target) => target.status === 'ready'),
    [targets],
  );

  /** Schritt 2: Schnittmenge auf Klick. */
  const runAnalysis = useCallback(async () => {
    if (readyTargets.length === 0) return;
    setAnalysis({ kind: 'loading' });

    try {
      const result = await analyze(readyTargets);
      setAnalysis({ kind: 'done', result, stale: false });
    } catch (error) {
      // Signatur freigeben, sonst bliebe ein einmaliger Netzfehler für immer
      // stehen -- es gibt keinen Knopf mehr, der es erneut anstoßen könnte.
      lastAnalysed.current = null;
      setAnalysis({ kind: 'error', message: translateError(texts, error) });
    }
  }, [readyTargets]);

  const intersection =
    analysis.kind === 'done' && !analysis.stale ? analysis.result.intersection : null;

  /**
   * Die Urteile werden nicht gespeichert, sondern abgeleitet: Gemerkt wird nur
   * der Ort. So stimmen sie nach einem Reload wieder -- und sie folgen späteren
   * Änderungen an Analyse und Ortsauswahl, statt eine veraltete Antwort stehen
   * zu lassen. Alle Orte in einem Aufruf: Die Flächen im Rumpf sind gross, die
   * Punkte winzig.
   */
  const placeKey = checkedPlaces.map((place) => place.id).join('|');

  useEffect(() => {
    if (checkedPlaces.length === 0) {
      setVerdicts({});
      return;
    }

    let abgeloest = false;
    const pruefung = checkedPlaces.map((place) => place.id);

    checkLocations(
      checkedPlaces.map((place) => place.coordinate),
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
        setVerdictError(null);
      })
      .catch((reason: unknown) => {
        if (!abgeloest) setVerdictError(translateError(texts, reason));
      });

    return () => {
      abgeloest = true;
    };
    // placeKey statt checkedPlaces: Ein Aufklappen ändert die Liste, aber kein
    // Urteil.
  }, [placeKey, intersection, poiRegion]);

  /**
   * Aufklappen ist ein Akkordeon: Eine Bedingung zu öffnen schliesst die
   * anderen.
   *
   * *Geaendert am 14.09.2026 auf Wunsch des Nutzers.* Vorher konnten alle
   * gleichzeitig offen stehen, und bei drei Bedingungen mit je fünfundzwanzig
   * Treffern wuchs die Seitenleiste auf ein paar tausend Pixel: Wer die
   * Bahnhöfe angehakt hatte und dann zum Fitnessstudio wollte, scrollte an
   * einer Liste vorbei, mit der er fertig war. Offen ist jetzt immer das, was
   * man gerade bearbeitet.
   */
  const toggleConditionOpen = useCallback((category: PoiCategory) => {
    setConditions((current) => {
      const target = current.find((condition) => condition.category === category);
      // Ein zweiter Klick auf die offene Bedingung schliesst sie wieder --
      // sonst gäbe es keinen Weg, alle Listen loszuwerden.
      const opening = target?.open !== true;

      return current.map((condition) => ({
        ...condition,
        open: opening && condition.category === category,
      }));
    });
  }, []);

  /** Punktuelle Aenderung genau einer Bedingung. */
  const patchCondition = useCallback(
    (category: PoiCategory, patch: Partial<PoiCondition>) => {
      setConditions((current) =>
        current.map((condition) =>
          condition.category === category ? { ...condition, ...patch } : condition,
        ),
      );
    },
    [],
  );

  /**
   * Eine geänderte Bedingung entwertet das Ergebnis sofort: Die dunkle Fläche
   * gehört zur alten Auswahl, sie stehen zu lassen wäre irreführend.
   */
  const invalidateRegion = useCallback(() => {
    setPoiRegion(null);
    setPoiRegionEmpty(false);
    setBlocking([]);
    setSelectionDirty(true);
  }, []);

  /** Sucht Orte rund um die gemeinsame Region. Kostet kein ORS-Kontingent. */
  const runPoiSearch = useCallback(
    async (
      category: PoiCategory,
      // Beim Anlegen oder Ändern einer Bedingung steht der neue Wert noch nicht
      // im State -- er wird mitgegeben, statt eine Runde auf React zu warten.
      override?: { minutes?: number; travelMode?: TravelMode },
    ) => {
      const current = conditions.find((item) => item.category === category);
      const minutes = override?.minutes ?? current?.minutes;
      const travelMode = override?.travelMode ?? current?.travelMode;

      if (minutes === undefined || travelMode === undefined) return;
      if (readyTargets.length === 0) return;

      patchCondition(category, { busy: true, error: null });
      setPopupPoiId(null);
      setFocusedPoiIds(new Set());

      try {
        const result = await searchPois(readyTargets, category, travelMode, minutes);
        patchCondition(category, { pois: result.pois, busy: false });
        stepThree.current.searched.add(category);
      } catch (error) {
        // Die vorige Liste bleibt stehen. Sie gehoert zum alten Radius, aber
        // sie zu leeren wuerde die Seitenleiste zusammenklappen lassen -- der
        // Fehler steht daneben und sagt, warum nichts Neues gekommen ist.
        patchCondition(category, { busy: false, error: translateError(texts, error) });
      }
    },
    [conditions, readyTargets, patchCondition],
  );

  /**
   * Eine hinzugefügte Bedingung sucht sofort: "Supermarkt" auszuwählen *ist*
   * die Aufforderung, Supermärkte zu zeigen.
   */
  const addCondition = useCallback(
    (category: PoiCategory) => {
      const vorhanden = conditions.some((condition) => condition.category === category);
      if (vorhanden) return;

      const angelegt = newCondition(category);
      // Die neue ist die, um die es gerade geht: Sie klappt auf, die übrigen zu.
      setConditions((current) => [
        ...current.map((condition) => ({ ...condition, open: false })),
        angelegt,
      ]);

      // Ohne gemeinsame Region gibt es nichts zu durchsuchen -- dann bleibt es
      // beim Knopf, bis analysiert wurde.
      if (intersection !== null) void runPoiSearch(category, angelegt);
    },
    [conditions, intersection, runPoiSearch],
  );

  const removeCondition = useCallback(
    (category: PoiCategory) => {
      setConditions((current) =>
        current.filter((condition) => condition.category !== category),
      );
      stepThree.current.searched.delete(category);
      invalidateRegion();
    },
    [invalidateRegion],
  );

  /**
   * Ein geänderter Radius sucht sofort neu. Die Absicht ist eindeutig -- wer
   * von 10 auf 12 Minuten stellt, will Orte in 12 Minuten sehen und kein leeres
   * Kästchen mit einem Knopf daneben. Seit die Treffer aus dem Plattencache
   * kommen, kostet das nichts als einen Augenblick.
   */
  const changeConditionMinutes = useCallback(
    (category: PoiCategory, minutes: number) => {
      // Die gefundenen Orte gelten fuer den alten Suchradius nicht mehr --
      // trotzdem bleiben sie stehen, bis die neuen da sind. Sie zu loeschen
      // liess die halbe Seitenleiste verschwinden und einen Wimpernschlag
      // spaeter wieder auftauchen; alles darunter sprang mit.
      patchCondition(category, { minutes });
      invalidateRegion();
      if (intersection !== null) void runPoiSearch(category, { minutes });
    },
    [patchCondition, invalidateRegion, intersection, runPoiSearch],
  );

  /**
   * Ein gewechseltes Verkehrsmittel verhält sich wie eine geänderte Zeit: Es
   * verschiebt den Suchradius (zehn Minuten zu Fuß sind nicht zehn im Auto),
   * also wird sofort neu gesucht -- die Auswahl im Menü *ist* die Bestätigung.
   * Die verengte Region gehört zum alten Verkehrsmittel und fällt weg; neu
   * berechnet wird sie erst auf Knopfdruck, denn sie kostet Kontingent.
   */
  const changeConditionTravelMode = useCallback(
    (category: PoiCategory, travelMode: TravelMode) => {
      patchCondition(category, { travelMode });
      invalidateRegion();
      if (intersection !== null) void runPoiSearch(category, { travelMode });
    },
    [patchCondition, invalidateRegion, intersection, runPoiSearch],
  );

  const applyKeys = useCallback(
    (update: (current: ReadonlySet<string>) => Set<string>) => {
      setSelectedKeys((current) => {
        const next = update(current);
        savePoiSelection([...next]);
        return next;
      });
      invalidateRegion();
    },
    [invalidateRegion],
  );

  const toggleWholeGroup = useCallback(
    (group: PoiGroup) => applyKeys((keys) => toggleGroup(group, keys)),
    [applyKeys],
  );

  const toggleSingle = useCallback(
    (group: PoiGroup, poi: FoundPoi) =>
      applyKeys((keys) => toggleMember(group, poi, keys)),
    [applyKeys],
  );

  /** Die Gruppe, zu der ein Ort gehört -- für das Häkchen in der Karten-Box. */
  const togglePoiFromMap = useCallback(
    (poi: FoundPoi) => {
      const condition = conditions.find((item) => item.category === poi.category);
      if (condition === undefined) return;

      const group = groupPois(condition.pois).find((candidate) =>
        candidate.members.some((member) => member.id === poi.id),
      );
      if (group !== undefined) toggleSingle(group, poi);
    },
    [conditions, toggleSingle],
  );

  /** Ganze Kette hervorheben, ohne Info-Box -- die gilt einem einzelnen Ort. */
  const focusGroup = useCallback(
    (group: PoiGroup) => {
      const ids = group.members.map((member) => member.id);
      const same =
        ids.length === focusedPoiIds.size && ids.every((id) => focusedPoiIds.has(id));

      setFocusedPoiIds(same ? new Set() : new Set(ids));
      setPopupPoiId(null);

      // Alle Filialen einpassen, nicht die nächstbeste ansteuern: Die Zeile
      // meint die Kette. Beim Abwählen bleibt der Ausschnitt, wo er ist.
      if (!same) showOnMap(group.members.map((member) => member.coordinate));
    },
    [focusedPoiIds, showOnMap],
  );

  const focusMember = useCallback(
    (poi: FoundPoi) => {
      setPopupPoiId((current) => (current === poi.id ? null : poi.id));
      setFocusedPoiIds((current) =>
        current.size === 1 && current.has(poi.id) ? new Set() : new Set([poi.id]),
      );

      // Hervorheben allein hilft nicht, wenn der Punkt gar nicht im Bild ist --
      // genau das ist der Normalfall bei achtzig Treffern über eine Region.
      if (popupPoiId !== poi.id) showOnMap([poi.coordinate]);
    },
    [popupPoiId, showOnMap],
  );

  /**
   * Karteninhalt: Orte der aufgeklappten Bedingungen. Zwei Kategorien auf
   * einmal ergeben schnell mehrere hundert Punkte, die sich nicht unterscheiden
   * lassen. Ausgewählte Orte bleiben immer sichtbar -- sie bestimmen das
   * Ergebnis und dürfen nicht verschwinden, wenn man eine Bedingung zuklappt.
   */
  const pois = useMemo(
    () =>
      conditions.flatMap((condition) =>
        condition.open
          ? condition.pois
          : condition.pois.filter((poi) => isPoiSelected(poi, selectedKeys)),
      ),
    [conditions, selectedKeys],
  );

  /** Je Bedingung die angehakten Orte; leere Bedingungen zählen nicht. */
  const activeConditions = useMemo(
    () =>
      conditions.map((condition) => ({
        category: condition.category,
        travelMode: condition.travelMode,
        maxTravelTimeMinutes: condition.minutes,
        origins: condition.pois
          .filter((poi) => isPoiSelected(poi, selectedKeys))
          .map((poi) => poi.coordinate),
      })),
    [conditions, selectedKeys],
  );

  const selectedPlaces = useMemo(
    () => activeConditions.reduce((sum, condition) => sum + condition.origins.length, 0),
    [activeConditions],
  );

  /**
   * Schritt 3: Isochronen um die gewählten Orte, je Kategorie vereinigt und
   * dann mit der gemeinsamen Region geschnitten. Erst hier wird die
   * Minutenangabe zu einer echten Fahrzeit -- bei der Suche war sie nur ein
   * Suchradius.
   */
  const applySelection = useCallback(async () => {
    if (readyTargets.length === 0 || selectedPlaces === 0) return;

    setPoiBusy(true);
    setPoiError(null);

    try {
      const result = await refinePoiRegion(readyTargets, activeConditions);

      setPoiRegion(result.refined);
      setPoiRegionEmpty(result.refined === null);
      setBlocking(
        result.conditions
          .filter((condition) => !condition.satisfiable)
          .map((condition) => condition.category),
      );
      setSelectionDirty(false);
      stepThree.current.applied = true;
    } catch (error) {
      setPoiError(translateError(texts, error));
    } finally {
      setPoiBusy(false);
    }
  }, [readyTargets, activeConditions, selectedPlaces]);

  /**
   * Der eine Knopf: einmal von oben nach unten.
   *
   * Was schon aktuell ist, wird übersprungen -- der Rest neu gerechnet. Die
   * Kette läuft danach über die Effekte weiter: neue Schnittmenge -> Treffer
   * auffrischen -> verengte Region. Billig ist das, weil Isochronen und
   * Ortssuche aus dem Plattencache kommen; teuer bleibt allein ein *neu*
   * angehakter Ort, und deren Zahl steht am Knopf.
   */
  /**
   * Der eine Knopf. Er loest genau den Schritt aus, der Kontingent kostet --
   * Isochronen um die angehakten Orte. Schnittmenge und Ortssuche sind bis
   * hierher schon von allein gelaufen.
   */
  const runAll = useCallback(async () => {
    if (readyTargets.length === 0 || selectedPlaces === 0) return;

    // Merken, dass die verengte Region gewollt ist -- die Effektkette stellt
    // sie nach einer spaeteren Zieländerung von selbst wieder her.
    stepThree.current.applied = true;
    await applySelection();
  }, [readyTargets, selectedPlaces, applySelection]);

  /** Nichts zu tun: die verengte Region passt zur aktuellen Auswahl. */
  const alleAktuell =
    analysis.kind === 'done' &&
    !analysis.stale &&
    selectedPlaces > 0 &&
    !selectionDirty &&
    poiRegion !== null;

  /**
   * Klartext dessen, was gerade läuft. Die Reihenfolge folgt dem Ablauf, damit
   * oben steht, worauf man wirklich wartet.
   */
  /**
   * Ein Hinweis zur Analyse -- **nur**, wenn der Bildschirm es nicht ohnehin
   * zeigt. Meist also `null`.
   *
   * *Geaendert am 14.09.2026 auf Wunsch des Nutzers.* Vorher stand hier immer
   * eine Zeile, und vier ihrer sechs Faelle waren doppelt gemoppelt:
   * "Gemeinsame Region wird berechnet…" steht wortgleich in der Statusleiste,
   * "Fuege dein erstes Ziel hinzu" steht ueber dem Formular, das dann schon
   * offen danebensteht, und "Gemeinsame Region gefunden." meldete einen Erfolg,
   * der als gruene Flaeche auf der Karte liegt. Eine Meldung, die bestaetigt,
   * was man sieht, ist keine Auskunft, sondern Rauschen -- und sie stumpft die
   * beiden Faelle ab, in denen wirklich etwas zu sagen ist.
   *
   * Uebrig bleiben genau die: Der Aufruf ist gescheitert, oder es gibt keine
   * gemeinsame Region. In beiden Faellen ist die Karte leer, und ohne Text
   * wuesste niemand, warum.
   */
  const analysisNotice: { text: string; tone: 'error' } | null =
    readyTargets.length === 0
      ? null
      : analysis.kind === 'error'
        ? { text: analysis.message, tone: 'error' }
        : analysis.kind !== 'done' || analysis.stale
          ? null
          : analysis.result.intersection === null
            ? { text: texts.analysis.none, tone: 'error' }
            : null;

  const activities = [
    ...targets
      .filter((target) => target.status === 'loading')
      .map((target) => texts.analysis.targetBusy(target.name)),
    ...(analysis.kind === 'loading' ? [texts.analysis.computing] : []),
    ...conditions
      .filter((condition) => condition.busy)
      .map((condition) =>
        texts.analysis.categoryBusy(texts.categoriesPlural[condition.category]),
      ),
    ...(poiBusy ? [texts.analysis.checkingPlaces] : []),
  ];

  const rechnetGerade =
    analysis.kind === 'loading' ||
    poiBusy ||
    conditions.some((condition) => condition.busy);

  /**
   * Eine verschobene Region entwertet Schritt 3 -- aber sie löscht ihn nicht.
   *
   * Die Treffer wurden im Puffer um die *alte* Region gesucht, taugen also
   * nicht mehr. Sie deshalb wegzuwerfen war unnötig hart: Eine um eine Minute
   * geänderte Fahrzeit kostete die ganze Bahnhofsliste, und der Nutzer musste
   * erst analysieren und dann erneut suchen. Seit die Treffer aus dem
   * Plattencache kommen (~50 ms statt eines Overpass-Aufrufs), wird stattdessen
   * nachgezogen, was zuletzt getan war.
   *
   * Die verengte Fläche verschwindet trotzdem sofort: Sie gehört zur alten
   * Region, und eine falsche Fläche stehen zu lassen wäre still irreführend.
   */
  const lastIntersection = useRef(intersection);

  useEffect(() => {
    // Nur eine *neue* Schnittmenge loest etwas aus. Der Vergleich mit dem
    // vorigen Wert statt eines "schon gelaufen"-Flags, weil StrictMode Effekte
    // im Dev doppelt ausfuehrt -- ein Flag wuerde den wiederhergestellten
    // Stand beim zweiten Lauf wegwerfen.
    if (lastIntersection.current === intersection) return;
    lastIntersection.current = intersection;

    setPopupPoiId(null);
    setFocusedPoiIds(new Set());
    invalidateRegion();

    // Veraltet (Ziel geaendert, noch nicht analysiert): Liste stehen lassen.
    if (intersection === null) return;

    // Alle Bedingungen, nicht nur die schon einmal gesuchten: Eine Bedingung
    // anzulegen *ist* die Aufforderung, ihre Orte zu zeigen -- sonst stünde man
    // beim ersten Durchlauf vor einer leeren Liste.
    pendingRestore.current.searches = new Set(
      conditionsRef.current.map((condition) => condition.category),
    );
    pendingRestore.current.region = stepThree.current.applied;
  }, [intersection, invalidateRegion]);

  /* --- Wiederherstellung nach einem Reload -------------------------------
   *
   * Im Browser liegt nur noch die Eingabe. Alles Gerechnete wird hier der Reihe
   * nach nachgeholt, sobald seine Voraussetzung steht. Jeder Schritt streicht
   * sich selbst von der Merkliste, damit er nicht bei jedem Rendern erneut
   * losläuft.
   */

  /**
   * Die Schnittmenge rechnet sich selbst, sobald alle Ziele stehen.
   *
   * Sie kostet kein Providerkontingent -- die Isochronen liegen da -- und
   * niemand setzt Ziele, um die Region *nicht* zu sehen. Ein Knopf dafür wäre
   * eine Frage, deren Antwort immer "ja" lautet.
   *
   * Die Signatur verhindert das Dauerfeuer: Gerechnet wird einmal je
   * Kombination aus Zielen, Zeiten und Verkehrsmitteln, nicht bei jedem Rendern.
   */
  const analysisSignature = readyTargets
    .map((target) => `${target.id}:${target.maxTravelTimeMinutes}:${target.travelMode}`)
    .join('|');

  useEffect(() => {
    // Erst wenn kein Ziel mehr lädt, ist die Schnittmenge vollständig.
    if (targets.length === 0 || targets.some((target) => target.status === 'loading')) {
      return;
    }
    if (readyTargets.length === 0 || lastAnalysed.current === analysisSignature) return;

    lastAnalysed.current = analysisSignature;
    void runAnalysis();
  }, [targets, readyTargets, analysisSignature, runAnalysis]);

  useEffect(() => {
    if (intersection === null || pendingRestore.current.searches.size === 0) return;

    const offen = [...pendingRestore.current.searches];
    pendingRestore.current.searches.clear();
    for (const category of offen) void runPoiSearch(category);
  }, [intersection, runPoiSearch]);

  useEffect(() => {
    if (!pendingRestore.current.region) return;
    if (intersection === null || selectedPlaces === 0) return;
    // Nicht mitten in die Suche hineinrechnen -- sonst fehlen Orte.
    if (conditions.some((condition) => condition.busy)) return;

    pendingRestore.current.region = false;
    void applySelection();
  }, [intersection, selectedPlaces, conditions, applySelection]);

  /**
   * Viewport ueber alle aktiven Ziele. Die einzelnen Boxen kommen vom Backend;
   * hier werden sie nur zusammengefasst, damit beim Hinzufuegen eines Ziels die
   * bereits vorhandenen sichtbar bleiben (Spec 9).
   */
  const fitBounds = useMemo(
    () => unionBounds(targets.map((target) => target.bounds)),
    [targets],
  );

  return (
    <div
      className="layout"
      data-snap={sheet.snap}
      data-dragging={sheet.dragging ? 'true' : undefined}
      style={sheet.style}
    >
      <aside className="sidebar" ref={sidebarRef}>
        {/*
          Der Griff des Blattes. Auf dem Schreibtisch `display: none` -- dort
          ist die Seitenleiste eine Spalte und hat nichts zu ziehen.
        */}
        <button
          type="button"
          className="sheet-handle"
          onPointerDown={sheet.onPointerDown}
          // Mit der Tastatur gibt es kein Ziehen; Enter und Leertaste schalten
          // weiter. Kein `onClick`: Ein Tipp löst das schon beim Loslassen aus,
          // und beides zusammen schöbe das Blatt um zwei Rastpunkte.
          onKeyDown={(event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            sheet.cycle();
          }}
          aria-label={texts.app.sheetHandle}
        />

        <header>
          <h1>{texts.app.title}</h1>
          <p className="subtitle">{texts.app.subtitle}</p>
          {/*
            Sprache und Erscheinungsbild stehen nebeneinander oben rechts:
            beides Einstellungen, die man genau einmal anfasst, und beide
            zeigen nur ihr Zeichen.
          */}
          <div className="sidebar__switches">
            <ThemeSwitch />
            <LanguageSwitch />
          </div>
        </header>

        <nav className="sidebar-tabs" aria-label={texts.app.tablistLabel} role="tablist">
          <button
            type="button"
            role="tab"
            className={
              activeTab === 'analysis' ? 'sidebar-tab sidebar-tab--active' : 'sidebar-tab'
            }
            aria-selected={activeTab === 'analysis'}
            onClick={() => setActiveTab('analysis')}
          >
            {texts.tabs.targets}
          </button>
          <button
            type="button"
            role="tab"
            className={
              activeTab === 'location-check'
                ? 'sidebar-tab sidebar-tab--active'
                : 'sidebar-tab'
            }
            aria-selected={activeTab === 'location-check'}
            onClick={() => setActiveTab('location-check')}
          >
            {texts.tabs.addresses}
          </button>
        </nav>

        {activeTab === 'analysis' ? (
          <>
            <section className="targets">
              {targets.map((target) => (
                <TargetCard
                  key={target.id}
                  target={target}
                  maxMinutes={maxMinutes}
                  edit={
                    editTargetId === target.id
                      ? { busy: editBusy, error: editError, candidates: editCandidates }
                      : null
                  }
                  onRemove={removeTarget}
                  onChangeMinutes={changeMinutes}
                  onChangeTravelMode={changeTravelMode}
                  onToggleVisible={toggleVisible}
                  onRetry={retry}
                  onStartEdit={startTargetEdit}
                  onCancelEdit={closeTargetEdit}
                  onSubmitEdit={(id, values) => void submitTargetEdit(id, values)}
                  onPickEditCandidate={(candidate) => {
                    if (editTargetId !== null && pendingEdit !== null) {
                      void submitTargetEdit(editTargetId, pendingEdit, candidate);
                    }
                  }}
                />
              ))}

              {draftOpen ? (
                <TargetDraftForm
                  maxMinutes={maxMinutes}
                  color={colorAt(colorCursor)}
                  busy={draftBusy}
                  error={draftError}
                  candidates={candidates}
                  onConfirm={(values) => void confirmDraft(values)}
                  onPickCandidate={(candidate) => {
                    if (pendingDraft !== null) void confirmDraft(pendingDraft, candidate);
                  }}
                  onCancel={() => {
                    setDraftOpen(false);
                    setDraftError(null);
                    setCandidates([]);
                    setPendingDraft(null);
                  }}
                />
              ) : (
                <button type="button" className="add" onClick={() => setDraftOpen(true)}>
                  {texts.target.add}
                </button>
              )}

              {/*
                Steht nur da, wenn die Karte die Antwort nicht zeigen kann --
                bei einem Fehler oder wenn es keine gemeinsame Region gibt.
                Dann ist es auch keine Zeile im Fliesstext mehr, sondern ein
                Kasten: Es ist die Nachricht, die den ganzen Rest der
                Seitenleiste erklaert.
              */}
              {analysisNotice !== null && (
                <p className={`notice notice--${analysisNotice.tone}`}>
                  {analysisNotice.text}
                </p>
              )}
            </section>

            <PoiPanel
              conditions={conditions}
              selectedKeys={selectedKeys}
              focusedPoiIds={focusedPoiIds}
              maxMinutes={maxMinutes}
              canSearch={intersection !== null}
              blocking={blocking}
              onAdd={addCondition}
              onRemove={removeCondition}
              onToggleOpen={toggleConditionOpen}
              onMinutesChange={changeConditionMinutes}
              onTravelModeChange={changeConditionTravelMode}
              onSearch={(category) => void runPoiSearch(category)}
              onSortModeChange={(category, mode) =>
                patchCondition(category, { sortMode: mode })
              }
              onToggleGroup={toggleWholeGroup}
              onToggleMember={toggleSingle}
              onFocusGroup={focusGroup}
              onFocusMember={focusMember}
            />
          </>
        ) : (
          <LocationCheckPanel
            targets={readyTargets}
            places={checkedPlaces}
            verdicts={verdicts}
            verdictError={verdictError}
            focusedPlaceId={focusedPlaceId}
            onAdd={addCheckedPlace}
            onRemove={removeCheckedPlace}
            onToggleOpen={toggleCheckedPlace}
            onShowOnMap={showCheckedPlaceOnMap}
          />
        )}

        {/*
          Angedockt statt am Listenende: Bei drei Bedingungen mit je achtzig
          Treffern lag der einzige Knopf der App hunderte Pixel unterhalb des
          sichtbaren Randes. Die Statusleiste sitzt aus demselben Grund hier --
          beide gehoeren zum Rand des Fensters, nicht in den Fluss.
        */}
        <div
          className={
            activeTab === 'analysis' || activities.length > 0
              ? 'dock'
              : 'dock dock--empty'
          }
        >
          {activeTab === 'analysis' && (
            <PoiApplyBar
              busy={poiBusy}
              upToDate={alleAktuell}
              disabled={
                readyTargets.length === 0 ||
                selectedPlaces === 0 ||
                alleAktuell ||
                rechnetGerade
              }
              error={poiError}
              blocking={blocking}
              selectedPlaces={selectedPlaces}
              regionEmpty={poiRegionEmpty}
              onApply={() => void runAll()}
            />
          )}
          <StatusBar activities={activities} />
        </div>
      </aside>

      <main className="map-area">
        {mapStyles === null ? (
          <div className="map-placeholder">
            <p>{texts.map.loadFailed}</p>
            <p className="hint">{texts.map.loadFailedHint}</p>
          </div>
        ) : (
          <MapView
            styleUrl={appearance === 'dark' ? mapStyles.dark : mapStyles.light}
            targets={targets}
            intersection={intersection}
            poiRegion={poiRegion}
            checkedPlaces={checkedPlaces}
            placeVerdicts={verdicts}
            onPlaceOpen={openCheckedPlace}
            onPlaceClose={closeCheckedPlace}
            bounds={fitBounds}
            pois={pois}
            selectedKeys={selectedKeys}
            onPoiClick={(poi) => {
              setPopupPoiId(poi.id);
              setFocusedPoiIds(new Set([poi.id]));
            }}
            onPoiClose={() => {
              setPopupPoiId(null);
              setFocusedPoiIds(new Set());
            }}
            onPoiToggle={togglePoiFromMap}
            focusedPoiIds={focusedPoiIds}
            popupPoiId={popupPoiId}
            focus={mapFocus}
          />
        )}
      </main>

      {/* Eine Schicht für alle Sprechblasen -- siehe TooltipLayer.tsx. */}
      <TooltipLayer />
    </div>
  );
};
