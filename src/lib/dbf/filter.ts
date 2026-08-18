import type { DbfField, DbfFieldType, DbfRow } from './types';

export function cellToText(field: DbfField, value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  }
  if (field.type === 'L') return value ? 'T' : 'F';
  return String(value);
}

export type FilterOp =
  | 'contains' | 'not_contains' | 'starts_with' | 'ends_with'
  | 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'between'
  | 'is_true' | 'is_false'
  | 'is_empty' | 'is_not_empty';

export interface FilterCondition {
  op: FilterOp;
  value?: string;
  value2?: string; // 'between' only
}

// A field only appears here once the user picks an operator for it -- an
// absent entry means "no condition on this column", so RowFilters stays
// empty by default instead of every column carrying a blank condition.
export type RowFilters = Record<string, FilterCondition>;

const TEXT_OPS: FilterOp[] = ['contains', 'not_contains', 'eq', 'neq', 'starts_with', 'ends_with', 'is_empty', 'is_not_empty'];
const NUMERIC_OPS: FilterOp[] = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'between', 'is_empty', 'is_not_empty'];
const DATE_OPS: FilterOp[] = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'between', 'is_empty', 'is_not_empty'];
const LOGICAL_OPS: FilterOp[] = ['is_true', 'is_false'];

export function operatorsForType(type: DbfFieldType): FilterOp[] {
  if (type === 'N' || type === 'F') return NUMERIC_OPS;
  if (type === 'D') return DATE_OPS;
  if (type === 'L') return LOGICAL_OPS;
  return TEXT_OPS;
}

const BASE_LABELS: Record<FilterOp, string> = {
  contains: 'Contains',
  not_contains: 'Does not contain',
  starts_with: 'Starts with',
  ends_with: 'Ends with',
  eq: 'Equals',
  neq: 'Not equals',
  gt: 'Greater than',
  gte: 'Greater than or equal',
  lt: 'Less than',
  lte: 'Less than or equal',
  between: 'Between',
  is_true: 'Is true',
  is_false: 'Is false',
  is_empty: 'Is empty',
  is_not_empty: 'Is not empty',
};

const DATE_LABELS: Partial<Record<FilterOp, string>> = {
  gt: 'After',
  gte: 'On or after',
  lt: 'Before',
  lte: 'On or before',
};

export function operatorLabel(op: FilterOp, type: DbfFieldType): string {
  if (type === 'D' && DATE_LABELS[op]) return DATE_LABELS[op]!;
  return BASE_LABELS[op];
}

export function operatorNeedsValue(op: FilterOp): 0 | 1 | 2 {
  if (op === 'between') return 2;
  if (op === 'is_true' || op === 'is_false' || op === 'is_empty' || op === 'is_not_empty') return 0;
  return 1;
}

function parseDateValue(raw?: string): number | null {
  if (!raw) return null;
  const [y, m, d] = raw.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d).getTime();
}

export function matchesCondition(field: DbfField, rawValue: unknown, cond: FilterCondition): boolean {
  const isEmpty = rawValue === null || rawValue === undefined || rawValue === '';
  if (cond.op === 'is_empty') return isEmpty;
  if (cond.op === 'is_not_empty') return !isEmpty;
  if (cond.op === 'is_true') return Boolean(rawValue) === true;
  if (cond.op === 'is_false') return Boolean(rawValue) === false;

  if (field.type === 'N' || field.type === 'F') {
    if (isEmpty) return false;
    const num = rawValue as number;
    const v1 = cond.value === undefined || cond.value === '' ? NaN : Number(cond.value);
    if (Number.isNaN(v1)) return true; // operator picked but no value typed yet -- don't hide rows
    switch (cond.op) {
      case 'eq': return num === v1;
      case 'neq': return num !== v1;
      case 'gt': return num > v1;
      case 'gte': return num >= v1;
      case 'lt': return num < v1;
      case 'lte': return num <= v1;
      case 'between': {
        const v2 = cond.value2 === undefined || cond.value2 === '' ? NaN : Number(cond.value2);
        if (Number.isNaN(v2)) return true;
        return num >= Math.min(v1, v2) && num <= Math.max(v1, v2);
      }
      default: return true;
    }
  }

  if (field.type === 'D') {
    if (isEmpty) return false;
    const d = (rawValue as Date).getTime();
    const v1 = parseDateValue(cond.value);
    if (v1 === null) return true;
    switch (cond.op) {
      case 'eq': return d === v1;
      case 'neq': return d !== v1;
      case 'gt': return d > v1;
      case 'gte': return d >= v1;
      case 'lt': return d < v1;
      case 'lte': return d <= v1;
      case 'between': {
        const v2 = parseDateValue(cond.value2);
        if (v2 === null) return true;
        return d >= Math.min(v1, v2) && d <= Math.max(v1, v2);
      }
      default: return true;
    }
  }

  const text = cellToText(field, rawValue).toLowerCase();
  const needle = (cond.value ?? '').toLowerCase();
  if (needle === '') return true;
  switch (cond.op) {
    case 'contains': return text.includes(needle);
    case 'not_contains': return !text.includes(needle);
    case 'eq': return text === needle;
    case 'neq': return text !== needle;
    case 'starts_with': return text.startsWith(needle);
    case 'ends_with': return text.endsWith(needle);
    default: return true;
  }
}

// Shared between the grid (which shows only matching rows) and Fill column
// (which can target only matching rows) -- one filter definition, two
// different uses of the same subset of row indices.
export function filterRowIndices(rows: DbfRow[], fields: DbfField[], filters: RowFilters): number[] {
  const active = Object.entries(filters);
  const all = rows.map((_, i) => i);
  if (active.length === 0) return all;
  return all.filter((i) =>
    active.every(([fieldName, cond]) => {
      const field = fields.find((f) => f.name === fieldName);
      if (!field) return true;
      return matchesCondition(field, rows[i][fieldName], cond);
    }),
  );
}
