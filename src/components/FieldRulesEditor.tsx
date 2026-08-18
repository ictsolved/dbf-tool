import type { DbfField } from '../lib/dbf/types';
import type { FieldGenRule, GenRuleMode, GenRules } from '../lib/dbf/genericFill';
import { validateFormula } from '../lib/dbf/genericFill';

export const MODE_OPTIONS: { value: GenRuleMode; label: string }[] = [
  { value: 'random', label: 'Random' },
  { value: 'fixed', label: 'Fixed value' },
  { value: 'sequence', label: 'Sequence' },
  { value: 'formula', label: 'Formula' },
];

// One field's rule config inputs -- shared by the multi-row editor below
// and FillColumnModal's single-field version, since both need the exact
// same mode-dependent inputs (min/max, fixed value, sequence, formula).
export function RuleConfigInputs({
  field,
  rule,
  onChange,
  formulaError,
}: {
  field: DbfField;
  rule: FieldGenRule;
  onChange: (patch: Partial<FieldGenRule>) => void;
  formulaError?: string | null;
}) {
  return (
    <>
      {rule.mode === 'random' && (field.type === 'N' || field.type === 'F') && (
        <div className="rules-inline">
          <input type="number" placeholder="min" value={rule.min ?? ''} onChange={(e) => onChange({ min: e.target.value === '' ? undefined : Number(e.target.value) })} />
          <input type="number" placeholder="max" value={rule.max ?? ''} onChange={(e) => onChange({ max: e.target.value === '' ? undefined : Number(e.target.value) })} />
        </div>
      )}
      {rule.mode === 'random' && field.type !== 'N' && field.type !== 'F' && (
        <span className="rules-hint">random {field.type === 'D' ? 'date within the last year' : field.type === 'L' ? 'true/false' : 'sample text'}</span>
      )}
      {rule.mode === 'fixed' && (
        <input
          placeholder="value"
          value={rule.fixedValue ?? ''}
          onChange={(e) => onChange({ fixedValue: e.target.value })}
        />
      )}
      {rule.mode === 'sequence' && (
        <div className="rules-inline">
          <input type="number" placeholder="start (1)" value={rule.seqStart ?? ''} onChange={(e) => onChange({ seqStart: e.target.value === '' ? undefined : Number(e.target.value) })} />
          <input type="number" placeholder="step (1)" value={rule.seqStep ?? ''} onChange={(e) => onChange({ seqStep: e.target.value === '' ? undefined : Number(e.target.value) })} />
        </div>
      )}
      {rule.mode === 'formula' && (
        <>
          <input
            className="mono"
            placeholder="e.g. QTY * PRICE"
            value={rule.formula ?? ''}
            onChange={(e) => onChange({ formula: e.target.value })}
          />
          {formulaError && <div className="rules-hint error">{formulaError}</div>}
        </>
      )}
    </>
  );
}

export function FieldRulesEditor({
  fields,
  rules,
  onChange,
}: {
  fields: DbfField[];
  rules: GenRules;
  onChange: (rules: GenRules) => void;
}) {
  const update = (name: string, patch: Partial<FieldGenRule>) => {
    onChange({ ...rules, [name]: { ...(rules[name] ?? { mode: 'random' }), ...patch } });
  };

  return (
    <div className="rules-editor">
      <div className="rules-head">
        <div>Field</div>
        <div>Mode</div>
        <div>Config</div>
      </div>
      {fields.map((f) => {
        const rule = rules[f.name] ?? { mode: 'random' as GenRuleMode };
        const formulaError =
          rule.mode === 'formula' && rule.formula ? validateFormula(rule.formula, f.name, fields) : null;
        return (
          <div className="rules-row" key={f.name}>
            <div className="rules-field-name mono">
              {f.name} <span className="type-tag">{f.type}</span>
            </div>
            <select
              value={rule.mode}
              onChange={(e) => update(f.name, { mode: e.target.value as GenRuleMode })}
            >
              {MODE_OPTIONS.map((m) => (
                <option
                  key={m.value}
                  value={m.value}
                  disabled={m.value === 'sequence' && f.type !== 'N' && f.type !== 'F'}
                >
                  {m.label}
                </option>
              ))}
            </select>
            <div>
              <RuleConfigInputs
                field={f}
                rule={rule}
                onChange={(patch) => update(f.name, patch)}
                formulaError={formulaError}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
