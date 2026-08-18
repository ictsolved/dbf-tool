import { useState } from 'react';
import type { DbfRow, EditableField } from '../lib/dbf/types';
import { validateFields } from '../lib/dbf/write';
import { blankValueFor } from '../lib/dbf/genericFill';
import { SchemaEditor } from './SchemaEditor';

/**
 * Adds/renames/removes columns on the file that's already open, migrating
 * existing row data along the way. Fields are matched by their stable `id`
 * (not name or position), so a rename carries a field's data over from its
 * old key to the new one instead of losing it; a genuinely new field (no
 * matching id in the original schema) gets a blank value in every row, and
 * a removed field's data is simply left out of the rebuilt rows.
 */
export function EditSchemaModal({
  fields,
  rows,
  onApply,
  onClose,
}: {
  fields: EditableField[];
  rows: DbfRow[];
  onApply: (fields: EditableField[], rows: DbfRow[]) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<EditableField[]>(fields.map((f) => ({ ...f })));

  const errors = validateFields(draft);
  // A newly-added field that's simply blank so far isn't a mistake to flag
  // -- it just means the user hasn't typed a name yet. Still counted in
  // `errors` so Apply stays disabled, but not shown as a scary red message
  // on an otherwise-untouched field.
  const displayErrors = errors.filter((e) => !/^Field name "" is invalid/.test(e));

  const apply = () => {
    const originalById = new Map(fields.map((f) => [f.id, f]));
    const newRows = rows.map((row) => {
      const newRow: DbfRow = {};
      for (const f of draft) {
        const original = originalById.get(f.id);
        newRow[f.name] = original ? row[original.name] : blankValueFor(f);
      }
      return newRow;
    });
    onApply(draft, newRows);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Edit columns</h2>
        <div className="modal-sub">
          Add, rename, or remove fields. Existing data is kept for renamed fields; new fields start blank; removed fields' data is dropped.
        </div>

        <SchemaEditor fields={draft} onChange={setDraft} />

        {displayErrors.length > 0 && (
          <div className="error-list">
            {displayErrors.map((e, i) => <div key={i}>{e}</div>)}
          </div>
        )}

        <div className="modal-actions">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={errors.length > 0} onClick={apply}>Apply</button>
        </div>
      </div>
    </div>
  );
}
