import { useCallback, useEffect, useMemo, useState } from 'react';
import { analyze, ApiError, fetchIsochrone, fetchMapConfig, geocode } from './api.js';
import { unionBounds } from './bounds.js';
import { colorAt } from './colors.js';
import { TargetCard } from './forms/TargetCard.js';
import { TargetDraftForm, type DraftValues } from './forms/TargetDraftForm.js';
import { MapView } from './map/MapView.js';
import type { AnalysisResponse, GeocodingCandidate, Target } from './types.js';

type AnalysisState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'done'; result: AnalysisResponse; stale: boolean }
  | { kind: 'error'; message: string };

const messageOf = (error: unknown): string =>
  error instanceof ApiError
    ? error.message
    : 'Es ist ein unerwarteter Fehler aufgetreten.';

export const App = () => {
  const [mapStyleUrl, setMapStyleUrl] = useState<string | null>(null);
  /** Providerabhaengige Obergrenze; kommt aus der Backend-Konfiguration. */
  const [maxMinutes, setMaxMinutes] = useState(60);
  const [targets, setTargets] = useState<Target[]>([]);
  const [colorCursor, setColorCursor] = useState(0);

  const [draftOpen, setDraftOpen] = useState(true);
  const [draftBusy, setDraftBusy] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<GeocodingCandidate[]>([]);
  const [pendingDraft, setPendingDraft] = useState<DraftValues | null>(null);

  const [analysis, setAnalysis] = useState<AnalysisState>({ kind: 'idle' });

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
          color: colorAt(colorCursor),
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
      setAnalysis({ kind: 'error', message: messageOf(error) });
    }
  }, [readyTargets]);

  const intersection =
    analysis.kind === 'done' && !analysis.stale ? analysis.result.intersection : null;

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

        <section className="targets">
          {targets.map((target) => (
            <TargetCard
              key={target.id}
              target={target}
              maxMinutes={maxMinutes}
              onRemove={removeTarget}
              onChangeMinutes={changeMinutes}
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
          <button
            type="button"
            className="primary"
            onClick={() => void runAnalysis()}
            disabled={readyTargets.length === 0 || analysis.kind === 'loading'}
          >
            {analysis.kind === 'loading' ? 'Analysiere…' : 'Analysieren'}
          </button>

          {readyTargets.length === 0 && (
            <p className="hint">Füge mindestens ein Ziel hinzu, um zu analysieren.</p>
          )}

          {analysis.kind === 'error' && <p className="error">{analysis.message}</p>}

          {analysis.kind === 'done' && analysis.stale && (
            <p className="hint">
              Die Ziele haben sich geändert. Analysiere erneut für ein aktuelles Ergebnis.
            </p>
          )}

          {analysis.kind === 'done' && !analysis.stale && (
            <p className={analysis.result.intersection === null ? 'error' : 'success'}>
              {analysis.result.intersection === null
                ? 'Für diese Anforderungen wurde keine gemeinsame Region gefunden.'
                : 'Gemeinsame Region gefunden.'}
            </p>
          )}
        </section>
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
            bounds={fitBounds}
          />
        )}
      </main>
    </div>
  );
};
