import type { DbfField } from '../lib/dbf/types';
import type { FilterCondition, FilterOp } from '../lib/dbf/filter';
import { operatorLabel, operatorNeedsValue, operatorsForType } from '../lib/dbf/filter';

export function ColumnFilter({
  field,
  condition,
  onChange,
}: {
  field: DbfField;
  condition: FilterCondition | undefined;
  onChange: (condition: FilterCondition | null) => void;
}) {
  const op = condition?.op;
  const needsValue = op ? operatorNeedsValue(op) : 0;
  const valueInputType = field.type === 'D' ? 'date' : field.type === 'N' || field.type === 'F' ? 'number' : 'text';

  return (
    <div className="col-filter" onClick={(e) => e.stopPropagation()}>
      <select
        className="filter-select"
        value={op ?? 'any'}
        onChange={(e) => {
          const nextOp = e.target.value as FilterOp | 'any';
          if (nextOp === 'any') { onChange(null); return; }
          onChange({ op: nextOp, value: condition?.value, value2: condition?.value2 });
        }}
      >
        <option value="any">Any</option>
        {operatorsForType(field.type).map((o) => (
          <option key={o} value={o}>{operatorLabel(o, field.type)}</option>
        ))}
      </select>
      {needsValue >= 1 && (
        <input
          className="filter-value"
          type={valueInputType}
          placeholder={needsValue === 2 ? 'from' : 'value'}
          value={condition?.value ?? ''}
          onChange={(e) => onChange({ op: op!, value: e.target.value, value2: condition?.value2 })}
        />
      )}
      {needsValue === 2 && (
        <input
          className="filter-value"
          type={valueInputType}
          placeholder="to"
          value={condition?.value2 ?? ''}
          onChange={(e) => onChange({ op: op!, value: condition?.value, value2: e.target.value })}
        />
      )}
    </div>
  );
}
