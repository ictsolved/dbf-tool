import { useMemo, useState } from 'react';
import type { DbfField, DbfRow } from '../lib/dbf/types';
import { plural } from '../lib/plural';
import { cellToText as cellToInputValue, filterRowIndices, type FilterCondition, type RowFilters } from '../lib/dbf/filter';
import { ColumnFilter } from './ColumnFilter';

const PAGE_SIZE = 100;

function inputValueToCell(field: DbfField, raw: string): unknown {
  if (field.type === 'D') {
    if (!raw) return null;
    const [y, m, d] = raw.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  if (field.type === 'N' || field.type === 'F') {
    return raw === '' ? 0 : Number(raw);
  }
  if (field.type === 'L') {
    return raw.toUpperCase() === 'T' || raw.toUpperCase() === 'Y';
  }
  return raw;
}

function compareValues(a: unknown, b: unknown, field: DbfField): number {
  if (a === b) return 0;
  if (a === null || a === undefined) return -1;
  if (b === null || b === undefined) return 1;
  if (field.type === 'D') return (a as Date).getTime() - (b as Date).getTime();
  if (field.type === 'N' || field.type === 'F') return (a as number) - (b as number);
  if (field.type === 'L') return (a === b ? 0 : a ? 1 : -1);
  return String(a).localeCompare(String(b));
}

type SortDir = 'asc' | 'desc';

export function DataGrid({
  fields,
  rows,
  onChangeRow,
  selected,
  onToggleSelect,
  onMoveRow,
  onReorderRow,
  filters,
  onFiltersChange,
  showFilters,
}: {
  fields: DbfField[];
  rows: DbfRow[];
  onChangeRow: (rowIndex: number, field: string, value: unknown) => void;
  selected: Set<number>;
  onToggleSelect: (rowIndex: number) => void;
  onMoveRow: (indexA: number, indexB: number) => void;
  onReorderRow: (fromIndex: number, toIndex: number) => void;
  filters: RowFilters;
  onFiltersChange: (filters: RowFilters) => void;
  showFilters: boolean;
}) {
  const [page, setPage] = useState(0);
  const [sort, setSort] = useState<{ field: string; dir: SortDir } | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // Every filtered/sorted/paginated row still carries its position in the
  // original `rows` array -- that original index is what onChangeRow/
  // onToggleSelect/onMoveRow operate on, so editing, selection, and reorder
  // all stay correct no matter what's currently visible or in what order.
  const viewIndices = useMemo(() => {
    let indices = filterRowIndices(rows, fields, filters);

    if (sort) {
      const field = fields.find((f) => f.name === sort.field);
      if (field) {
        indices = indices.slice().sort((ia, ib) => {
          const cmp = compareValues(rows[ia][sort.field], rows[ib][sort.field], field);
          return sort.dir === 'asc' ? cmp : -cmp;
        });
      }
    }

    return indices;
  }, [rows, fields, filters, sort]);

  const pageCount = Math.max(1, Math.ceil(viewIndices.length / PAGE_SIZE));
  const clampedPage = Math.min(page, pageCount - 1);
  const pageIndices = useMemo(
    () => viewIndices.slice(clampedPage * PAGE_SIZE, clampedPage * PAGE_SIZE + PAGE_SIZE),
    [viewIndices, clampedPage],
  );

  // Manual reordering only makes sense against the file's own row order --
  // while a sort is active the view re-derives its order from cell values
  // every render, so a swap would just be sorted right back into place.
  const canReorder = sort === null;

  const toggleSort = (fieldName: string) => {
    setSort((prev) => {
      if (!prev || prev.field !== fieldName) return { field: fieldName, dir: 'asc' };
      if (prev.dir === 'asc') return { field: fieldName, dir: 'desc' };
      return null;
    });
  };

  const setFieldFilter = (fieldName: string, condition: FilterCondition | null) => {
    const next = { ...filters };
    if (condition === null) delete next[fieldName];
    else next[fieldName] = condition;
    onFiltersChange(next);
    setPage(0);
  };

  // A plain CSS Grid (not a <table>) so the frozen left rail (checkbox/
  // drag/#) and the sticky header row can both use position:sticky at
  // once -- native <table> cells have a long-standing Chrome/Firefox bug
  // where sticky th/td don't respect z-index against each other once both
  // a sticky row and a sticky column are in play, letting scrolled content
  // paint through the frozen rail. Plain grid items don't have that bug.
  const gridTemplateColumns =
    `var(--select-col-w) var(--move-col-w) minmax(44px, max-content) ` +
    fields.map(() => 'minmax(120px, max-content)').join(' ');

  return (
    <>
      <div className="grid-wrap">
        <div className="data-grid" role="table" style={{ gridTemplateColumns }}>
          <>
            <div className="cell select-cell head" role="columnheader"></div>
            <div className="cell move-cell head" role="columnheader"></div>
            <div className="cell row-num head" role="columnheader">#</div>
            {fields.map((f) => (
              <div key={f.name} className="cell head sortable" role="columnheader" onClick={() => toggleSort(f.name)}>
                {f.name}
                <span className="type-tag">{f.type}({f.length}{f.decimals ? `,${f.decimals}` : ''})</span>
                {sort?.field === f.name && <span className="sort-arrow">{sort.dir === 'asc' ? ' ▲' : ' ▼'}</span>}
              </div>
            ))}
          </>
          {showFilters && (
            <>
              <div className="cell select-cell head filter-head" role="columnheader"></div>
              <div className="cell move-cell head filter-head" role="columnheader"></div>
              <div className="cell row-num head filter-head" role="columnheader"></div>
              {fields.map((f) => (
                <div key={f.name} className="cell head filter-head" role="columnheader">
                  <ColumnFilter
                    field={f}
                    condition={filters[f.name]}
                    onChange={(condition) => setFieldFilter(f.name, condition)}
                  />
                </div>
              ))}
            </>
          )}

          {pageIndices.map((originalIndex, i) => {
            const viewPos = clampedPage * PAGE_SIZE + i;
            const row = rows[originalIndex];
            const upTarget = viewPos > 0 ? viewIndices[viewPos - 1] : null;
            const downTarget = viewPos < viewIndices.length - 1 ? viewIndices[viewPos + 1] : null;
            return (
              <div
                key={originalIndex}
                className={[
                  'row',
                  viewPos % 2 === 1 ? 'odd' : '',
                  selected.has(originalIndex) ? 'selected' : '',
                  dragOverIndex === originalIndex ? 'drag-over' : '',
                ].filter(Boolean).join(' ')}
                role="row"
                onDragOver={(e) => {
                  if (!canReorder || dragIndex === null) return;
                  e.preventDefault();
                  setDragOverIndex(originalIndex);
                }}
                onDragLeave={() => setDragOverIndex((prev) => (prev === originalIndex ? null : prev))}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOverIndex(null);
                  if (dragIndex !== null && dragIndex !== originalIndex) onReorderRow(dragIndex, originalIndex);
                  setDragIndex(null);
                }}
              >
                <div className="cell select-cell" role="gridcell">
                  <input
                    type="checkbox"
                    checked={selected.has(originalIndex)}
                    onChange={() => onToggleSelect(originalIndex)}
                  />
                </div>
                <div className="cell move-cell" role="gridcell">
                  <span
                    className="drag-handle"
                    draggable={canReorder}
                    onDragStart={() => setDragIndex(originalIndex)}
                    onDragEnd={() => { setDragIndex(null); setDragOverIndex(null); }}
                    title={canReorder ? 'Drag to reorder' : 'Clear sort to reorder rows'}
                    aria-hidden="true"
                  >⠿</span>
                  <span className="move-arrows">
                    <button
                      type="button"
                      className="move-btn"
                      disabled={!canReorder || upTarget === null}
                      title={canReorder ? 'Move up' : 'Clear sort to reorder rows'}
                      onClick={() => upTarget !== null && onMoveRow(originalIndex, upTarget)}
                      aria-label="Move row up"
                    >▲</button>
                    <button
                      type="button"
                      className="move-btn"
                      disabled={!canReorder || downTarget === null}
                      title={canReorder ? 'Move down' : 'Clear sort to reorder rows'}
                      onClick={() => downTarget !== null && onMoveRow(originalIndex, downTarget)}
                      aria-label="Move row down"
                    >▼</button>
                  </span>
                </div>
                <div className="cell row-num" role="gridcell">{originalIndex + 1}</div>
                {fields.map((f) => (
                  <div key={f.name} className="cell" role="gridcell">
                    <input
                      type={f.type === 'D' ? 'date' : f.type === 'N' || f.type === 'F' ? 'number' : 'text'}
                      step={f.decimals ? 1 / 10 ** f.decimals : undefined}
                      value={cellToInputValue(f, row[f.name])}
                      onChange={(e) => onChangeRow(originalIndex, f.name, inputValueToCell(f, e.target.value))}
                    />
                  </div>
                ))}
              </div>
            );
          })}
          {viewIndices.length === 0 && (
            <div className="row" role="row">
              <div className="cell empty-cell" role="gridcell" style={{ gridColumn: '1 / -1', padding: 20, justifyContent: 'center', color: 'var(--muted)' }}>
                {rows.length === 0 ? 'No rows yet.' : 'No rows match the current filters.'}
              </div>
            </div>
          )}
        </div>
      </div>
      {viewIndices.length > PAGE_SIZE && (
        <div className="pagination">
          <button className="btn small" disabled={clampedPage === 0} onClick={() => setPage((p) => p - 1)}>Prev</button>
          <span>Page {clampedPage + 1} / {pageCount} ({plural(viewIndices.length, 'row')}{viewIndices.length !== rows.length ? ` of ${rows.length}` : ''})</span>
          <button className="btn small" disabled={clampedPage >= pageCount - 1} onClick={() => setPage((p) => p + 1)}>Next</button>
        </div>
      )}
    </>
  );
}
