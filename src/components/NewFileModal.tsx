import { useState } from 'react';
import type { EditableField } from '../lib/dbf/types';
import { makeEditableField } from '../lib/dbf/types';
import { validateFields } from '../lib/dbf/write';
import { SchemaEditor } from './SchemaEditor';

export function NewFileModal({
  onCreate,
  onClose,
}: {
  onCreate: (fields: EditableField[]) => void;
  onClose: () => void;
}) {
  const [fields, setFields] = useState<EditableField[]>([makeEditableField()]);

  const errors = validateFields(fields);
  // A field that's simply blank so far isn't a mistake to flag -- it just
  // means the user hasn't typed a name yet. Still counted in `errors` so
  // Create stays disabled, but not shown as a scary red message on an
  // otherwise-untouched field.
  const displayErrors = errors.filter((e) => !/^Field name "" is invalid/.test(e));

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>New file</h2>
        <div className="modal-sub">Define the fields for your new .dbf file.</div>

        <SchemaEditor fields={fields} onChange={setFields} />

        {displayErrors.length > 0 && (
          <div className="error-list">
            {displayErrors.map((e, i) => <div key={i}>{e}</div>)}
          </div>
        )}

        <div className="modal-actions">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button
            className="btn primary"
            disabled={errors.length > 0}
            onClick={() => onCreate(fields)}
          >
            Create
          </button>
        </div>
      </div>
    </div>
  );
}
