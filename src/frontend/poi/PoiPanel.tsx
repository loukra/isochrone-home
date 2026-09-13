import {
  CATEGORY_LABELS,
  PoiConditionCard,
  type PoiCondition,
} from './PoiConditionCard.js';
import type { PoiGroup, PoiSortMode } from './selection.js';
import type { FoundPoi, PoiCategory } from '../types.js';

const ALL_CATEGORIES = Object.keys(CATEGORY_LABELS) as PoiCategory[];

type PoiPanelProps = {
  conditions: PoiCondition[];
  selectedKeys: Set<string>;
  focusedPoiIds: ReadonlySet<string>;
  maxMinutes: number;
  canSearch: boolean;
  /** Bedingungen, die für sich allein nichts übrig lassen. */
  blocking: PoiCategory[];
  onAdd: (category: PoiCategory) => void;
  onRemove: (category: PoiCategory) => void;
  onToggleOpen: (category: PoiCategory) => void;
  onMinutesChange: (category: PoiCategory, minutes: number) => void;
  onSearch: (category: PoiCategory) => void;
  onSortModeChange: (category: PoiCategory, mode: PoiSortMode) => void;
  onToggleGroup: (group: PoiGroup) => void;
  onToggleMember: (group: PoiGroup, poi: FoundPoi) => void;
  onFocusGroup: (group: PoiGroup) => void;
  onFocusMember: (poi: FoundPoi) => void;
};

export const PoiPanel = ({
  conditions,
  selectedKeys,
  focusedPoiIds,
  maxMinutes,
  canSearch,
  blocking,
  onAdd,
  onRemove,
  onToggleOpen,
  onMinutesChange,
  onSearch,
  onSortModeChange,
  onToggleGroup,
  onToggleMember,
  onFocusGroup,
  onFocusMember,
}: PoiPanelProps) => {
  const used = new Set(conditions.map((condition) => condition.category));
  const available = ALL_CATEGORIES.filter((category) => !used.has(category));

  return (
    <section className="pois">
      <h2>Was brauche ich in der Nähe?</h2>

      {!canSearch && (
        <p className="hint">
          Erst analysieren — die Suche braucht eine gemeinsame Region.
        </p>
      )}

      <ul className="poi-conds">
        {conditions.map((condition) => (
          <PoiConditionCard
            key={condition.category}
            condition={condition}
            selectedKeys={selectedKeys}
            focusedPoiIds={focusedPoiIds}
            maxMinutes={maxMinutes}
            canSearch={canSearch}
            blocking={blocking.includes(condition.category)}
            onToggleOpen={() => onToggleOpen(condition.category)}
            onRemove={() => onRemove(condition.category)}
            onMinutesChange={(minutes) => onMinutesChange(condition.category, minutes)}
            onSearch={() => onSearch(condition.category)}
            onSortModeChange={(mode) => onSortModeChange(condition.category, mode)}
            onToggleGroup={onToggleGroup}
            onToggleMember={onToggleMember}
            onFocusGroup={onFocusGroup}
            onFocusMember={onFocusMember}
          />
        ))}
      </ul>

      {available.length > 0 && (
        <div className="poi-controls">
          <select
            value=""
            onChange={(event) => {
              if (event.target.value !== '') onAdd(event.target.value as PoiCategory);
            }}
            aria-label="Bedingung hinzufügen"
          >
            <option value="">+ Bedingung hinzufügen</option>
            {available.map((category) => (
              <option key={category} value={category}>
                {CATEGORY_LABELS[category]}
              </option>
            ))}
          </select>
        </div>
      )}

    </section>
  );
};
