export type DbfFieldType = 'C' | 'N' | 'D' | 'L' | 'F';

export interface DbfField {
  name: string;
  type: DbfFieldType;
  length: number;
  decimals: number;
}

export type DbfValue = string | number | boolean | Date | null;
export type DbfRow = Record<string, DbfValue>;

export interface DbfTable {
  fields: DbfField[];
  rows: DbfRow[];
}

export const FIELD_TYPE_LABELS: Record<DbfFieldType, string> = {
  C: 'Character',
  N: 'Numeric',
  F: 'Float',
  D: 'Date',
  L: 'Logical',
};

/**
 * A DbfField plus a stable id that only exists in the app's live editing
 * state (never written to a .dbf, which has no concept of field identity
 * beyond its name). This is what lets the schema editor track a field
 * across a rename: the id stays the same while `name` changes, so existing
 * row data can be migrated from the old key to the new one instead of
 * being silently lost.
 */
export interface EditableField extends DbfField {
  id: string;
}

export function makeEditableField(field?: Partial<DbfField>): EditableField {
  return {
    id: crypto.randomUUID(),
    name: field?.name ?? '',
    type: field?.type ?? 'C',
    length: field?.length ?? 10,
    decimals: field?.decimals ?? 0,
  };
}
