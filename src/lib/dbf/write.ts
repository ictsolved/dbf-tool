// Generic dBase III writer -- the reader (read.ts) can already parse any
// schema; this is its counterpart so the tool can create/edit/save files
// of any shape. Supports the field types the editor lets you define:
// C (character), N (numeric), D (date), L (logical).
import type { DbfField, DbfRow } from './types';

function encodeLatin1(str: string): Uint8Array {
  const bytes = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) bytes[i] = str.charCodeAt(i) & 0xff;
  return bytes;
}

function fmtDateYYYYMMDD(d: Date): string {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

export class DbfWriteError extends Error {}

function encodeFieldValue(field: DbfField, value: unknown): string {
  switch (field.type) {
    case 'C': {
      const str = (value ?? '').toString();
      if (str.length > field.length) {
        throw new DbfWriteError(`"${str}" is too long for ${field.name} C(${field.length})`);
      }
      return str.padEnd(field.length, ' ');
    }
    case 'N':
    case 'F': {
      const num = value === null || value === undefined || value === '' ? 0 : Number(value);
      if (Number.isNaN(num)) {
        throw new DbfWriteError(`"${value}" is not a valid number for ${field.name}`);
      }
      const str = num.toFixed(field.decimals || 0);
      if (str.length > field.length) {
        throw new DbfWriteError(
          `${str} doesn't fit in ${field.name} ${field.type}(${field.length},${field.decimals})`,
        );
      }
      return str.padStart(field.length, ' ');
    }
    case 'D': {
      if (!value) return ' '.repeat(field.length); // empty date, dBase convention
      const d = value instanceof Date ? value : new Date(value as string);
      if (Number.isNaN(d.getTime())) {
        throw new DbfWriteError(`"${value}" is not a valid date for ${field.name}`);
      }
      return fmtDateYYYYMMDD(d);
    }
    case 'L':
      return value === true ? 'T' : value === false ? 'F' : '?';
    default:
      return (value ?? '').toString().padEnd(field.length, ' ');
  }
}

export function validateFields(fields: DbfField[]): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const f of fields) {
    if (!f.name || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(f.name)) {
      errors.push(`Field name "${f.name}" is invalid (letters/digits/underscore, must not start with a digit).`);
    }
    if (f.name.length > 10) errors.push(`Field name "${f.name}" is longer than 10 characters.`);
    const key = f.name.toUpperCase();
    if (seen.has(key)) errors.push(`Duplicate field name "${f.name}".`);
    seen.add(key);
    if (f.length < 1) errors.push(`Field "${f.name}" must have a length of at least 1.`);
    if ((f.type === 'N' || f.type === 'F') && f.decimals > 0 && f.decimals >= f.length) {
      errors.push(`Field "${f.name}": decimals (${f.decimals}) must be less than length (${f.length}).`);
    }
  }
  if (fields.length === 0) errors.push('At least one field is required.');
  return errors;
}

export function writeDbf(fields: DbfField[], rows: DbfRow[]): Uint8Array {
  const fieldErrors = validateFields(fields);
  if (fieldErrors.length > 0) throw new DbfWriteError(fieldErrors.join(' '));

  const headerSize = 32 + fields.length * 32 + 1;
  const recordLength = 1 + fields.reduce((s, f) => s + f.length, 0);
  const fileSize = headerSize + recordLength * rows.length + 1; // +1 EOF marker
  const buf = new Uint8Array(fileSize);
  const view = new DataView(buf.buffer);

  buf[0] = 0x03; // dBase III, no memo
  const now = new Date();
  buf[1] = now.getFullYear() - 1900;
  buf[2] = now.getMonth() + 1;
  buf[3] = now.getDate();
  view.setUint32(4, rows.length, true);
  view.setUint16(8, headerSize, true);
  view.setUint16(10, recordLength, true);

  let offset = 32;
  for (const f of fields) {
    buf.set(encodeLatin1(f.name.slice(0, 10)), offset);
    buf[offset + 11] = f.type.charCodeAt(0);
    buf[offset + 16] = f.length;
    buf[offset + 17] = f.decimals || 0;
    offset += 32;
  }
  buf[offset] = 0x0d;
  offset += 1;

  rows.forEach((row, rowIndex) => {
    buf[offset] = 0x20; // not deleted
    offset += 1;
    for (const f of fields) {
      let str: string;
      try {
        str = encodeFieldValue(f, row[f.name]);
      } catch (e) {
        if (e instanceof DbfWriteError) {
          throw new DbfWriteError(`Row ${rowIndex + 1}: ${e.message}`);
        }
        throw e;
      }
      buf.set(encodeLatin1(str), offset);
      offset += f.length;
    }
  });
  buf[offset] = 0x1a; // EOF marker

  return buf;
}

export function downloadDbf(bytes: Uint8Array, filename: string): void {
  const blob = new Blob([bytes.slice()], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.toLowerCase().endsWith('.dbf') ? filename : `${filename}.dbf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
