import { useState } from 'react';
import type { DbfField, DbfRow } from '../lib/dbf/types';
import { generateColumnValues, validateFillFormula, type FieldGenRule, type GenRuleMode } from '../lib/dbf/genericFill';
import { MODE_OPTIONS, RuleConfigInputs } from './FieldRulesEditor';

export function FillColumnModal({
  fields,
  rows,
  selected,
  filteredIndices,
  hasActiveFilters,
  onApply,
  onClose,
}: {
  fields: DbfField[];
  rows: DbfRow[];
  selected: Set<number>;
  filteredIndices: number[];
  hasActiveFilters: boolean;
  onApply: (fieldName: string, targetIndices: number[], values: DbfRow[string][]) => void;
  onClose: () => void;
}) {
  const [fieldName, setFieldName] = useState(fields[0]?.name ?? '');
  const [rule, setRule] = useState<FieldGenRule>({ mode: 'random' });
  const [seed, setSeed] = useState('');
  const [scope, setScope] = useState<'all' | 'selected' | 'filtered'>(
    selected.size > 0 ? 'selected' : hasActiveFilters ? 'filtered' : 'all',
  );
  const [error, setError] = useState('');

  const field = fields.find((f) => f.name === fieldName);

  const formulaError =
    field && rule.mode === 'formula' && rule.formula ? validateFillFormula(rule.formula, field.name, fields) : null;

  const runFill = () => {
    if (!field) return;
    setError('');
    try {
      if (rule.mode === 'formula' && rule.formula) {
        const err = validateFillFormula(rule.formula, field.name, fields);
        if (err) throw new Error(err);
      }
      const targetIndices =
        scope === 'selected'
          ? Array.from(selected).sort((a, b) => a - b)
          : scope === 'filtered'
            ? filteredIndices
            : rows.map((_, i) => i);
      const parsedSeed = seed === '' ? undefined : parseInt(seed, 10);
      const values = generateColumnValues(field, rows, targetIndices, rule, parsedSeed);
      onApply(field.name, targetIndices, values);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Fill column</h2>
        <div className="modal-sub">Regenerates values for one column on your existing rows. Other columns are untouched.</div>

        <div className="field-group-row">
          <div className="field-group">
            <label>Column</label>
            <select value={fieldName} onChange={(e) => { setFieldName(e.target.value); setRule({ mode: 'random' }); }}>
              {fields.map((f) => (
                <option key={f.name} value={f.name}>{f.name} ({f.type})</option>
              ))}
            </select>
          </div>
          <div className="field-group">
            <label>Mode</label>
            <select value={rule.mode} onChange={(e) => setRule({ mode: e.target.value as GenRuleMode })}>
              {MODE_OPTIONS.map((m) => (
                <option key={m.value} value={m.value} disabled={m.value === 'sequence' && field && field.type !== 'N' && field.type !== 'F'}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {field && (
          <div className="field-group">
            <label>Config</label>
            <RuleConfigInputs field={field} rule={rule} onChange={(patch) => setRule({ ...rule, ...patch })} formulaError={formulaError} />
          </div>
        )}

        {rule.mode === 'random' && (
          <div className="field-group">
            <label>Seed (optional)</label>
            <input type="number" value={seed} onChange={(e) => setSeed(e.target.value)} placeholder="e.g. 42" />
          </div>
        )}

        <div className="field-group">
          <label>Apply to</label>
          <div className="radio-row">
            <label>
              <input type="radio" checked={scope === 'all'} onChange={() => setScope('all')} />
              All rows ({rows.length})
            </label>
            <label>
              <input type="radio" disabled={selected.size === 0} checked={scope === 'selected'} onChange={() => setScope('selected')} />
              Selected rows only ({selected.size})
            </label>
            <label>
              <input type="radio" disabled={!hasActiveFilters} checked={scope === 'filtered'} onChange={() => setScope('filtered')} />
              Rows matching active filters ({filteredIndices.length})
            </label>
          </div>
          {!hasActiveFilters && (
            <div className="rules-hint">Set a filter in the grid's Filters panel to enable this option.</div>
          )}
        </div>

        {rule.mode === 'sequence' && (
          <div className="rules-hint">
            Sequence follows the rows' current order (top to bottom) -- handy for renumbering a serial-number column after reordering rows.
          </div>
        )}

        {error && <div className="error-list"><div>{error}</div></div>}

        <div className="modal-actions">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={!field || rows.length === 0} onClick={runFill}>Fill</button>
        </div>
      </div>
    </div>
  );
}
