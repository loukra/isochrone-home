import { useEffect, useRef, useState } from 'react';
import {
  groupPois,
  groupSelectionOf,
  largestAreaOf,
  poiKeyOf,
  sortGroups,
  type PoiGroup,
  type PoiSortMode,
} from './selection.js';
import { CATEGORY_COLORS } from './icons.js';
import type { FoundPoi, PoiCategory } from '../types.js';

/**
 * Die Reihenfolge hier ist die Reihenfolge im Auswahlmenü: erst der Alltag,
 * den man täglich fährt, dann Kinder, dann das Gelegentliche.
 *
 * "Kita" steht für Krippe, Kindergarten und Hort zusammen: OSM kennt für
 * Kita und Kindergarten nur `amenity=kindergarten`, zwei Einträge lieferten
 * also zweimal dieselbe Liste. Ein Name wie "Kita & Kindergarten" wäre
 * ehrlicher, bricht aber in der Kartenkopfzeile auf zwei Zeilen, während
 * jede andere Bedingung einzeilig bleibt -- und die Trefferliste zeigt mit
 * "Ev. Kindergarten ..." ohnehin sofort, was darin steckt.
 */
export const CATEGORY_LABELS: Record<PoiCategory, string> = {
  supermarket: 'Supermarkt',
  station: 'Bahnhof',
  kindergarten: 'Kita',
  school: 'Schule',
  doctor: 'Arztpraxis',
  gym: 'Fitnessstudio',
  pool: 'Schwimmbad',
};

/** Deutsche Mehrzahl ist unregelmäßig -- kein angehängtes "e" tut es. */
export const CATEGORY_LABELS_PLURAL: Record<PoiCategory, string> = {
  supermarket: 'Supermärkte',
  station: 'Bahnhöfe',
  kindergarten: 'Kitas',
  school: 'Schulen',
  doctor: 'Arztpraxen',
  gym: 'Fitnessstudios',
  pool: 'Schwimmbäder',
};

export type PoiCondition = {
  category: PoiCategory;
  minutes: number;
  pois: FoundPoi[];
  busy: boolean;
  error: string | null;
  open: boolean;
  sortMode: PoiSortMode;
};

type PoiConditionCardProps = {
  condition: PoiCondition;
  selectedKeys: Set<string>;
  focusedPoiIds: ReadonlySet<string>;
  maxMinutes: number;
  canSearch: boolean;
  /** Aus der letzten Berechnung: Diese Bedingung allein lässt nichts übrig. */
  blocking: boolean;
  onToggleOpen: () => void;
  onRemove: () => void;
  onMinutesChange: (minutes: number) => void;
  onSearch: () => void;
  onSortModeChange: (mode: PoiSortMode) => void;
  onToggleGroup: (group: PoiGroup) => void;
  onToggleMember: (group: PoiGroup, poi: FoundPoi) => void;
  /** Ganze Kette hervorheben -- ohne Info-Box, die gilt einem einzelnen Ort. */
  onFocusGroup: (group: PoiGroup) => void;
  onFocusMember: (poi: FoundPoi) => void;
};

export const PoiConditionCard = ({
  condition,
  selectedKeys,
  focusedPoiIds,
  maxMinutes,
  canSearch,
  blocking,
  onToggleOpen,
  onRemove,
  onMinutesChange,
  onSearch,
  onSortModeChange,
  onToggleGroup,
  onToggleMember,
  onFocusGroup,
  onFocusMember,
}: PoiConditionCardProps) => {
  const groups = sortGroups(groupPois(condition.pois), condition.sortMode);
  const selectedCount = groups.filter(
    (group) => groupSelectionOf(group, selectedKeys) !== 'none',
  ).length;
  const focusedRowRef = useRef<HTMLDivElement | null>(null);
  // Waehrend einer Suche bleibt die vorige Liste stehen und wird nur
  // abgeblendet -- sie zu entfernen und gleich wieder aufzubauen schiebt alles
  // darunter hin und her. Anklickbar ist sie dabei nicht: Die Zahlen gehoeren
  // noch zum alten Radius.
  const stale = condition.busy && condition.pois.length > 0 ? ' is-stale' : '';
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());

  const toggleExpanded = (key: string): void => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Bei achtzig Einträgen liegt die markierte Zeile sonst außerhalb des
  // sichtbaren Bereichs -- der Klick auf den Kartenpunkt bliebe wirkungslos.
  useEffect(() => {
    focusedRowRef.current?.scrollIntoView({ block: 'nearest' });
  }, [focusedPoiIds]);

  return (
    <li className={blocking ? 'poi-cond poi-cond--blocking' : 'poi-cond'}>
      <div className="poi-cond__head">
        <button
          type="button"
          className="poi-cond__toggle"
          onClick={onToggleOpen}
          aria-expanded={condition.open}
        >
          <span className="poi-cond__caret">{condition.open ? '▼' : '►'}</span>
          <span
            className="dot"
            style={{ background: CATEGORY_COLORS[condition.category] }}
          />
          <span className="poi-cond__name">{CATEGORY_LABELS[condition.category]}</span>
          <span className="poi-cond__summary">
            {condition.minutes} Min.
            {selectedCount > 0 ? ` · ${selectedCount} gewählt` : ''}
            {condition.busy
              ? ' · sucht…'
              : condition.pois.length === 0
                ? ' · nicht gesucht'
                : ''}
          </span>
        </button>
        <button
          type="button"
          className="poi-cond__remove"
          onClick={onRemove}
          aria-label={`${CATEGORY_LABELS[condition.category]} entfernen`}
        >
          ×
        </button>
      </div>

      {condition.open && (
        <div className="poi-cond__body">
          <div className="poi-controls">
            <input
              type="number"
              min={1}
              max={maxMinutes}
              value={condition.minutes}
              onChange={(event) =>
                onMinutesChange(Number.parseInt(event.target.value, 10))
              }
              disabled={condition.busy}
              aria-label={`Fahrzeit ${CATEGORY_LABELS[condition.category]}`}
            />
            <span>Min.</span>
            <button
              type="button"
              onClick={onSearch}
              disabled={condition.busy || !canSearch}
            >
              {condition.busy ? 'Suche…' : 'Orte suchen'}
            </button>
          </div>

          {condition.error !== null && <p className="error">{condition.error}</p>}

          {blocking && (
            <p className="error">
              Diese Bedingung allein lässt nichts von der gemeinsamen Region übrig.
            </p>
          )}

          {condition.pois.length > 0 && (
            <>
              <div className={`poi-controls${stale}`} aria-busy={condition.busy}>
                <span className="hint">
                  {condition.pois.length} gefunden, {groups.length} Einträge
                </span>
                <select
                  value={condition.sortMode}
                  onChange={(event) =>
                    onSortModeChange(event.target.value as PoiSortMode)
                  }
                  aria-label="Sortierung"
                >
                  <option value="relevance">Große zuerst</option>
                  <option value="distance">Nächste zuerst</option>
                </select>
              </div>

              <ul className={`poi-list${stale}`} aria-busy={condition.busy}>
                {groups.map((group) => {
                  const nearest = group.members[0];
                  const state = groupSelectionOf(group, selectedKeys);
                  // Angeklickt werden kann jede Filiale, nicht nur die nächste.
                  const focused = group.members.some((member) =>
                    focusedPoiIds.has(member.id),
                  );
                  // Die Sortierung wertet die größte Filiale -- also muss die
                  // Zeile auch deren Fläche zeigen, sonst steht sie
                  // unbegründet oben.
                  const area = largestAreaOf(group);
                  const many = group.members.length > 1;
                  const isOpen = expanded.has(group.key);

                  return (
                    <li key={group.key}>
                      <div
                        ref={focused ? focusedRowRef : null}
                        className={focused ? 'poi-row poi-row--focused' : 'poi-row'}
                      >
                        {many ? (
                          <button
                            type="button"
                            className="poi-row__expand"
                            onClick={() => toggleExpanded(group.key)}
                            aria-expanded={isOpen}
                            aria-label={`Filialen von ${group.label} ${
                              isOpen ? 'einklappen' : 'ausklappen'
                            }`}
                          >
                            {isOpen ? '▼' : '►'}
                          </button>
                        ) : (
                          // Platzhalter, damit alle Namen auf einer Linie stehen.
                          <span className="poi-row__expand poi-row__expand--empty" />
                        )}

                        <input
                          type="checkbox"
                          checked={state === 'all'}
                          // Teilauswahl ist weder an noch aus -- der Strich sagt
                          // das, ohne dass eine dritte Spalte nötig wäre.
                          ref={(node) => {
                            if (node !== null) node.indeterminate = state === 'some';
                          }}
                          onChange={() => onToggleGroup(group)}
                          aria-label={group.label}
                        />
                        <button
                          type="button"
                          className="poi-row__label"
                          onClick={() => onFocusGroup(group)}
                        >
                          <span className="poi-row__name">
                            {group.label}
                            {many && (
                              <span className="poi-row__count">
                                {group.members.length}×
                              </span>
                            )}
                          </span>
                          <span className="poi-row__meta">
                            {nearest === undefined || nearest.distanceToRegionKm === 0
                              ? 'in der Region'
                              : `${nearest.distanceToRegionKm.toFixed(1)} km außerhalb`}
                            {nearest?.sport != null ? ` · ${nearest.sport}` : ''}
                            {area !== null
                              ? ` · ${many ? 'bis ' : ''}${Math.round(area)} m²`
                              : ''}
                          </span>
                        </button>
                      </div>

                      {many && isOpen && (
                        <ul className="poi-sublist">
                          {group.members.map((member) => (
                            <li
                              key={member.id}
                              className={
                                focusedPoiIds.has(member.id)
                                  ? 'poi-row poi-row--sub poi-row--focused'
                                  : 'poi-row poi-row--sub'
                              }
                            >
                              <input
                                type="checkbox"
                                checked={
                                  state === 'all' || selectedKeys.has(poiKeyOf(member))
                                }
                                onChange={() => onToggleMember(group, member)}
                                aria-label={`${member.name} (${member.distanceToRegionKm.toFixed(1)} km)`}
                              />
                              <button
                                type="button"
                                className="poi-row__label"
                                onClick={() => onFocusMember(member)}
                              >
                                <span className="poi-row__name">{member.name}</span>
                                <span className="poi-row__meta">
                                  {member.distanceToRegionKm === 0
                                    ? 'in der Region'
                                    : `${member.distanceToRegionKm.toFixed(1)} km außerhalb`}
                                  {member.areaSquareMeters !== null
                                    ? ` · ${Math.round(member.areaSquareMeters)} m²`
                                    : ''}
                                </span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ul>

              {condition.sortMode === 'relevance' && (
                <p className={`hint${stale}`}>
                  Oben: belegt große Fläche, dann Ketten, dann Unbekanntes. Nichts wird
                  ausgeblendet — OSM kennt die Größe nur für einen Teil.
                </p>
              )}
            </>
          )}
        </div>
      )}
    </li>
  );
};
