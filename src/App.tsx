import { useEffect, useMemo, useRef, useState } from 'react';
import type { DbfRow, EditableField } from './lib/dbf/types';
import { readDbf } from './lib/dbf/read';
import { downloadDbf, validateFields, writeDbf } from './lib/dbf/write';
import { blankRow } from './lib/dbf/genericFill';
import { filterRowIndices, type RowFilters } from './lib/dbf/filter';
import { DataGrid } from './components/DataGrid';
import { NewFileModal } from './components/NewFileModal';
import { GenerateModal } from './components/GenerateModal';
import { FillColumnModal } from './components/FillColumnModal';
import { EditSchemaModal } from './components/EditSchemaModal';
import { plural } from './lib/plural';
import './App.css';

interface Msg { type: 'ok' | 'err' | 'warn'; text: string }

function App() {
  const [fields, setFields] = useState<EditableField[] | null>(null);
  const [rows, setRows] = useState<DbfRow[]>([]);
  const [filename, setFilename] = useState('');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [msg, setMsg] = useState<Msg | null>(null);
  const [showNewModal, setShowNewModal] = useState(false);
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [showFillColumnModal, setShowFillColumnModal] = useState(false);
  const [showEditSchemaModal, setShowEditSchemaModal] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [addRowCount, setAddRowCount] = useState(1);
  const [filters, setFilters] = useState<RowFilters>({});
  const [showFilters, setShowFilters] = useState(false);
  const [dirty, setDirty] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const hasFile = fields !== null;

  const filteredIndices = useMemo(
    () => (fields ? filterRowIndices(rows, fields, filters) : []),
    [rows, fields, filters],
  );

  useEffect(() => {
    if (!msg) return;
    const duration = msg.type === 'err' ? 6000 : 4000;
    const t = setTimeout(() => setMsg(null), duration);
    return () => clearTimeout(t);
  }, [msg]);

  // Number inputs are everywhere here (grid cells, schema/rule editors,
  // toolbar counters) -- a single global listener disables the scroll-wheel
  // and up/down-arrow-key step behavior on all of them, rather than wiring
  // the same two handlers onto every individual <input type="number">.
  useEffect(() => {
    const isNumberInput = (el: EventTarget | null): el is HTMLInputElement =>
      el instanceof HTMLInputElement && el.type === 'number';

    const onWheel = (e: WheelEvent) => {
      if (isNumberInput(e.target)) e.target.blur();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (isNumberInput(e.target) && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        e.preventDefault();
      }
    };

    document.addEventListener('wheel', onWheel, { passive: true });
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('wheel', onWheel);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  // Warn before a refresh/close throws away unsaved work -- there's no
  // autosave, so a reload would silently lose it. Only fires once something
  // has actually changed since the file was opened/created or last saved,
  // not just because a file happens to be open.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  const openFile = (file: File) => {
    if (!file.name.toLowerCase().endsWith('.dbf')) {
      setMsg({ type: 'err', text: 'Only .dbf files are supported.' });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const bytes = new Uint8Array(reader.result as ArrayBuffer);
        const table = readDbf(bytes);
        setFields(table.fields.map((f) => ({ ...f, id: crypto.randomUUID() })));
        setRows(table.rows);
        setFilename(file.name);
        setSelected(new Set());
        setFilters({});
        setShowFilters(false);
        setDirty(false);
        setMsg({
          type: 'ok',
          text: `Opened "${file.name}": ${plural(table.rows.length, 'record')}, ${plural(table.fields.length, 'field')}.`,
        });
      } catch (e) {
        setMsg({ type: 'err', text: `Failed to parse "${file.name}": ${e instanceof Error ? e.message : String(e)}` });
      }
    };
    reader.onerror = () => setMsg({ type: 'err', text: `Failed to read "${file.name}".` });
    reader.readAsArrayBuffer(file);
  };

  const onFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) openFile(e.target.files[0]);
    e.target.value = '';
  };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files?.[0]) openFile(e.dataTransfer.files[0]);
  };

  const createNewFile = (newFields: EditableField[]) => {
    setFields(newFields);
    setRows([]);
    setFilename('untitled.dbf');
    setSelected(new Set());
    setFilters({});
    setShowFilters(false);
    setShowNewModal(false);
    setDirty(true);
    setMsg({ type: 'ok', text: `Created a new file with ${plural(newFields.length, 'field')}.` });
  };

  const changeCell = (rowIndex: number, fieldName: string, value: unknown) => {
    setRows((prev) => {
      const next = prev.slice();
      next[rowIndex] = { ...next[rowIndex], [fieldName]: value as DbfRow[string] };
      return next;
    });
    setDirty(true);
  };

  const toggleSelect = (rowIndex: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(rowIndex)) next.delete(rowIndex);
      else next.add(rowIndex);
      return next;
    });
  };

  const addRow = () => {
    if (!fields) return;
    const count = Math.max(1, addRowCount || 1);
    setRows((prev) => [...prev, ...Array.from({ length: count }, () => blankRow(fields))]);
    setDirty(true);
    setMsg({ type: 'ok', text: `Added ${plural(count, 'blank row')}.` });
  };

  const deleteSelected = () => {
    if (selected.size === 0) return;
    setRows((prev) => prev.filter((_, i) => !selected.has(i)));
    setSelected(new Set());
    setDirty(true);
  };

  // Each clone is inserted directly after its own source row (not appended
  // at the end) -- a single left-to-right pass naturally handles cloning
  // several, possibly non-contiguous, selected rows without needing to
  // reason about how earlier insertions shift later indices.
  const cloneSelected = () => {
    if (selected.size === 0) return;
    const newRows: DbfRow[] = [];
    const newSelected: number[] = [];
    rows.forEach((row, i) => {
      newRows.push(row);
      if (selected.has(i)) {
        newRows.push({ ...row });
        newSelected.push(newRows.length - 1);
      }
    });
    setRows(newRows);
    setSelected(new Set(newSelected));
    setDirty(true);
    setMsg({ type: 'ok', text: `Cloned ${plural(newSelected.length, 'row')}.` });
  };

  // Takes two explicit original-array indices (not "direction") since the
  // grid may be filtered/sorted -- the row a user sees as "the one above"
  // isn't necessarily array-adjacent, so the grid resolves that itself and
  // just tells us which two positions to swap.
  const moveRow = (indexA: number, indexB: number) => {
    setRows((prev) => {
      const next = prev.slice();
      [next[indexA], next[indexB]] = [next[indexB], next[indexA]];
      return next;
    });
    // The two rows' contents just swapped, so "is this row selected" has to
    // travel with them too -- swap the selection flags at the two
    // positions rather than toggling each independently.
    setSelected((prev) => {
      const aWasSelected = prev.has(indexA);
      const bWasSelected = prev.has(indexB);
      if (aWasSelected === bWasSelected) return prev;
      const next = new Set(prev);
      if (bWasSelected) next.add(indexA); else next.delete(indexA);
      if (aWasSelected) next.add(indexB); else next.delete(indexB);
      return next;
    });
    setDirty(true);
  };

  // Drag-and-drop reordering: unlike moveRow's adjacent swap, this actually
  // relocates one row to an arbitrary position, shifting everything between
  // the two positions by one. Selection has to be remapped through the same
  // permutation the rows go through, not just swapped at two positions.
  const reorderRow = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return;
    setRows((prev) => {
      const next = prev.slice();
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
    setSelected((prev) => {
      if (prev.size === 0) return prev;
      const order = rows.map((_, i) => i);
      const [movedIndex] = order.splice(fromIndex, 1);
      order.splice(toIndex, 0, movedIndex);
      const oldToNew = new Array(order.length);
      order.forEach((oldIndex, newPos) => { oldToNew[oldIndex] = newPos; });
      return new Set(Array.from(prev, (oldIndex) => oldToNew[oldIndex]));
    });
    setDirty(true);
  };

  const clearAll = () => {
    if (rows.length === 0) return;
    if (!window.confirm(`Delete all ${plural(rows.length, 'row')}? The schema is kept.`)) return;
    setRows([]);
    setSelected(new Set());
    setDirty(true);
  };

  const applySchemaChange = (newFields: EditableField[], newRows: DbfRow[]) => {
    setFields(newFields);
    setRows(newRows);
    setSelected(new Set());
    setShowEditSchemaModal(false);
    setDirty(true);
    setMsg({ type: 'ok', text: `Schema updated: ${plural(newFields.length, 'field')}.` });
  };

  const appendGenerated = (newRows: DbfRow[]) => {
    setRows((prev) => [...prev, ...newRows]);
    setShowGenerateModal(false);
    setDirty(true);
    setMsg({ type: 'ok', text: `Added ${plural(newRows.length, 'generated row')}.` });
  };

  const fillColumn = (fieldName: string, targetIndices: number[], values: DbfRow[string][]) => {
    setRows((prev) => {
      const next = prev.slice();
      targetIndices.forEach((rowIndex, i) => {
        next[rowIndex] = { ...next[rowIndex], [fieldName]: values[i] };
      });
      return next;
    });
    setShowFillColumnModal(false);
    setDirty(true);
    setMsg({ type: 'ok', text: `Filled ${fieldName} for ${plural(targetIndices.length, 'row')}.` });
  };

  const save = () => {
    if (!fields) return;
    const errs = validateFields(fields);
    if (errs.length > 0) {
      setMsg({ type: 'err', text: errs.join(' ') });
      return;
    }
    try {
      const bytes = writeDbf(fields, rows);
      downloadDbf(bytes, filename || 'untitled.dbf');
      setDirty(false);
      setMsg({ type: 'ok', text: `Downloaded "${filename || 'untitled.dbf'}": ${plural(rows.length, 'record')}.` });
    } catch (e) {
      setMsg({ type: 'err', text: e instanceof Error ? e.message : String(e) });
    }
  };

  const closeFile = () => {
    if (dirty && !window.confirm('Close this file? Unsaved changes will be lost.')) return;
    setFields(null);
    setRows([]);
    setFilename('');
    setSelected(new Set());
    setFilters({});
    setShowFilters(false);
    setDirty(false);
    setMsg(null);
  };

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <svg className="app-logo" width="24" height="24" viewBox="0 0 32 32" aria-hidden="true">
            <defs>
              <linearGradient id="logo-g" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
                <stop offset="0" stopColor="#4f8cff" />
                <stop offset="1" stopColor="#7c5cff" />
              </linearGradient>
            </defs>
            <rect x="2" y="2" width="28" height="28" rx="7" fill="#171a21" />
            <rect x="2" y="2" width="28" height="28" rx="7" fill="none" stroke="url(#logo-g)" strokeWidth="2" />
            <rect x="8" y="8" width="16" height="16" rx="1.5" fill="none" stroke="url(#logo-g)" strokeWidth="1.8" />
            <line x1="8" y1="13.3" x2="24" y2="13.3" stroke="url(#logo-g)" strokeWidth="1.5" />
            <line x1="8" y1="18.6" x2="24" y2="18.6" stroke="url(#logo-g)" strokeWidth="1.5" />
            <line x1="13.3" y1="8" x2="13.3" y2="24" stroke="url(#logo-g)" strokeWidth="1.5" />
            <line x1="18.6" y1="8" x2="18.6" y2="24" stroke="url(#logo-g)" strokeWidth="1.5" />
          </svg>
          <div className="brand-text">
            <h1>DBF Tool</h1>
          </div>
        </div>

        <div className="header-file-actions">
          <button className="btn primary" onClick={() => setShowNewModal(true)}>+ New</button>
          <button className="btn" onClick={() => fileInputRef.current?.click()}>Open</button>
          <input ref={fileInputRef} type="file" accept=".dbf" style={{ display: 'none' }} onChange={onFileInputChange} />
        </div>

        <div className="header-right">
          {hasFile && (
            <>
              <span className="file-info" title={`${filename}: ${plural(rows.length, 'row')}, ${plural(fields!.length, 'field')}`}>
                {filename}: {plural(rows.length, 'row')}, {plural(fields!.length, 'field')}
              </span>
              <button className="btn primary" onClick={save}>Download</button>
              <button className="btn" onClick={closeFile}>Close</button>
            </>
          )}
          <a
            className="github-link"
            href="https://github.com/ictsolved/dbf-tool"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="View source on GitHub"
          >
            <svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
            </svg>
          </a>
        </div>
      </header>

      {hasFile && (
        <div className="toolbar">
          <div className="toolbar-group">
            <span className="add-row-group">
              <input
                type="number"
                min={1}
                className="add-row-count"
                value={addRowCount}
                onChange={(e) => setAddRowCount(parseInt(e.target.value, 10) || 1)}
                aria-label="Number of rows to add"
              />
              <button className="btn" onClick={addRow}>+ Row{addRowCount > 1 ? `s` : ''}</button>
            </span>
            <button className="btn" onClick={() => setShowGenerateModal(true)}>Generate rows</button>
            <button className="btn" disabled={rows.length === 0} onClick={() => setShowFillColumnModal(true)}>Fill column</button>
          </div>

          <div className="toolbar-divider" />

          <div className="toolbar-group">
            <button className="btn" onClick={() => setShowEditSchemaModal(true)}>Edit columns</button>
          </div>

          <div className="toolbar-divider" />

          <div className="toolbar-group">
            <button className="btn danger" disabled={rows.length === 0} onClick={clearAll}>Clear all rows</button>
          </div>

          {selected.size > 0 && (
            <>
              <div className="toolbar-divider" />
              <div className="toolbar-group">
                <button className="btn" onClick={cloneSelected}>
                  Clone selected ({selected.size})
                </button>
                <button className="btn danger" onClick={deleteSelected}>
                  Delete selected ({selected.size})
                </button>
              </div>
            </>
          )}

          <div className="toolbar-group toolbar-right">
            <button
              className={`btn ${Object.keys(filters).length > 0 ? 'primary' : ''}`}
              onClick={() => setShowFilters((v) => !v)}
            >
              Filters{Object.keys(filters).length > 0 ? ` (${Object.keys(filters).length})` : ''}
            </button>
            {Object.keys(filters).length > 0 && (
              <button className="btn" onClick={() => setFilters({})}>Clear filters</button>
            )}
          </div>
        </div>
      )}

      {msg && (
        <div className={`toast ${msg.type}`} role="status">
          <span>{msg.text}</span>
          <button className="toast-close" onClick={() => setMsg(null)} aria-label="Dismiss">×</button>
        </div>
      )}

      <div className="main">
        {!hasFile ? (
          <div className="empty-state">
            <div className="empty-options">
              <div
                className={`option-card dropzone ${dragActive ? 'drag' : ''}`}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
                onDragLeave={() => setDragActive(false)}
                onDrop={onDrop}
              >
                <h2>Open a .dbf file</h2>
                <p>Drop a file here, or click to browse. Schema is read automatically.</p>
              </div>
              <div className="option-divider">or</div>
              <button type="button" className="option-card new-file-card" onClick={() => setShowNewModal(true)}>
                <h2>Create a new file</h2>
                <p>Start from scratch and define your own columns.</p>
              </button>
            </div>
            <p className="tagline">Reads, edits, and generates dBase (.dbf) files entirely in your browser. Nothing you open is ever uploaded.</p>
          </div>
        ) : (
          <DataGrid
            fields={fields!}
            rows={rows}
            onChangeRow={changeCell}
            selected={selected}
            onToggleSelect={toggleSelect}
            onMoveRow={moveRow}
            onReorderRow={reorderRow}
            filters={filters}
            onFiltersChange={setFilters}
            showFilters={showFilters}
          />
        )}
      </div>

      {showNewModal && (
        <NewFileModal onCreate={createNewFile} onClose={() => setShowNewModal(false)} />
      )}
      {showGenerateModal && fields && (
        <GenerateModal
          fields={fields}
          onGenerate={appendGenerated}
          onClose={() => setShowGenerateModal(false)}
        />
      )}
      {showFillColumnModal && fields && (
        <FillColumnModal
          fields={fields}
          rows={rows}
          selected={selected}
          filteredIndices={filteredIndices}
          hasActiveFilters={Object.keys(filters).length > 0}
          onApply={fillColumn}
          onClose={() => setShowFillColumnModal(false)}
        />
      )}
      {showEditSchemaModal && fields && (
        <EditSchemaModal
          fields={fields}
          rows={rows}
          onApply={applySchemaChange}
          onClose={() => setShowEditSchemaModal(false)}
        />
      )}
    </div>
  );
}

export default App;
