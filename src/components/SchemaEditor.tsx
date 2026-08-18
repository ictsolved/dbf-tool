import { useState } from 'react';
import type { DbfFieldType, EditableField } from '../lib/dbf/types';
import { FIELD_TYPE_LABELS, makeEditableField } from '../lib/dbf/types';

const TYPE_OPTIONS = (Object.keys(FIELD_TYPE_LABELS) as DbfFieldType[]).map((value) => ({
  value,
  label: `${FIELD_TYPE_LABELS[value]} (${value})`,
}));

export function SchemaEditor({
  fields,
  onChange,
}: {
  fields: EditableField[];
  onChange: (fields: EditableField[]) => void;
}) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // Adding another blank field while one is already unnamed just piles up
  // fields that all collide as duplicate "" names -- make the user name
  // the current one first.
  const hasEmptyName = fields.some((f) => f.name === '');

  const update = (index: number, patch: Partial<EditableField>) => {
    const next = fields.slice();
    next[index] = { ...next[index], ...patch };
    onChange(next);
  };
  const remove = (index: number) => {
    onChange(fields.filter((_, i) => i !== index));
  };
  const add = () => {
    onChange([...fields, makeEditableField()]);
  };
  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= fields.length) return;
    const next = fields.slice();
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };
  const reorder = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return;
    const next = fields.slice();
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    onChange(next);
  };

  return (
    <div className="schema-editor">
      <div className="schema-head">
        <div></div>
        <div>Field name</div>
        <div>Type</div>
        <div>Length</div>
        <div>Decimals</div>
        <div></div>
      </div>
      {fields.map((f, i) => (
        <div
          className={`schema-row ${dragOverIndex === i ? 'drag-over' : ''}`}
          key={f.id}
          onDragOver={(e) => { if (dragIndex !== null) { e.preventDefault(); setDragOverIndex(i); } }}
          onDragLeave={() => setDragOverIndex((prev) => (prev === i ? null : prev))}
          onDrop={(e) => {
            e.preventDefault();
            setDragOverIndex(null);
            if (dragIndex !== null) reorder(dragIndex, i);
            setDragIndex(null);
          }}
        >
          <span className="move-cell">
            <span
              className="drag-handle"
              draggable
              onDragStart={() => setDragIndex(i)}
              onDragEnd={() => { setDragIndex(null); setDragOverIndex(null); }}
              title="Drag to reorder"
              aria-hidden="true"
            >⠿</span>
            <span className="move-arrows">
              <button type="button" className="move-btn" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move field up">▲</button>
              <button type="button" className="move-btn" disabled={i === fields.length - 1} onClick={() => move(i, 1)} aria-label="Move field down">▼</button>
            </span>
          </span>
          <input
            value={f.name}
            placeholder="FIELD_NAME"
            maxLength={10}
            onChange={(e) => update(i, { name: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '') })}
          />
          <select value={f.type} onChange={(e) => update(i, { type: e.target.value as DbfFieldType })}>
            {TYPE_OPTIONS.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
          <input
            type="number"
            min={1}
            value={f.length}
            disabled={f.type === 'D' || f.type === 'L'}
            onChange={(e) => update(i, { length: parseInt(e.target.value, 10) || 1 })}
          />
          <input
            type="number"
            min={0}
            value={f.decimals}
            disabled={f.type !== 'N' && f.type !== 'F'}
            onChange={(e) => update(i, { decimals: parseInt(e.target.value, 10) || 0 })}
          />
          <button type="button" className="btn small danger" onClick={() => remove(i)}>✕</button>
        </div>
      ))}
      <button
        type="button"
        className="btn small"
        style={{ alignSelf: 'flex-start', marginTop: 4 }}
        disabled={hasEmptyName}
        title={hasEmptyName ? 'Name the current field before adding another' : undefined}
        onClick={add}
      >
        + Add field
      </button>
    </div>
  );
}
