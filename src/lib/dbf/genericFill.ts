// Type-aware (but domain-agnostic) random row filler -- works for any
// schema, unlike a template's smartGenerate(). Used both for arbitrary
// user-defined schemas and as a quick way to pad an existing file with
// more rows without caring what the columns mean.
//
// Per-field generation rules let a value depend on other columns (e.g.
// AMOUNT = RATE * VOLUME_LT) without needing a template's hardcoded JS --
// a 'formula' rule is a plain JS expression evaluated with every field
// declared *earlier* in the schema available as a variable. Fields are
// generated in declaration order for exactly this reason: a formula can
// only see values that already exist.
import type { DbfField, DbfRow } from './types';
import { makeRng, rngChoice, rngInt, type Rng } from './random';

const SAMPLE_WORDS = ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot', 'golf', 'hotel'];

export type GenRuleMode = 'random' | 'fixed' | 'formula' | 'sequence';

export interface FieldGenRule {
  mode: GenRuleMode;
  min?: number; // random, N/F only
  max?: number; // random, N/F only
  fixedValue?: string; // fixed -- raw text, coerced to the field's type
  formula?: string; // formula -- JS expression referencing earlier field names
  seqStart?: number; // sequence
  seqStep?: number; // sequence
}

export type GenRules = Record<string, FieldGenRule>;

const JS_RESERVED = new Set(['true', 'false', 'null', 'undefined', 'if', 'else', 'return', 'this', 'new', 'in', 'of', 'typeof', 'instanceof']);
// Identifiers a formula may reference beyond earlier field names -- the
// Math object and its own members, plus a few global constructors that are
// occasionally useful (Number(...), parseInt(...), etc).
const ALLOWED_GLOBALS = new Set([
  'Math', 'Number', 'String', 'Boolean', 'parseInt', 'parseFloat',
  'abs', 'round', 'floor', 'ceil', 'max', 'min', 'pow', 'sqrt', 'random', 'log', 'exp',
  'sin', 'cos', 'tan', 'E', 'PI', 'LN2', 'LN10',
]);

/**
 * Heuristic check (identifier-level, not a full parser) that a formula only
 * references fields declared before it, plus Math/allowed globals. Run
 * before generating so a typo or forward reference surfaces immediately
 * instead of throwing mid-batch.
 */
export function validateFormula(expr: string, fieldName: string, fields: DbfField[]): string | null {
  const fieldIndex = fields.findIndex((f) => f.name === fieldName);
  const earlierNames = new Set(fields.slice(0, fieldIndex).map((f) => f.name));
  const idents = expr.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? [];
  for (const id of idents) {
    if (JS_RESERVED.has(id) || ALLOWED_GLOBALS.has(id) || earlierNames.has(id)) continue;
    return `"${id}" is not a field declared earlier than ${fieldName} (formulas can only reference earlier fields).`;
  }
  return null;
}

function evalFormula(expr: string, valuesSoFar: DbfRow, field: DbfField): unknown {
  const names = Object.keys(valuesSoFar);
  const args = names.map((n) => {
    const v = valuesSoFar[n];
    return v instanceof Date ? v.getTime() : v;
  });
  let result: unknown;
  try {
    // Safe in this context: the tool is static/serverless and a formula only
    // ever runs in the author's own browser tab on their own data -- same
    // trust boundary as typing into devtools, not a cross-user injection risk.
    // eslint-disable-next-line no-new-func
    const fn = new Function(...names, 'Math', `"use strict"; return (${expr});`);
    result = fn(...args, Math);
  } catch (e) {
    throw new Error(`Formula for ${field.name} ("${expr}") failed: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (field.type === 'N' || field.type === 'F') {
    const num = Number(result);
    if (Number.isNaN(num)) throw new Error(`Formula for ${field.name} did not produce a number (got "${result}").`);
    const factor = 10 ** (field.decimals || 0);
    return Math.round(num * factor) / factor;
  }
  if (field.type === 'D') {
    return result instanceof Date ? result : new Date(result as string | number);
  }
  return result;
}

function coerceFixedValue(field: DbfField, raw: string): unknown {
  if (field.type === 'N' || field.type === 'F') return raw === '' ? 0 : Number(raw);
  if (field.type === 'L') return raw.toLowerCase() === 'true' || raw.toLowerCase() === 't';
  if (field.type === 'D') return raw ? new Date(raw) : null;
  return raw;
}

function randomValueFor(field: DbfField, rng: Rng, rule?: FieldGenRule): unknown {
  switch (field.type) {
    case 'C': {
      const word = rngChoice(rng, SAMPLE_WORDS);
      return word.slice(0, field.length);
    }
    case 'N':
    case 'F': {
      const intDigits = field.decimals > 0 ? field.length - field.decimals - 1 : field.length;
      const defaultMax = Math.max(1, 10 ** Math.max(0, intDigits) - 1);
      const min = rule?.min ?? 0;
      const max = rule?.max ?? defaultMax;
      const value = rngInt(rng, min, max);
      return field.decimals > 0 ? value + Math.floor(rng() * 100) / 100 : value;
    }
    case 'D': {
      const daysAgo = rngInt(rng, 0, 365);
      const d = new Date();
      d.setDate(d.getDate() - daysAgo);
      return d;
    }
    case 'L':
      return rng() > 0.5;
    default:
      return null;
  }
}

export function generateGenericRows(fields: DbfField[], count: number, seed?: number, rules?: GenRules): DbfRow[] {
  const rng = makeRng(seed);
  const rows: DbfRow[] = [];
  const seqCounters: Record<string, number> = {};

  for (let i = 0; i < count; i++) {
    const row: DbfRow = {};
    for (const f of fields) {
      const rule = rules?.[f.name];
      if (rule?.mode === 'fixed') {
        row[f.name] = coerceFixedValue(f, rule.fixedValue ?? '') as DbfRow[string];
      } else if (rule?.mode === 'sequence') {
        const start = rule.seqStart ?? 1;
        const step = rule.seqStep ?? 1;
        seqCounters[f.name] = seqCounters[f.name] === undefined ? start : seqCounters[f.name] + step;
        row[f.name] = seqCounters[f.name];
      } else if (rule?.mode === 'formula' && rule.formula) {
        row[f.name] = evalFormula(rule.formula, row, f) as DbfRow[string];
      } else {
        row[f.name] = randomValueFor(f, rng, rule) as DbfRow[string];
      }
    }
    rows.push(row);
  }
  return rows;
}

/**
 * Fills one column across a set of already-existing rows, leaving every
 * other column untouched. Unlike generateGenericRows (which builds whole
 * new rows left-to-right so a formula can only see earlier fields), every
 * other column already has a value here -- so a formula may reference any
 * other field in the row, not just ones declared earlier in the schema.
 */
export function generateColumnValues(
  field: DbfField,
  rows: DbfRow[],
  targetIndices: number[],
  rule: FieldGenRule,
  seed?: number,
): DbfRow[string][] {
  const rng = makeRng(seed);
  const start = rule.seqStart ?? 1;
  const step = rule.seqStep ?? 1;

  return targetIndices.map((rowIndex, i) => {
    if (rule.mode === 'fixed') {
      return coerceFixedValue(field, rule.fixedValue ?? '') as DbfRow[string];
    }
    if (rule.mode === 'sequence') {
      return (start + step * i) as DbfRow[string];
    }
    if (rule.mode === 'formula' && rule.formula) {
      const { [field.name]: _current, ...otherValues } = rows[rowIndex];
      return evalFormula(rule.formula, otherValues, field) as DbfRow[string];
    }
    return randomValueFor(field, rng, rule) as DbfRow[string];
  });
}

/**
 * Same forward-reference check as validateFormula, but a fill-column
 * formula may reference any *other* field in the row (all of them already
 * have values) -- only self-reference is disallowed.
 */
export function validateFillFormula(expr: string, fieldName: string, fields: DbfField[]): string | null {
  const others = fields.filter((f) => f.name !== fieldName);
  return validateFormula(expr, fieldName, [...others, fields.find((f) => f.name === fieldName)!]);
}

export function blankValueFor(field: DbfField): DbfRow[string] {
  return field.type === 'N' || field.type === 'F' ? 0 : field.type === 'L' ? false : field.type === 'D' ? null : '';
}

export function blankRow(fields: DbfField[]): DbfRow {
  const row: DbfRow = {};
  for (const f of fields) {
    row[f.name] = blankValueFor(f);
  }
  return row;
}
