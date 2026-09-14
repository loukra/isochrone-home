import { useEffect, useRef, useState } from 'react';
import {
  groupPois,
  groupSelectionOf,
  largestAreaOf,
  poiKeyOf,
  sortGroups,
  canSortByRelevance,
  type PoiGroup,
  type PoiSortMode,
} from './selection.js';
import { CATEGORY_COLORS } from './icons.js';
import { regionDistance } from './distance.js';
import {
  TRAVEL_MODES,
  type FoundPoi,
  type PoiCategory,
  type TravelMode,
} from '../types.js';
import { useTexts } from '../i18n/index.js';
import { Select, type SelectOption } from '../components/Select.js';
import { NumberField } from '../components/NumberField.js';
import { CaretIcon, CloseIcon } from '../components/icons.js';

export type PoiCondition = {
  category: PoiCategory;
  /**
   * Verkehrsmittel dieser Bedingung. Zum Supermarkt geht man vielleicht, ins
   * Schwimmbad fährt man -- ein einziger Schalter für die ganze App könnte das
   * nicht ausdrücken, genauso wenig wie bei den Zielen.
   */
  travelMode: TravelMode;
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
  onTravelModeChange: (mode: TravelMode) => void;
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
  onTravelModeChange,
  onSearch,
  onSortModeChange,
  onToggleGroup,
  onToggleMember,
  onFocusGroup,
  onFocusMember,
}: PoiConditionCardProps) => {
  const texts = useTexts();

  // Kurzform im Knopf, voller Name im Menü -- wie in der Zielkarte: Die Zeile
  // trägt daneben noch Suchradius und den Knopf "Orte suchen".
  const modeOptions: readonly SelectOption<TravelMode>[] = TRAVEL_MODES.map((mode) => ({
    value: mode,
    label: texts.travelModes[mode],
    shortLabel: texts.travelModesShort[mode],
  }));

  /*
   * "Große zuerst" steht nur dort, wo die Grundfläche etwas aussagt. Bei einem
   * Bahnhof sortierte sie danach, ob in OSM jemand ein Empfangsgebäude
   * eingezeichnet hat -- ein Haltepunkt mit getaggtem Häuschen stand damit über
   * dem Hauptbahnhof ohne. Ohne die Wahl entfällt auch das Menü: Ein Menü mit
   * einem Eintrag verspricht eine Entscheidung, die es nicht gibt.
   */
  const sortable = canSortByRelevance(condition.category);
  const sortOptions: readonly SelectOption<PoiSortMode>[] = [
    { value: 'relevance', label: texts.poi.sortByRelevance },
    { value: 'distance', label: texts.poi.sortByDistance },
  ];

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
          <span className="poi-cond__caret">
            <CaretIcon open={condition.open} />
          </span>
          <span
            className="dot"
            style={{ background: CATEGORY_COLORS[condition.category] }}
          />
          <span className="poi-cond__name">{texts.categories[condition.category]}</span>
          <span className="poi-cond__summary">
            {condition.minutes} {texts.poi.radiusUnit}{' '}
            {texts.travelModesShort[condition.travelMode]}
            {selectedCount > 0 ? texts.poi.selectedCount(selectedCount) : ''}
            {condition.busy
              ? texts.poi.searchingSuffix
              : condition.pois.length === 0
                ? texts.poi.notSearched
                : ''}
          </span>
        </button>
        <button
          type="button"
          className="poi-cond__remove"
          onClick={onRemove}
          aria-label={texts.poi.removeLabel(texts.categories[condition.category])}
        >
          <CloseIcon />
        </button>
      </div>

      {condition.open && (
        <div className="poi-cond__body">
          <div className="poi-controls">
            <NumberField
              className="numfield--radius"
              value={String(condition.minutes)}
              // Ein leeres Feld ergäbe NaN und damit einen Suchradius von
              // "keine Ahnung" -- dann lieber die alte Zahl stehen lassen.
              onChange={(raw) => {
                const parsed = Number.parseInt(raw, 10);
                if (Number.isInteger(parsed)) onMinutesChange(parsed);
              }}
              min={1}
              max={maxMinutes}
              label={texts.poi.radiusLabel(texts.categories[condition.category])}
              disabled={condition.busy}
            />
            <span>{texts.poi.radiusUnit}</span>
            <Select
              className="poi-cond__mode select--compact"
              value={condition.travelMode}
              options={modeOptions}
              onChange={onTravelModeChange}
              label={texts.poi.travelModeLabel(texts.categories[condition.category])}
              title={texts.travelModes[condition.travelMode]}
              disabled={condition.busy}
            />
            <button
              type="button"
              className="ghost"
              onClick={onSearch}
              disabled={condition.busy || !canSearch}
            >
              {condition.busy ? texts.poi.searching : texts.poi.search}
            </button>
          </div>

          {condition.error !== null && <p className="error">{condition.error}</p>}

          {blocking && <p className="error">{texts.poi.blocking}</p>}

          {condition.pois.length > 0 && (
            <>
              <div
                className={`poi-controls poi-controls--meta${stale}`}
                aria-busy={condition.busy}
              >
                <span className="hint">
                  {texts.poi.foundCount(condition.pois.length, groups.length)}
                </span>
                {sortable && (
                  <Select
                    className="poi-cond__sort select--quiet"
                    value={condition.sortMode}
                    options={sortOptions}
                    onChange={onSortModeChange}
                    label={texts.poi.sortLabel}
                  />
                )}
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
                  // `null` heisst "gilt als in der Region" -- siehe distance.ts.
                  const nearestDistance =
                    nearest === undefined
                      ? null
                      : regionDistance(nearest.distanceToRegionKm);
                  const many = group.members.length > 1;
                  const isOpen = expanded.has(group.key);
                  // OSM kennt für manche Orte keinen Namen. Der Platzhalter
                  // gehört in die Oberfläche, nicht in die Daten -- sonst
                  // stünde ein deutsches Wort auch im Englischen.
                  const label = group.label ?? texts.poi.unnamed;

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
                            aria-label={
                              isOpen
                                ? texts.poi.collapseBranches(label)
                                : texts.poi.expandBranches(label)
                            }
                          >
                            <CaretIcon open={isOpen} size={11} />
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
                          aria-label={label}
                        />
                        <button
                          type="button"
                          className="poi-row__label"
                          onClick={() => onFocusGroup(group)}
                        >
                          <span className="poi-row__name">
                            {label}
                            {many && (
                              <span className="poi-row__count">
                                {group.members.length}×
                              </span>
                            )}
                          </span>
                          <span className="poi-row__meta">
                            {nearestDistance === null
                              ? texts.poi.insideRegion
                              : texts.poi.outsideRegion(nearestDistance)}
                            {nearest?.sport != null ? ` · ${nearest.sport}` : ''}
                            {area !== null ? texts.poi.area(Math.round(area), many) : ''}
                          </span>
                        </button>
                      </div>

                      {many && isOpen && (
                        <ul className="poi-sublist">
                          {group.members.map((member) => {
                            const distance = regionDistance(member.distanceToRegionKm);

                            return (
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
                                  aria-label={texts.poi.memberLabel(
                                    member.name ?? texts.poi.unnamed,
                                    member.distanceToRegionKm.toFixed(1),
                                  )}
                                />
                                <button
                                  type="button"
                                  className="poi-row__label"
                                  onClick={() => onFocusMember(member)}
                                >
                                  <span className="poi-row__name">
                                    {member.name ?? texts.poi.unnamed}
                                  </span>
                                  <span className="poi-row__meta">
                                    {distance === null
                                      ? texts.poi.insideRegion
                                      : texts.poi.outsideRegion(distance)}
                                    {member.areaSquareMeters !== null
                                      ? texts.poi.area(
                                          Math.round(member.areaSquareMeters),
                                          false,
                                        )
                                      : ''}
                                  </span>
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ul>

              {sortable && condition.sortMode === 'relevance' && (
                <p className={`poi-sort-hint${stale}`}>{texts.poi.sortHint}</p>
              )}
            </>
          )}
        </div>
      )}
    </li>
  );
};
