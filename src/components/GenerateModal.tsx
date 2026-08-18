import { useState } from 'react';
import type { DbfField, DbfRow } from '../lib/dbf/types';
import { generateGenericRows, validateFormula, type GenRules } from '../lib/dbf/genericFill';
import { FieldRulesEditor } from './FieldRulesEditor';

export function GenerateModal({
  fields,
  onGenerate,
  onClose,
}: {
  fields: DbfField[];
  onGenerate: (rows: DbfRow[]) => void;
  onClose: () => void;
}) {
  const [error, setError] = useState('');
  const [count, setCount] = useState(20);
  const [seed, setSeed] = useState('');
  const [rules, setRules] = useState<GenRules>({});

  const runGenerate = () => {
    setError('');
    try {
      for (const f of fields) {
        const rule = rules[f.name];
        if (rule?.mode === 'formula' && rule.formula) {
          const err = validateFormula(rule.formula, f.name, fields);
          if (err) throw new Error(err);
        }
      }
      const parsedSeed = seed === '' ? undefined : parseInt(seed, 10);
      onGenerate(generateGenericRows(fields, count, parsedSeed, rules));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Generate rows</h2>
        <div className="modal-sub">Appends to the current file. Nothing existing is removed.</div>

        <div className="field-group-row">
          <div className="field-group">
            <label>Row count</label>
            <input type="number" min={1} value={count} onChange={(e) => setCount(parseInt(e.target.value, 10) || 1)} />
          </div>
          <div className="field-group">
            <label>Seed (optional)</label>
            <input type="number" value={seed} onChange={(e) => setSeed(e.target.value)} placeholder="e.g. 42" />
          </div>
        </div>
        <div className="field-group">
          <label>
            Per-field rules <span style={{ opacity: .7 }}>("Formula" can reference any field declared earlier in the schema, e.g. <code>QTY * PRICE</code>)</span>
          </label>
          <FieldRulesEditor fields={fields} rules={rules} onChange={setRules} />
        </div>

        {error && <div className="error-list"><div>{error}</div></div>}

        <div className="modal-actions">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={runGenerate}>Generate</button>
        </div>
      </div>
    </div>
  );
}
