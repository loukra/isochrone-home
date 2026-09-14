import { PoiConditionCard, type PoiCondition } from './PoiConditionCard.js';
import { useTexts } from '../i18n/index.js';
import { Select } from '../components/Select.js';
import { POI_CATEGORIES } from '../types.js';
import type { PoiGroup, PoiSortMode } from './selection.js';
import type { FoundPoi, PoiCategory, TravelMode } from '../types.js';

const ALL_CATEGORIES: readonly PoiCategory[] = POI_CATEGORIES;

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
  onTravelModeChange: (category: PoiCategory, mode: TravelMode) => void;
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
  onTravelModeChange,
  onSearch,
  onSortModeChange,
  onToggleGroup,
  onToggleMember,
  onFocusGroup,
  onFocusMember,
}: PoiPanelProps) => {
  const texts = useTexts();
  const used = new Set(conditions.map((condition) => condition.category));
  const available = ALL_CATEGORIES.filter((category) => !used.has(category));

  return (
    <section className="pois">
      <h2>{texts.poi.heading}</h2>

      {!canSearch && (
        <p className="hint">{texts.poi.needsRegion}</p>
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
            onTravelModeChange={(mode) => onTravelModeChange(condition.category, mode)}
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
          {/*
            Kein Zustand, sondern eine Aktion: Der Wert bleibt `null`, im Knopf
            steht dauerhaft die Aufforderung, und das Anklicken einer Kategorie
            legt die Bedingung an.
          */}
          <Select
            className="select--block"
            value={null}
            options={available.map((category) => ({
              value: category,
              label: texts.categories[category],
            }))}
            onChange={onAdd}
            label={texts.poi.addCondition}
            placeholder={texts.poi.addConditionOption}
          />
        </div>
      )}

    </section>
  );
};
