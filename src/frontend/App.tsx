import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  analyze,
  ApiError,
  fetchIsochrone,
  fetchMapConfig,
  geocode,
  refinePoiRegion,
  searchPois,
} from './api.js';
import { unionBounds } from './bounds.js';
import { colorAt } from './colors.js';
import { TargetCard } from './forms/TargetCard.js';
import { TargetDraftForm, type DraftValues } from './forms/TargetDraftForm.js';
import { MapView } from './map/MapView.js';
import { StatusBar } from './StatusBar.js';
import { LocationCheckPanel } from './LocationCheckPanel.js';
import { PoiPanel } from './poi/PoiPanel.js';
import { PoiApplyBar } from './poi/PoiApplyBar.js';
import { CATEGORY_LABELS_PLURAL, type PoiCondition } from './poi/PoiConditionCard.js';
import {
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
  PoiCategory,
  Target,
  TravelMode,
} from './types.js';

type AnalysisState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'done'; result: AnalysisResponse; stale: boolean }
  | { kind: 'error'; message: string };

const messageOf = (error: unknown): string =>
  error instanceof ApiError
    ? error.message
    : 'Es ist ein unerwarteter Fehler aufgetreten.';

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
  sortMode: 'relevance',
});

/** Einmalig beim Start gelesen, damit ein Reload die Ziele nicht verwirft. */
const restored = loadState();
const restoredSelection = loadPoiSelection();

export const App = () => {
  const [activeTab, setActiveTab] = useState<'analysis' | 'location-check'>('analysis');
  const [mapStyleUrl, setMapStyleUrl] = useState<string | null>(null);
  /** Die im Tab "Orte prüfen" gesammelten Adressen; überleben den Reload. */
  const [checkedPlaces, setCheckedPlaces] = useState<CheckedPlace[]>(
    restored?.checkedPlaces ?? [],
  );
  /** Providerabhaengige Obergrenze; kommt aus der Backend-Konfiguration. */
  const [maxMinutes, setMaxMinutes] = useState(60);
  const [targets, setTargets] = useState<Target[]>(restored?.targets ?? []);
  const [colorCursor, setColorCursor] = useState(restored?.colorCursor ?? 0);

  const [draftOpen, setDraftOpen] = useState((restored?.targets.length ?? 0) === 0);
  const [draftBusy, setDraftBusy] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<GeocodingCandidate[]>([]);
  const [pendingDraft, setPendingDraft] = useState<DraftValues | null>(null);

  const [conditions, setConditions] = useState<PoiCondition[]>(() =>
    restored?.pois !== null && restored?.pois !== undefined
      ? restored.pois.conditions.map((condition) => ({
          category: condition.category,
          travelMode: condition.travelMode,
          minutes: condition.minutes,
          open: condition.open,
          sortMode: condition.sortMode,
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
        setMapStyleUrl(config.mapStyleUrl);
        setMaxMinutes(config.maxTravelTimeMinutes);
      })
      .catch(() => setMapStyleUrl(null));
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
            ? { ...item, status: 'error', error: messageOf(error) }
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

  const toggleCheckedPlace = useCallback((id: string) => {
    setCheckedPlaces((current) =>
      current.map((place) => (place.id === id ? { ...place, open: !place.open } : place)),
    );
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
              `Die Adresse "${values.address}" konnte nicht gefunden werden.`,
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
        setDraftError(messageOf(error));
      } finally {
        setDraftBusy(false);
      }
    },
    [colorCursor, loadIsochrone, markAnalysisStale],
  );

  const removeTarget = useCallback(
    (id: string) => {
      setTargets((current) => current.filter((target) => target.id !== id));
      markAnalysisStale();
    },
    [markAnalysisStale],
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
      setAnalysis({ kind: 'error', message: messageOf(error) });
    }
  }, [readyTargets]);

  const intersection =
    analysis.kind === 'done' && !analysis.stale ? analysis.result.intersection : null;

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
        patchCondition(category, { busy: false, error: messageOf(error) });
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
      setConditions((current) => [...current, angelegt]);

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
  const focusGroup = useCallback((group: PoiGroup) => {
    const ids = group.members.map((member) => member.id);
    setFocusedPoiIds((current) => {
      const same = ids.length === current.size && ids.every((id) => current.has(id));
      return same ? new Set() : new Set(ids);
    });
    setPopupPoiId(null);
  }, []);

  const focusMember = useCallback((poi: FoundPoi) => {
    setPopupPoiId((current) => (current === poi.id ? null : poi.id));
    setFocusedPoiIds((current) =>
      current.size === 1 && current.has(poi.id) ? new Set() : new Set([poi.id]),
    );
  }, []);

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
      setPoiError(messageOf(error));
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
   * Der Zustand der Analyse als *eine* Zeile. Frueher stand hier je Fall ein
   * eigenes Absatz-Element; waehrend gerechnet wurde, traf keiner zu und die
   * Seitenleiste sprang.
   */
  const analysisLine: { text: string; tone: 'hint' | 'error' | 'success' } =
    readyTargets.length === 0
      ? { text: 'Füge mindestens ein Ziel hinzu.', tone: 'hint' }
      : analysis.kind === 'error'
        ? { text: analysis.message, tone: 'error' }
        : analysis.kind !== 'done'
          ? { text: 'Gemeinsame Region wird berechnet…', tone: 'hint' }
          : analysis.stale
            ? { text: 'Die Ziele haben sich geändert.', tone: 'hint' }
            : analysis.result.intersection === null
              ? {
                  text: 'Für diese Anforderungen wurde keine gemeinsame Region gefunden.',
                  tone: 'error',
                }
              : { text: 'Gemeinsame Region gefunden.', tone: 'success' };

  const activities = [
    ...targets
      .filter((target) => target.status === 'loading')
      .map((target) => `Isochrone für ${target.name} wird berechnet…`),
    ...(analysis.kind === 'loading' ? ['Gemeinsame Region wird berechnet…'] : []),
    ...conditions
      .filter((condition) => condition.busy)
      .map(
        (condition) => `${CATEGORY_LABELS_PLURAL[condition.category]} werden gesucht…`,
      ),
    ...(poiBusy ? ['Erreichbarkeit der gewählten Orte wird geprüft…'] : []),
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
    <div className="layout">
      <aside className="sidebar">
        <header>
          <h1>Location Optimizer</h1>
          <p className="subtitle">
            Ziele setzen, Isochronen ansehen, gemeinsame Region analysieren.
          </p>
        </header>

        <nav className="sidebar-tabs" aria-label="Bereiche" role="tablist">
          <button
            type="button"
            role="tab"
            className={
              activeTab === 'analysis' ? 'sidebar-tab sidebar-tab--active' : 'sidebar-tab'
            }
            aria-selected={activeTab === 'analysis'}
            onClick={() => setActiveTab('analysis')}
          >
            Analyse
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
            Orte prüfen
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
                  onRemove={removeTarget}
                  onChangeMinutes={changeMinutes}
                  onChangeTravelMode={changeTravelMode}
                  onToggleVisible={toggleVisible}
                  onRetry={retry}
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
                  + Ziel hinzufügen
                </button>
              )}
            </section>

            <section className="analysis">
              {/*
                Genau eine Zeile, immer -- nie keine. Ein Abschnitt, der
                zwischendurch leer wird, zieht alles darunter nach oben und
                schiebt es einen Wimpernschlag spaeter wieder zurueck.
              */}
              <p className={`analysis__line ${analysisLine.tone}`}>{analysisLine.text}</p>
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
              onToggleOpen={(category) => {
                const current = conditions.find((item) => item.category === category);
                if (current !== undefined)
                  patchCondition(category, { open: !current.open });
              }}
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
            intersection={intersection}
            poiRegion={poiRegion}
            targets={readyTargets}
            places={checkedPlaces}
            onAdd={addCheckedPlace}
            onRemove={removeCheckedPlace}
            onToggleOpen={toggleCheckedPlace}
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
        {mapStyleUrl === null ? (
          <div className="map-placeholder">
            <p>Karte kann nicht geladen werden.</p>
            <p className="hint">Läuft das Backend? (npm run dev)</p>
          </div>
        ) : (
          <MapView
            styleUrl={mapStyleUrl}
            targets={targets}
            intersection={intersection}
            poiRegion={poiRegion}
            checkedPlaces={checkedPlaces}
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
          />
        )}
      </main>
    </div>
  );
};
